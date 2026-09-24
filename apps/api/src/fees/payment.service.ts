import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreatePaymentInput } from "@wellrun/shared";
import { audit } from "../common/audit";
import type { SchoolScope } from "../common/school-scope";
import { nextSchoolNumber } from "../common/sequence";
import { PrismaService } from "../prisma/prisma.service";
import { allocateOldestFirst, computeLateFeePkr, daysLate, invoiceLabel } from "./billing";
import { refreshInvoiceMoney, slimStudent } from "./invoice-writer";
import { addPkr, clampPkr, toPkr } from "./money";

const OPEN = ["ISSUED", "PARTIALLY_PAID", "OVERDUE", "PAID"] as const;

@Injectable()
export class FeePaymentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  invoices(schoolId: string, scope: SchoolScope = {}, query: { status?: string; q?: string } = {}) {
    return this.prisma.invoice
      .findMany({
        where: {
          schoolId,
          ...(query.status && query.status !== "all" ? { status: query.status as never } : { status: { not: "DRAFT" } }),
          AND: [
            scope.campusId
              ? { OR: [{ campusId: scope.campusId }, { student: { campusId: scope.campusId } }, { application: { campusId: scope.campusId } }] }
              : {},
            scope.yearId
              ? { OR: [{ academicYearId: scope.yearId }, { academicYearId: null, feePlan: { yearId: scope.yearId } }] }
              : {},
          ],
        },
        include: {
          student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
          application: { select: { id: true, firstName: true, lastName: true, applicationNo: true } },
          feePlan: { select: { name: true } },
          items: { select: { description: true }, take: 1 },
          payments: { where: { status: "COMPLETED" }, select: { id: true, amountPkr: true } },
        },
        orderBy: { dueOn: "desc" },
        take: 500,
      })
      .then((rows) =>
        rows.map((invoice) => ({
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          billingPeriod: invoice.billingPeriod,
          amountPkr: invoice.amountPkr,
          totalAmountPkr: invoice.totalAmountPkr || invoice.amountPkr,
          paidAmountPkr: invoice.paidAmountPkr || invoice.payments.reduce((sum, p) => sum + p.amountPkr, 0),
          balanceAmountPkr: invoice.balanceAmountPkr || Math.max(invoice.amountPkr - invoice.payments.reduce((sum, p) => sum + p.amountPkr, 0), 0),
          status: invoice.status,
          dueOn: invoice.dueOn,
          student: slimStudent(invoice.student),
          application: invoice.application,
          feePlan: { name: invoiceLabel(invoice) },
          payments: invoice.payments,
        })),
      );
  }

  async invoice(schoolId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, schoolId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        application: { select: { id: true, firstName: true, lastName: true, applicationNo: true } },
        feePlan: { select: { name: true } },
        items: { orderBy: { createdAt: "asc" } },
        allocations: { include: { payment: { select: { id: true, paymentNumber: true, amountPkr: true, method: true, status: true, paymentDate: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return invoice;
  }

  payments(schoolId: string, scope: SchoolScope = {}) {
    return this.prisma.payment.findMany({
      where: {
        schoolId,
        ...(scope.campusId
          ? { OR: [{ campusId: scope.campusId }, { campusId: null, student: { campusId: scope.campusId } }] }
          : {}),
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        allocations: { include: { invoice: { select: { id: true, invoiceNumber: true, billingPeriod: true } } } },
        receipt: { select: { id: true, receiptNumber: true } },
      },
      orderBy: { paidAt: "desc" },
      take: 300,
    });
  }

  async pay(schoolId: string, actorId: string, input: CreatePaymentInput) {
    const amount = toPkr(input.amountPkr);
    if (amount <= 0) throw new BadRequestException("Enter a payment amount");
    const settings = await this.prisma.schoolFeeSettings.upsert({
      where: { schoolId },
      create: { schoolId },
      update: {},
    });
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
          status: { in: [...OPEN] },
          ...(invoiceIds.length ? { id: { in: invoiceIds } } : input.studentId ? { studentId: input.studentId } : {}),
        },
        include: { allocations: { include: { payment: { select: { status: true } } } }, student: true },
        orderBy: { dueOn: "asc" },
      });
      if (!open.length) throw new NotFoundException("No open invoices found");
      const studentId = input.studentId || open[0].studentId;
      if (!studentId) throw new BadRequestException("Payment must belong to a student");
      if (open.some((row) => row.studentId && row.studentId !== studentId)) {
        throw new BadRequestException("All invoices must belong to the same student");
      }
      const asOf = input.paymentDate ? new Date(input.paymentDate) : new Date();
      const withLate = [];
      for (const invoice of open) {
        const due = invoice.dueDate ?? invoice.dueOn;
        const late = computeLateFeePkr({
          mode: settings.lateFeeMode,
          amountPkr: settings.lateFeeAmountPkr,
          percent: settings.lateFeePercent,
          capPkr: settings.lateFeeCapPkr,
          daysLate: daysLate(due, asOf, settings.graceDays),
          baseAmountPkr: invoice.subtotalPkr || invoice.amountPkr,
        });
        if (late && invoice.lateFeeAmountPkr !== late) {
          await refreshInvoiceMoney(tx, invoice.id, { lateFeeAmountPkr: late });
        }
        const refreshed = await tx.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
        withLate.push(refreshed);
      }
      const balances = withLate
        .filter((row) => row.balanceAmountPkr > 0 && row.status !== "PAID" && row.status !== "CANCELLED")
        .map((row) => ({ id: row.id, balancePkr: row.balanceAmountPkr || row.amountPkr - row.paidAmountPkr }));
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
          paidAt: asOf,
          allocations: { create: allocations },
        },
        include: {
          allocations: true,
          invoice: { include: { student: true, feePlan: true, application: true, items: true } },
          student: true,
          school: true,
        },
      });
      await tx.receipt.create({
        data: {
          schoolId,
          campusId,
          studentId,
          paymentId: created.id,
          receiptNumber,
          receiptDate: asOf,
          amountPkr: amount,
          generatedById: actorId,
        },
      });
      for (const allocation of allocations) {
        await refreshInvoiceMoney(tx, allocation.invoiceId);
      }
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
      return created;
    });
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
    const invoice = await this.prisma.invoice.findFirst({ where: { id, schoolId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.paidAmountPkr > 0) throw new BadRequestException("Void payments before cancelling this invoice");
    const updated = await this.prisma.invoice.update({
      where: { id },
      data: { status: "CANCELLED", notes: notes?.trim() || invoice.notes },
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
