import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { invoiceTitle, periodLabel } from "./invoice-view";
import { addPkr } from "./money";
import { FeePaymentService } from "./payment.service";
import { logoFilePath, renderReceiptPdf, writePdfFile } from "./pdf";

@Injectable()
export class FeeReceiptService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeePaymentService) private readonly payments: FeePaymentService,
  ) {}

  list(schoolId: string) {
    return this.prisma.receipt.findMany({
      where: { schoolId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        payment: { select: { id: true, method: true, amountPkr: true, status: true, paymentDate: true } },
      },
      orderBy: { receiptDate: "desc" },
      take: 300,
    });
  }

  /** Accepts a receipt id or its payment id — links across the console use either. */
  async detail(schoolId: string, id: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { schoolId, OR: [{ id }, { paymentId: id }] },
      include: {
        payment: {
          include: {
            allocations: { include: { invoice: { include: { items: { orderBy: { createdAt: "asc" } } } } } },
          },
        },
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            enrollments: { where: { active: true }, select: { class: { select: { name: true, section: true } } }, take: 1 },
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException("Receipt not found");
    const [school, guardian, settings, creditCreated] = await Promise.all([
      this.payments.schoolHeader(schoolId),
      receipt.studentId ? this.payments.primaryGuardian(receipt.studentId) : Promise.resolve(null),
      this.prisma.schoolFeeSettings.findUnique({ where: { schoolId }, select: { receiptHeader: true, receiptFooter: true } }),
      this.prisma.studentCredit.aggregate({ where: { sourcePaymentId: receipt.paymentId }, _sum: { amountPkr: true } }),
    ]);
    const payment = receipt.payment;
    const invoices = payment.allocations.map((row) => row.invoice);
    const multiple = invoices.length > 1;
    const lines = invoices.flatMap((invoice) =>
      invoice.items.map((item) => ({
        description: multiple ? `${item.description} (${periodLabel(invoice.billingPeriod) || invoiceTitle(invoice)})` : item.description,
        amountPkr: item.grossAmountPkr,
      })),
    );
    const cls = receipt.student?.enrollments[0]?.class ?? null;
    // Receipts issued before balances were snapshotted fall back to the paid amount math.
    const snapshotted = receipt.previousBalancePkr > 0 || receipt.remainingBalancePkr > 0;
    const allocated = addPkr(...payment.allocations.map((row) => row.amountPkr));
    return {
      id: receipt.id,
      paymentId: payment.id,
      receiptNumber: receipt.receiptNumber,
      paymentNumber: payment.paymentNumber,
      receiptDate: receipt.receiptDate,
      status: payment.status,
      school,
      header: settings?.receiptHeader ?? "",
      footer: settings?.receiptFooter ?? "",
      student: receipt.student
        ? {
            id: receipt.student.id,
            name: `${receipt.student.firstName} ${receipt.student.lastName}`,
            admissionNo: receipt.student.admissionNo,
            className: cls?.name ?? "",
            section: cls?.section ?? "",
          }
        : null,
      guardian,
      invoices: payment.allocations.map((row) => ({
        id: row.invoice.id,
        invoiceNumber: row.invoice.invoiceNumber,
        title: invoiceTitle(row.invoice),
        appliedPkr: row.amountPkr,
      })),
      lines,
      discountPkr: addPkr(...invoices.map((row) => row.discountAmountPkr)),
      lateFeePkr: addPkr(...invoices.map((row) => row.lateFeeAmountPkr)),
      totalPkr: addPkr(...invoices.map((row) => row.totalAmountPkr || row.amountPkr)),
      amountPaidPkr: payment.amountPkr,
      method: payment.method,
      referenceNumber: payment.referenceNumber,
      notes: payment.notes,
      previousBalancePkr: snapshotted ? receipt.previousBalancePkr : allocated,
      remainingBalancePkr: snapshotted ? receipt.remainingBalancePkr : addPkr(...invoices.map((row) => row.balanceAmountPkr)),
      creditPkr: creditCreated._sum.amountPkr ?? 0,
    };
  }

  async byPayment(schoolId: string, paymentId: string) {
    return this.detail(schoolId, paymentId);
  }

  async pdf(schoolId: string, id: string, res?: Response) {
    const receipt = await this.detail(schoolId, id);
    const bytes = await renderReceiptPdf({
      school: { ...receipt.school, logoPath: logoFilePath(receipt.school.logoUrl) },
      header: receipt.header,
      footer: receipt.footer,
      receiptNumber: receipt.receiptNumber,
      receiptDate: new Date(receipt.receiptDate),
      student: receipt.student,
      guardian: receipt.guardian,
      lines: receipt.lines,
      discountPkr: receipt.discountPkr,
      lateFeePkr: receipt.lateFeePkr,
      totalPkr: receipt.totalPkr,
      amountPaidPkr: receipt.amountPaidPkr,
      method: receipt.method,
      referenceNumber: receipt.referenceNumber,
      previousBalancePkr: receipt.previousBalancePkr,
      remainingBalancePkr: receipt.remainingBalancePkr,
      creditPkr: receipt.creditPkr,
      voided: receipt.status !== "COMPLETED",
    });
    const pdfPath = writePdfFile(schoolId, receipt.receiptNumber, bytes);
    await this.prisma.receipt.update({ where: { id: receipt.id }, data: { pdfPath } });
    if (res) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${receipt.receiptNumber}.pdf"`);
      res.send(bytes);
      return;
    }
    return bytes;
  }
}
