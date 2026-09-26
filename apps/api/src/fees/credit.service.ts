import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { applyCreditSchema } from "@wellrun/shared";
import type { z } from "zod";
import { audit } from "../common/audit";
import { nextSchoolNumber } from "../common/sequence";
import { PrismaService } from "../prisma/prisma.service";
import { allocateOldestFirst } from "./billing";
import { refreshInvoiceMoney, slimStudent } from "./invoice-writer";
import { minPkr, toPkr } from "./money";

type ApplyCreditInput = z.infer<typeof applyCreditSchema>;

/**
 * Uses a student's unused credit (e.g. an earlier overpayment) against a newly issued invoice, oldest credit first.
 * Recorded as a "credit" payment so the invoice shows: Fee 5,200 · Credit −800 · Payable 4,400.
 */
export async function applyAvailableCredit(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; studentId: string; invoiceId: string; actorId: string | null },
) {
  const credits = await tx.studentCredit.findMany({
    where: { schoolId: input.schoolId, studentId: input.studentId, remainingAmountPkr: { gt: 0 }, status: { in: ["AVAILABLE", "PARTIALLY_USED"] } },
    orderBy: { createdAt: "asc" },
  });
  if (!credits.length) return 0;
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: input.invoiceId } });
  let due = invoice.balanceAmountPkr;
  let applied = 0;
  for (const credit of credits) {
    if (due <= 0) break;
    const take = Math.min(credit.remainingAmountPkr, due);
    const remaining = credit.remainingAmountPkr - take;
    await tx.studentCredit.update({
      where: { id: credit.id },
      data: { remainingAmountPkr: remaining, status: remaining <= 0 ? "USED" : "PARTIALLY_USED" },
    });
    due -= take;
    applied += take;
  }
  if (applied <= 0) return 0;
  const paymentNumber = await nextSchoolNumber(tx, input.schoolId, "PAY");
  await tx.payment.create({
    data: {
      schoolId: input.schoolId,
      campusId: invoice.campusId,
      studentId: input.studentId,
      invoiceId: invoice.id,
      paymentNumber,
      amountPkr: applied,
      method: "credit",
      notes: "Credit carried forward from an earlier payment",
      collectedById: input.actorId,
      status: "COMPLETED",
      receiptNo: paymentNumber,
      allocations: { create: [{ invoiceId: invoice.id, amountPkr: applied }] },
    },
  });
  await refreshInvoiceMoney(tx, invoice.id);
  return applied;
}

@Injectable()
export class FeeCreditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(schoolId: string, studentId?: string) {
    return this.prisma.studentCredit
      .findMany({
        where: {
          schoolId,
          ...(studentId ? { studentId } : {}),
          remainingAmountPkr: { gt: 0 },
        },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
        orderBy: { createdAt: "desc" },
      })
      .then((rows) => rows.map((row) => ({ ...row, student: slimStudent(row.student) })));
  }

  async apply(schoolId: string, actorId: string, input: ApplyCreditInput) {
    const credit = await this.prisma.studentCredit.findFirst({
      where: { id: input.creditId, schoolId, studentId: input.studentId },
    });
    if (!credit) throw new NotFoundException("Credit not found");
    if (credit.remainingAmountPkr <= 0) throw new BadRequestException("This credit has already been used");
    const amount = minPkr(input.amountPkr ?? credit.remainingAmountPkr, credit.remainingAmountPkr);
    if (amount <= 0) throw new BadRequestException("Enter an amount to apply");
    await this.prisma.$transaction(async (tx) => {
      const invoices = await tx.invoice.findMany({
        where: {
          schoolId,
          studentId: input.studentId,
          status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
          ...(input.invoiceId ? { id: input.invoiceId } : {}),
        },
        orderBy: { dueOn: "asc" },
      });
      const open = invoices
        .map((row) => ({ id: row.id, balancePkr: row.balanceAmountPkr || Math.max(row.amountPkr - row.paidAmountPkr, 0) }))
        .filter((row) => row.balancePkr > 0);
      const { allocations, leftoverPkr } = allocateOldestFirst(open, amount);
      if (!allocations.length) throw new BadRequestException("No open invoices to apply this credit");
      const applied = amount - leftoverPkr;
      const paymentNumber = await nextSchoolNumber(tx, schoolId, "PAY");
      const payment = await tx.payment.create({
        data: {
          schoolId,
          studentId: input.studentId,
          invoiceId: allocations[0].invoiceId,
          paymentNumber,
          amountPkr: applied,
          method: "credit",
          notes: "Applied student credit",
          collectedById: actorId,
          status: "COMPLETED",
          receiptNo: paymentNumber,
          allocations: { create: allocations },
        },
      });
      for (const allocation of allocations) {
        await refreshInvoiceMoney(tx, allocation.invoiceId);
      }
      const remaining = credit.remainingAmountPkr - applied;
      await tx.studentCredit.update({
        where: { id: credit.id },
        data: {
          remainingAmountPkr: remaining,
          status: remaining <= 0 ? "USED" : "PARTIALLY_USED",
        },
      });
      void payment;
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "credit_applied",
      entity: "student_credit",
      entityId: credit.id,
      summary: `${toPkr(amount)} applied`,
    });
    return this.prisma.studentCredit.findUniqueOrThrow({ where: { id: credit.id } });
  }
}
