import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CreatePaymentInput } from "@wellrun/shared";
import { audit } from "../common/audit";
import { schoolLetterhead } from "../common/school";
import type { SchoolScope } from "../common/school-scope";
import { nextSchoolNumber } from "../common/sequence";
import { PrismaService } from "../prisma/prisma.service";
import { allocateOldestFirst } from "./billing";
import { applyCreditToInvoices } from "./credit.service";
import { refreshInvoiceMoney, slimStudent } from "./invoice-writer";
import { invoiceViewInclude, periodLabel, toInvoiceView } from "./invoice-view";
import { clampPkr, toPkr } from "./money";

const PAYABLE = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;

export type InvoiceListQuery = {
  status?: string;
  q?: string;
  studentId?: string;
  billingPeriod?: string;
  className?: string;
  section?: string;
  /** Which academic years: the one being viewed (default), earlier ones only, or every year. */
  years?: "this" | "previous" | "all";
};

@Injectable()
export class FeePaymentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async invoices(schoolId: string, scope: SchoolScope = {}, query: InvoiceListQuery = {}) {
    const q = query.q?.trim();
    const status =
      query.status === "unpaid"
        ? { in: [...PAYABLE] }
        : query.status && query.status !== "all"
          ? (query.status as never)
          : { not: "DRAFT" as const };
    const yearFilter = await this.yearFilter(schoolId, scope, query);
    const rows = await this.prisma.invoice.findMany({
      where: {
        schoolId,
        status,
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.billingPeriod ? { billingPeriod: query.billingPeriod } : {}),
        AND: [
          scope.campusId
            ? { OR: [{ campusId: scope.campusId }, { student: { campusId: scope.campusId } }, { application: { campusId: scope.campusId } }] }
            : {},
          yearFilter,
          query.className || query.section
            ? {
                student: {
                  enrollments: {
                    some: {
                      active: true,
                      class: {
                        ...(query.className ? { name: query.className } : {}),
                        ...(query.section ? { section: query.section } : {}),
                      },
                    },
                  },
                },
              }
            : {},
          q
            ? {
                OR: [
                  { invoiceNumber: { contains: q, mode: "insensitive" } },
                  { student: { firstName: { contains: q, mode: "insensitive" } } },
                  { student: { lastName: { contains: q, mode: "insensitive" } } },
                  { student: { admissionNo: { contains: q, mode: "insensitive" } } },
                ],
              }
            : {},
        ],
      },
      include: invoiceViewInclude,
      orderBy: [{ dueOn: "desc" }, { invoiceNumber: "desc" }],
      take: 300,
    });
    const yearIds = [...new Set(rows.map((row) => row.academicYearId).filter((id): id is string => Boolean(id)))];
    const yearNames = new Map(
      (yearIds.length ? await this.prisma.academicYear.findMany({ where: { id: { in: yearIds } }, select: { id: true, name: true } }) : []).map((y) => [y.id, y.name]),
    );
    return rows.map((row) => {
      const view = toInvoiceView(row);
      return {
        id: view.id,
        yearName: row.academicYearId ? (yearNames.get(row.academicYearId) ?? null) : null,
        invoiceNumber: view.invoiceNumber,
        title: view.title,
        periodLabel: view.periodLabel,
        dueOn: view.dueOn,
        status: view.status,
        totalPkr: view.totalPkr,
        paidPkr: view.paidPkr + view.creditAppliedPkr,
        balancePkr: view.balancePkr,
        student: view.student,
      };
    });
  }

  private async yearFilter(schoolId: string, scope: SchoolScope, query: InvoiceListQuery): Promise<Prisma.InvoiceWhereInput> {
    if (query.studentId || query.years === "all" || !scope.yearId) return {};
    if (query.years === "previous") {
      const viewed = await this.prisma.academicYear.findFirst({ where: { id: scope.yearId, schoolId }, select: { startsOn: true } });
      return viewed ? { year: { startsOn: { lt: viewed.startsOn } } } : {};
    }
    return { OR: [{ academicYearId: scope.yearId }, { academicYearId: null, feePlan: { yearId: scope.yearId } }] };
  }

  /** Everything the invoice document needs: the invoice itself, the school letterhead, and the guardian. */
  async invoice(schoolId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({ where: { id, schoolId }, include: invoiceViewInclude });
    if (!invoice) throw new NotFoundException("Invoice not found");
    const [school, guardian] = await Promise.all([
      this.schoolHeader(schoolId),
      invoice.studentId ? this.primaryGuardian(invoice.studentId) : Promise.resolve(null),
    ]);
    return { ...toInvoiceView(invoice), school, guardian };
  }

  payments(schoolId: string, scope: SchoolScope = {}, query: { studentId?: string; q?: string } = {}) {
    const q = query.q?.trim();
    return this.prisma.payment
      .findMany({
        where: {
          schoolId,
          method: { not: "credit" },
          ...(query.studentId ? { studentId: query.studentId } : {}),
          AND: [
            scope.campusId ? { OR: [{ campusId: scope.campusId }, { campusId: null, student: { campusId: scope.campusId } }] } : {},
            q
              ? {
                  OR: [
                    { paymentNumber: { contains: q, mode: "insensitive" } },
                    { receiptNo: { contains: q, mode: "insensitive" } },
                    { student: { firstName: { contains: q, mode: "insensitive" } } },
                    { student: { lastName: { contains: q, mode: "insensitive" } } },
                    { student: { admissionNo: { contains: q, mode: "insensitive" } } },
                  ],
                }
              : {},
          ],
        },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
          allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, billingPeriod: true } } } },
          receipt: { select: { id: true, receiptNumber: true } },
        },
        orderBy: { paidAt: "desc" },
        take: 300,
      })
      .then((rows) =>
        rows.map((row) => ({
          id: row.id,
          paymentNumber: row.paymentNumber,
          paymentDate: row.paymentDate,
          amountPkr: row.amountPkr,
          method: row.method,
          referenceNumber: row.referenceNumber,
          status: row.status,
          student: slimStudent(row.student),
          receipt: row.receipt,
          invoices: row.allocations.map((item) => ({
            id: item.invoice.id,
            invoiceNumber: item.invoice.invoiceNumber,
            periodLabel: periodLabel(item.invoice.billingPeriod),
            appliedPkr: item.amountPkr,
          })),
        })),
      );
  }

  schoolHeader(schoolId: string) {
    return schoolLetterhead(this.prisma, schoolId);
  }

  async primaryGuardian(studentId: string) {
    const link = await this.prisma.studentGuardian.findFirst({
      where: { studentId },
      include: { guardian: { select: { name: true, relation: true, phone: true } } },
    });
    return link?.guardian ?? null;
  }

  /** Sum still owed across the student's invoices — the "balance" a parent sees on a receipt. */
  private async outstandingFor(tx: Prisma.TransactionClient, schoolId: string, studentId: string) {
    const rows = await tx.invoice.findMany({
      where: { schoolId, studentId, status: { in: [...PAYABLE] } },
      select: { balanceAmountPkr: true },
    });
    return rows.reduce((sum, row) => sum + Math.max(row.balanceAmountPkr, 0), 0);
  }

  /** The same answer for a repeated submit (double click / retry) carrying the same requestId. */
  private async existingPaymentResult(schoolId: string, requestId: string) {
    const existing = await this.prisma.payment.findFirst({
      where: { schoolId, requestId },
      include: { receipt: { select: { id: true, receiptNumber: true } }, credits: { select: { amountPkr: true } } },
    });
    if (!existing) return null;
    return {
      creditOnly: false as const,
      id: existing.id,
      paymentNumber: existing.paymentNumber,
      receiptId: existing.receipt?.id ?? "",
      receiptNumber: existing.receipt?.receiptNumber ?? existing.receiptNo,
      amountPkr: existing.amountPkr,
      creditPkr: existing.credits.reduce((sum, row) => sum + row.amountPkr, 0),
      creditAppliedPkr: 0,
    };
  }

  async pay(schoolId: string, actorId: string, input: CreatePaymentInput) {
    if (input.requestId) {
      const repeat = await this.existingPaymentResult(schoolId, input.requestId);
      if (repeat) return repeat;
    }
    try {
      return await this.recordPayment(schoolId, actorId, input);
    } catch (error) {
      // Two identical submits racing: the loser returns the winner's payment.
      if (input.requestId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const repeat = await this.existingPaymentResult(schoolId, input.requestId);
        if (repeat) return repeat;
      }
      throw error;
    }
  }

  private async recordPayment(schoolId: string, actorId: string, input: CreatePaymentInput) {
    const amount = toPkr(input.amountPkr);
    const useCredit = toPkr(input.useCreditPkr ?? 0);
    if (amount <= 0 && useCredit <= 0) throw new BadRequestException("Enter a payment amount");
    const specified = input.allocations?.length
      ? input.allocations
      : input.invoiceId
        ? [{ invoiceId: input.invoiceId, amountPkr: amount }]
        : (input.invoiceIds ?? []).map((invoiceId) => ({ invoiceId, amountPkr: 0 }));
    const invoiceIds = specified.map((row) => row.invoiceId);
    const payment = await this.prisma.$transaction(async (tx) => {
      const open = await tx.invoice.findMany({
        where: {
          schoolId,
          status: { in: [...PAYABLE] },
          ...(invoiceIds.length ? { id: { in: invoiceIds } } : input.studentId ? { studentId: input.studentId } : {}),
        },
        orderBy: { dueOn: "asc" },
      });
      if (!open.length) throw new NotFoundException("This invoice is already paid or cancelled");
      const studentId = input.studentId || open[0].studentId;
      if (!studentId) throw new BadRequestException("Payment must belong to a student");
      if (open.some((row) => row.studentId && row.studentId !== studentId)) {
        throw new BadRequestException("All invoices must belong to the same student");
      }
      const asOf = input.paymentDate ? new Date(input.paymentDate) : new Date();
      const previousBalancePkr = await this.outstandingFor(tx, schoolId, studentId);
      // Credit first, then cash for whatever is still due on the chosen invoices.
      const creditAppliedPkr = useCredit
        ? await applyCreditToInvoices(tx, { schoolId, studentId, invoiceIds: open.map((row) => row.id), maxPkr: useCredit, actorId })
        : 0;
      if (amount <= 0) {
        if (!creditAppliedPkr) throw new BadRequestException("No credit could be applied to these invoices");
        return { creditOnly: true as const, creditAppliedPkr };
      }
      const withLate = creditAppliedPkr
        ? await tx.invoice.findMany({ where: { id: { in: open.map((row) => row.id) } }, orderBy: { dueOn: "asc" } })
        : open;
      const balances = withLate
        .filter((row) => row.balanceAmountPkr > 0 && PAYABLE.includes(row.status as (typeof PAYABLE)[number]))
        .map((row) => ({ id: row.id, balancePkr: row.balanceAmountPkr }));
      let allocations: { invoiceId: string; amountPkr: number }[];
      let leftoverPkr = 0;
      if (specified.some((row) => row.amountPkr > 0) && (input.allocations?.length || (input.invoiceId && !input.invoiceIds))) {
        allocations = [];
        let used = 0;
        for (const row of specified) {
          const invoice = balances.find((item) => item.id === row.invoiceId);
          if (!invoice) throw new BadRequestException("Invoice is not open for payment");
          const take = Math.min(invoice.balancePkr, toPkr(row.amountPkr) || invoice.balancePkr);
          if (take <= 0) continue;
          allocations.push({ invoiceId: invoice.id, amountPkr: take });
          used += take;
        }
        leftoverPkr = clampPkr(amount - used);
      } else {
        const target = invoiceIds.length ? balances.filter((row) => invoiceIds.includes(row.id)) : balances;
        const result = allocateOldestFirst(target, amount);
        allocations = result.allocations;
        leftoverPkr = result.leftoverPkr;
      }
      if (!allocations.length) throw new BadRequestException("Nothing to allocate");
      const paymentNumber = await nextSchoolNumber(tx, schoolId, "PAY");
      const receiptNumber = await nextSchoolNumber(tx, schoolId, "REC");
      const campusId = withLate[0].campusId;
      const created = await tx.payment.create({
        data: {
          schoolId,
          campusId,
          studentId,
          invoiceId: allocations[0].invoiceId,
          paymentNumber,
          paymentDate: asOf,
          amountPkr: amount,
          method: input.method || "cash",
          referenceNumber: input.referenceNumber?.trim() ?? "",
          notes: input.notes?.trim() ?? "",
          collectedById: actorId,
          status: "COMPLETED",
          receiptNo: receiptNumber,
          requestId: input.requestId || null,
          paidAt: asOf,
          allocations: { create: allocations },
        },
      });
      for (const allocation of allocations) {
        await refreshInvoiceMoney(tx, allocation.invoiceId);
      }
      const receipt = await tx.receipt.create({
        data: {
          schoolId,
          campusId,
          studentId,
          paymentId: created.id,
          receiptNumber,
          receiptDate: asOf,
          amountPkr: amount,
          previousBalancePkr,
          remainingBalancePkr: await this.outstandingFor(tx, schoolId, studentId),
          generatedById: actorId,
        },
      });
      if (leftoverPkr > 0) {
        await tx.studentCredit.create({
          data: {
            schoolId,
            studentId,
            sourcePaymentId: created.id,
            amountPkr: leftoverPkr,
            remainingAmountPkr: leftoverPkr,
            status: "AVAILABLE",
            reason: "Overpayment",
          },
        });
      }
      const applicationId = withLate.find((row) => row.applicationId)?.applicationId;
      if (applicationId) {
        const application = await tx.admissionApplication.findFirst({
          where: { id: applicationId },
          include: { invoices: true },
        });
        if (application && ["FEE_PENDING", "ACCEPTED", "DOCUMENTS_PENDING"].includes(application.status)) {
          const remaining = application.invoices.reduce((sum, row) => {
            if (row.status === "CANCELLED" || row.status === "DRAFT") return sum;
            return sum + Math.max(row.balanceAmountPkr || row.amountPkr - row.paidAmountPkr, 0);
          }, 0);
          if (remaining <= 0) {
            await tx.admissionApplication.update({
              where: { id: application.id },
              data: { status: "DOCUMENTS_PENDING" },
            });
          }
        }
      }
      return {
        creditOnly: false as const,
        id: created.id,
        paymentNumber,
        receiptId: receipt.id,
        receiptNumber,
        amountPkr: amount,
        creditPkr: leftoverPkr,
        creditAppliedPkr,
      };
    });
    if (payment.creditOnly) {
      await audit(this.prisma, { schoolId, actorId, action: "credit_applied", entity: "student", entityId: input.studentId ?? "", summary: `${payment.creditAppliedPkr}` });
      return payment;
    }
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "payment_collected",
      entity: "payment",
      entityId: payment.id,
      summary: `${payment.paymentNumber} ${amount}`,
    });
    return payment;
  }

  async voidPayment(schoolId: string, actorId: string, id: string, mode: "VOIDED" | "REFUNDED") {
    const existing = await this.prisma.payment.findFirst({
      where: { id, schoolId },
      include: { allocations: true, credits: true },
    });
    if (!existing) throw new NotFoundException("Payment not found");
    if (existing.status !== "COMPLETED") throw new BadRequestException("Only completed payments can be reversed");
    const usedCredit = existing.credits.find((row) => row.remainingAmountPkr < row.amountPkr);
    if (usedCredit) throw new BadRequestException("Reverse applied credit before voiding this payment");
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id }, data: { status: mode } });
      await tx.studentCredit.updateMany({
        where: { sourcePaymentId: id, remainingAmountPkr: { gt: 0 } },
        data: { status: "REFUNDED", remainingAmountPkr: 0 },
      });
      for (const allocation of existing.allocations) {
        await refreshInvoiceMoney(tx, allocation.invoiceId);
      }
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: mode === "REFUNDED" ? "payment_refunded" : "payment_voided",
      entity: "payment",
      entityId: id,
      summary: existing.paymentNumber || existing.receiptNo,
    });
    return this.receipt(schoolId, id);
  }

  async cancelInvoice(schoolId: string, actorId: string, id: string, notes?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, schoolId },
      include: { allocations: { include: { payment: { select: { id: true, method: true, status: true } } } } },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    const completed = invoice.allocations.filter((row) => row.payment.status === "COMPLETED");
    if (completed.some((row) => row.payment.method !== "credit")) {
      throw new BadRequestException("Void the payments on this invoice before cancelling it");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      // Credit that was carried onto this invoice goes back to the student.
      for (const row of completed) {
        await tx.payment.update({ where: { id: row.payment.id }, data: { status: "VOIDED" } });
        if (invoice.studentId && row.amountPkr > 0) {
          await tx.studentCredit.create({
            data: {
              schoolId,
              studentId: invoice.studentId,
              amountPkr: row.amountPkr,
              remainingAmountPkr: row.amountPkr,
              status: "AVAILABLE",
              reason: `Returned from cancelled invoice ${invoice.invoiceNumber}`,
            },
          });
        }
      }
      await refreshInvoiceMoney(tx, id);
      return tx.invoice.update({
        where: { id },
        data: { status: "CANCELLED", balanceAmountPkr: 0, notes: notes?.trim() || invoice.notes },
      });
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "invoice_cancelled",
      entity: "invoice",
      entityId: id,
      summary: invoice.invoiceNumber,
    });
    return updated;
  }

  async receipt(schoolId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, schoolId },
      include: {
        invoice: { include: { student: true, feePlan: true, items: true, application: true } },
        allocations: { include: { invoice: { include: { items: true, feePlan: true } } } },
        student: true,
        school: true,
        receipt: true,
      },
    });
    if (!payment) throw new NotFoundException("Receipt not found");
    return payment;
  }
}
