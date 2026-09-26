import type { Prisma } from "@prisma/client";
import { addPkr } from "./money";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function periodLabel(billingPeriod: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(billingPeriod ?? "");
  if (!match) return "";
  return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

export function invoiceTitle(invoice: { billingPeriod: string; notes?: string | null; applicationId?: string | null; items?: { description: string }[] }) {
  const period = periodLabel(invoice.billingPeriod);
  if (period) return `Monthly fee · ${period}`;
  if (invoice.billingPeriod.startsWith("ADM-") || invoice.applicationId) return "Admission fee";
  return invoice.items?.[0]?.description || "Fee";
}

export const invoiceViewInclude = {
  items: { orderBy: { createdAt: "asc" } },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      enrollments: { where: { active: true }, select: { class: { select: { name: true, section: true } } }, take: 1 },
    },
  },
  allocations: {
    include: {
      payment: {
        select: {
          id: true,
          paymentNumber: true,
          amountPkr: true,
          method: true,
          status: true,
          paymentDate: true,
          referenceNumber: true,
          receipt: { select: { id: true, receiptNumber: true } },
        },
      },
    },
  },
} satisfies Prisma.InvoiceInclude;

export type InvoiceWithView = Prisma.InvoiceGetPayload<{ include: typeof invoiceViewInclude }>;

export function studentSummary(student: InvoiceWithView["student"]) {
  if (!student) return null;
  const cls = student.enrollments[0]?.class ?? null;
  return {
    id: student.id,
    name: `${student.firstName} ${student.lastName}`,
    admissionNo: student.admissionNo,
    className: cls?.name ?? "",
    section: cls?.section ?? "",
  };
}

/** One shape for an invoice everywhere the console shows it: lines at gross, discount as one line, credit/cash payments split out. */
export function toInvoiceView(invoice: InvoiceWithView) {
  const completed = invoice.allocations.filter((row) => row.payment.status === "COMPLETED");
  const creditAppliedPkr = addPkr(...completed.filter((row) => row.payment.method === "credit").map((row) => row.amountPkr));
  const paidPkr = addPkr(...completed.filter((row) => row.payment.method !== "credit").map((row) => row.amountPkr));
  const totalPkr = invoice.totalAmountPkr || invoice.amountPkr;
  const dueOn = invoice.dueDate ?? invoice.dueOn;
  // The nightly job flips ISSUED → OVERDUE; show it as overdue the moment the due date passes anyway.
  const status = invoice.status === "ISSUED" && invoice.balanceAmountPkr > 0 && dueOn < startOfToday() ? "OVERDUE" : invoice.status;
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    title: invoiceTitle(invoice),
    billingPeriod: invoice.billingPeriod,
    periodLabel: periodLabel(invoice.billingPeriod),
    kind: periodLabel(invoice.billingPeriod) ? ("monthly" as const) : ("other" as const),
    issueDate: invoice.issueDate,
    dueOn,
    status,
    lines: invoice.items.map((item) => ({ description: item.description, amountPkr: item.grossAmountPkr })),
    subtotalPkr: invoice.subtotalPkr || addPkr(...invoice.items.map((item) => item.grossAmountPkr)),
    discountPkr: invoice.discountAmountPkr,
    lateFeePkr: invoice.lateFeeAmountPkr,
    totalPkr,
    creditAppliedPkr,
    paidPkr,
    balancePkr: invoice.status === "CANCELLED" ? 0 : invoice.balanceAmountPkr,
    student: studentSummary(invoice.student),
    payments: invoice.allocations.map((row) => ({
      id: row.payment.id,
      paymentNumber: row.payment.paymentNumber,
      appliedPkr: row.amountPkr,
      amountPkr: row.payment.amountPkr,
      method: row.payment.method,
      status: row.payment.status,
      paymentDate: row.payment.paymentDate,
      referenceNumber: row.payment.referenceNumber,
      receiptId: row.payment.receipt?.id ?? null,
      receiptNumber: row.payment.receipt?.receiptNumber ?? null,
    })),
  };
}

export type InvoiceView = ReturnType<typeof toInvoiceView>;
