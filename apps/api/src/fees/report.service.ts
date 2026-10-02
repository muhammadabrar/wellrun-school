import { Inject, Injectable } from "@nestjs/common";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import { pageParams } from "@wellrun/shared";
import type { SchoolScope } from "../common/school-scope";
import { PrismaService } from "../prisma/prisma.service";
import { invoiceLabel } from "./billing";
import { addPkr } from "./money";
import { slimStudent } from "./invoice-writer";

@Injectable()
export class FeeReportService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async dashboard(schoolId: string, scope: SchoolScope = {}) {
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const paymentWhere = {
      schoolId,
      status: "COMPLETED" as const,
      ...(scope.campusId
        ? { OR: [{ campusId: scope.campusId }, { campusId: null, student: { campusId: scope.campusId } }] }
        : {}),
    };
    const invoiceWhere = {
      schoolId,
      status: { notIn: ["CANCELLED", "DRAFT"] as InvoiceStatus[] },
      AND: [
        scope.campusId
          ? { OR: [{ campusId: scope.campusId }, { campusId: null, student: { campusId: scope.campusId } }] }
          : {},
        scope.yearId
          ? { OR: [{ academicYearId: scope.yearId }, { academicYearId: null, feePlan: { yearId: scope.yearId } }] }
          : {},
      ],
    };
    const [today, month, invoices, recentPayments, overdue, recentReceipts] = await Promise.all([
      this.prisma.payment.aggregate({ where: { ...paymentWhere, paymentDate: { gte: startOfDay } }, _sum: { amountPkr: true } }),
      this.prisma.payment.aggregate({ where: { ...paymentWhere, paymentDate: { gte: startOfMonth } }, _sum: { amountPkr: true } }),
      this.prisma.invoice.findMany({
        where: invoiceWhere,
        select: { status: true, balanceAmountPkr: true, amountPkr: true, paidAmountPkr: true },
      }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
        orderBy: { paidAt: "desc" },
        take: 8,
      }),
      this.prisma.invoice.findMany({
        where: { ...invoiceWhere, status: { in: ["OVERDUE", "ISSUED", "PARTIALLY_PAID"] }, dueOn: { lt: now }, balanceAmountPkr: { gt: 0 } },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } }, items: { take: 1 }, feePlan: true },
        orderBy: { dueOn: "asc" },
        take: 8,
      }),
      this.prisma.receipt.findMany({
        where: {
          schoolId,
          ...(scope.campusId
            ? { OR: [{ campusId: scope.campusId }, { campusId: null, student: { campusId: scope.campusId } }] }
            : {}),
        },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
        orderBy: { receiptDate: "desc" },
        take: 8,
      }),
    ]);
    const previousYears = await this.previousYearsDue(schoolId, scope);
    const outstanding = addPkr(...invoices.map((row) => row.balanceAmountPkr || Math.max(row.amountPkr - row.paidAmountPkr, 0)));
    const overdueAmount = addPkr(
      ...invoices.filter((row) => row.status === "OVERDUE").map((row) => row.balanceAmountPkr || Math.max(row.amountPkr - row.paidAmountPkr, 0)),
    );
    const counts = {
      unpaid: invoices.filter((row) => row.status === "ISSUED" || row.status === "OVERDUE").length,
      partial: invoices.filter((row) => row.status === "PARTIALLY_PAID").length,
      paid: invoices.filter((row) => row.status === "PAID").length,
      overdue: invoices.filter((row) => row.status === "OVERDUE").length,
    };
    return {
      todayPkr: today._sum.amountPkr ?? 0,
      monthPkr: month._sum.amountPkr ?? 0,
      outstandingPkr: outstanding,
      overduePkr: overdueAmount,
      previousYears,
      counts,
      recentPayments: recentPayments.map((row) => ({
        id: row.id,
        amountPkr: row.amountPkr,
        method: row.method,
        paymentDate: row.paymentDate,
        student: slimStudent(row.student),
      })),
      overdueInvoices: overdue.map((row) => ({
        id: row.id,
        name: invoiceLabel(row),
        amountPkr: row.balanceAmountPkr || row.amountPkr,
        dueOn: row.dueOn,
        student: slimStudent(row.student),
      })),
      recentReceipts: recentReceipts.map((row) => ({
        id: row.id,
        receiptNumber: row.receiptNumber,
        amountPkr: row.amountPkr,
        receiptDate: row.receiptDate,
        student: slimStudent(row.student),
      })),
    };
  }

  /** Unpaid balance on invoices from years before the one being viewed — still collectable after a year closes. */
  private async previousYearsDue(schoolId: string, scope: SchoolScope) {
    if (!scope.yearId) return { pkr: 0, invoices: 0 };
    const viewed = await this.prisma.academicYear.findFirst({ where: { id: scope.yearId, schoolId }, select: { startsOn: true } });
    if (!viewed) return { pkr: 0, invoices: 0 };
    const agg = await this.prisma.invoice.aggregate({
      where: {
        schoolId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        year: { startsOn: { lt: viewed.startsOn } },
        ...(scope.campusId ? { OR: [{ campusId: scope.campusId }, { campusId: null, student: { campusId: scope.campusId } }] } : {}),
      },
      _sum: { balanceAmountPkr: true },
      _count: { _all: true },
    });
    return { pkr: agg._sum.balanceAmountPkr ?? 0, invoices: agg._count._all };
  }

  outstanding(schoolId: string, scope: SchoolScope = {}, query: { className?: string; section?: string } = {}) {
    return this.prisma.invoice.findMany({
      where: {
        schoolId,
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        AND: [
          scope.campusId
            ? { OR: [{ campusId: scope.campusId }, { campusId: null, student: { campusId: scope.campusId } }] }
            : {},
          scope.yearId
            ? { OR: [{ academicYearId: scope.yearId }, { academicYearId: null, feePlan: { yearId: scope.yearId } }] }
            : {},
        ],
        ...(query.className || query.section
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
          : {}),
      },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        items: { take: 1, select: { description: true } },
        feePlan: { select: { name: true } },
      },
      orderBy: { dueOn: "asc" },
      take: 500,
    }).then((rows) =>
      rows.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoiceNumber,
        name: invoiceLabel(row),
        billingPeriod: row.billingPeriod,
        dueOn: row.dueOn,
        status: row.status,
        amountPkr: row.amountPkr,
        paidAmountPkr: row.paidAmountPkr,
        balanceAmountPkr: row.balanceAmountPkr || row.amountPkr - row.paidAmountPkr,
        student: slimStudent(row.student),
      })),
    );
  }

  async reports(
    schoolId: string,
    scope: SchoolScope = {},
    query: { from?: string; to?: string; className?: string; section?: string; feeHeadId?: string; method?: string; page?: string; pageSize?: string } = {},
  ) {
    const { page, pageSize, skip, take } = pageParams(query);
    // Date inputs are plain days: the range runs from the start of "from" to the end of "to", Pakistan time.
    const from = query.from ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.from) ? `${query.from}T00:00:00+05:00` : query.from) : new Date(Date.now() - 30 * 86_400_000);
    const to = query.to ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(query.to) ? `${query.to}T23:59:59.999+05:00` : query.to) : new Date();
    const where: Prisma.PaymentWhereInput = {
      schoolId,
      status: "COMPLETED",
      paymentDate: { gte: from, lte: to },
      ...(scope.campusId
        ? { OR: [{ campusId: scope.campusId }, { campusId: null, student: { campusId: scope.campusId } }] }
        : {}),
      ...(query.method ? { method: query.method } : {}),
      ...(query.feeHeadId ? { allocations: { some: { invoice: { items: { some: { feeHeadId: query.feeHeadId } } } } } } : {}),
      ...(query.className || query.section
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
        : {}),
    };
    // Totals cover the whole range; only the rows are paged.
    const [total, sum, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.aggregate({ where, _sum: { amountPkr: true } }),
      this.prisma.payment.findMany({
        where,
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
        orderBy: [{ paymentDate: "desc" }, { id: "desc" }],
        skip,
        take,
      }),
    ]);
    return {
      from,
      to,
      totalPkr: sum._sum.amountPkr ?? 0,
      count: total,
      items: payments.map((row) => ({
        id: row.id,
        paymentNumber: row.paymentNumber,
        paymentDate: row.paymentDate,
        method: row.method,
        amountPkr: row.amountPkr,
        student: slimStudent(row.student),
      })),
      total,
      page,
      pageSize,
    };
  }

  async studentLedger(schoolId: string, studentId: string) {
    const [invoices, payments, credits, assignment, discounts] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { schoolId, studentId, status: { not: "DRAFT" } },
        include: { items: true, feePlan: true, allocations: { include: { payment: { select: { id: true, receiptNo: true, status: true } } } } },
        orderBy: { dueOn: "desc" },
      }),
      this.prisma.payment.findMany({
        where: { schoolId, studentId },
        include: { receipt: true, allocations: true },
        orderBy: { paidAt: "desc" },
      }),
      this.prisma.studentCredit.findMany({ where: { schoolId, studentId }, orderBy: { createdAt: "desc" } }),
      this.prisma.studentFeeAssignment.findFirst({
        where: { schoolId, studentId, status: "ACTIVE" },
        include: { structure: { select: { id: true, name: true } }, overrides: true },
      }),
      this.prisma.studentDiscount.findMany({ where: { schoolId, studentId, active: true } }),
    ]);
    const OPEN_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"];
    const current =
      [...invoices]
        .filter((row) => OPEN_STATUSES.includes(row.status))
        .sort((a, b) => new Date(a.dueOn).getTime() - new Date(b.dueOn).getTime())[0] ?? null;
    const balancePkr = addPkr(...invoices.filter((row) => row.status !== "CANCELLED").map((row) => row.balanceAmountPkr || 0));
    const ledger = [
      ...invoices.map((row) => ({
        id: row.id,
        at: row.issueDate,
        kind: "invoice" as const,
        label: invoiceLabel(row),
        debitPkr: row.totalAmountPkr || row.amountPkr,
        creditPkr: 0,
      })),
      ...payments
        .filter((row) => row.status === "COMPLETED")
        .map((row) => ({
          id: row.id,
          at: row.paymentDate,
          kind: "payment" as const,
          label: `Payment ${row.paymentNumber || row.receiptNo}`,
          debitPkr: 0,
          creditPkr: row.amountPkr,
        })),
      ...credits.map((row) => ({
        id: row.id,
        at: row.createdAt,
        kind: "credit" as const,
        label: row.reason || "Credit",
        debitPkr: 0,
        creditPkr: row.amountPkr,
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return {
      balancePkr,
      currentInvoice: current
        ? {
            id: current.id,
            name: invoiceLabel(current),
            billingPeriod: current.billingPeriod,
            amountPkr: current.amountPkr,
            paidPkr: current.paidAmountPkr,
            dueOn: current.dueOn,
            status: current.status,
            receiptId: current.allocations.find((row) => row.payment.status === "COMPLETED")?.payment.id ?? null,
          }
        : null,
      invoices: invoices.map((row) => ({
        id: row.id,
        name: invoiceLabel(row),
        invoiceNumber: row.invoiceNumber,
        billingPeriod: row.billingPeriod,
        amountPkr: row.amountPkr,
        paidPkr: row.paidAmountPkr,
        status: row.status,
        dueOn: row.dueOn,
        receiptId: row.allocations.find((item) => item.payment.status === "COMPLETED")?.payment.id ?? null,
      })),
      payments: payments.map((row) => ({
        id: row.id,
        paymentNumber: row.paymentNumber,
        amountPkr: row.amountPkr,
        method: row.method,
        status: row.status,
        paymentDate: row.paymentDate,
        receiptId: row.receipt?.id ?? row.id,
      })),
      credits,
      assignment,
      discounts,
      ledger,
    };
  }
}
