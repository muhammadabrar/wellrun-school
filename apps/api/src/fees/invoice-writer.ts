import type { Prisma } from "@prisma/client";
import { nextSchoolNumber } from "../common/sequence";
import { totalsFromLines, type BuiltLine, invoiceStatusFromAmounts } from "./billing";
import { addPkr, clampPkr, toPkr } from "./money";

export async function writeInvoiceSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    campusId?: string | null;
    studentId?: string | null;
    applicationId?: string | null;
    academicYearId?: string | null;
    feeStructureId?: string | null;
    feePlanId?: string | null;
    billingPeriod: string;
    issueDate?: Date;
    dueOn: Date;
    notes?: string;
    lines: BuiltLine[];
  },
) {
  const totals = totalsFromLines(input.lines);
  const total = totals.netPkr;
  const invoiceNumber = await nextSchoolNumber(tx, input.schoolId, "INV");
  return tx.invoice.create({
    data: {
      schoolId: input.schoolId,
      campusId: input.campusId ?? undefined,
      studentId: input.studentId ?? undefined,
      applicationId: input.applicationId ?? undefined,
      academicYearId: input.academicYearId ?? undefined,
      feeStructureId: input.feeStructureId ?? undefined,
      feePlanId: input.feePlanId ?? undefined,
      invoiceNumber,
      billingPeriod: input.billingPeriod,
      issueDate: input.issueDate ?? new Date(),
      dueOn: input.dueOn,
      dueDate: input.dueOn,
      subtotalPkr: totals.subtotalPkr,
      discountAmountPkr: totals.discountAmountPkr,
      lateFeeAmountPkr: 0,
      taxAmountPkr: totals.taxAmountPkr,
      totalAmountPkr: total,
      paidAmountPkr: 0,
      balanceAmountPkr: total,
      amountPkr: total,
      status: "ISSUED",
      notes: input.notes ?? "",
      items: {
        create: input.lines.map((line) => ({
          feeHeadId: line.feeHeadId,
          description: line.description,
          quantity: line.quantity,
          unitAmountPkr: line.unitAmountPkr,
          grossAmountPkr: line.grossAmountPkr,
          discountAmountPkr: line.discountAmountPkr,
          taxAmountPkr: line.taxAmountPkr,
          netAmountPkr: line.netAmountPkr,
        })),
      },
      fbrInvoice: { create: { schoolId: input.schoolId, fbrStatus: "NOT_REQUIRED" } },
    },
    include: { items: true },
  });
}

export async function refreshInvoiceMoney(
  tx: Prisma.TransactionClient,
  invoiceId: string,
  extra?: { lateFeeAmountPkr?: number },
) {
  const invoice = await tx.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      allocations: { include: { payment: { select: { status: true } } } },
    },
  });
  const paid = invoice.allocations
    .filter((row) => row.payment.status === "COMPLETED")
    .reduce((sum, row) => addPkr(sum, row.amountPkr), 0);
  const lateFee = extra?.lateFeeAmountPkr != null ? toPkr(extra.lateFeeAmountPkr) : invoice.lateFeeAmountPkr;
  const total = addPkr(invoice.subtotalPkr - invoice.discountAmountPkr, invoice.taxAmountPkr, lateFee);
  const balance = clampPkr(total - paid);
  const due = invoice.dueDate ?? invoice.dueOn;
  const status =
    invoice.status === "CANCELLED" || invoice.status === "DRAFT"
      ? invoice.status
      : invoiceStatusFromAmounts({ totalPkr: total, paidPkr: paid, dueDate: due, cancelled: false });
  return tx.invoice.update({
    where: { id: invoiceId },
    data: {
      lateFeeAmountPkr: lateFee,
      totalAmountPkr: total,
      amountPkr: total,
      paidAmountPkr: paid,
      balanceAmountPkr: balance,
      status,
    },
  });
}

export function slimStudent(student: { id: string; firstName: string; lastName: string; admissionNo: string } | null) {
  if (!student) return null;
  return { id: student.id, firstName: student.firstName, lastName: student.lastName, admissionNo: student.admissionNo };
}
