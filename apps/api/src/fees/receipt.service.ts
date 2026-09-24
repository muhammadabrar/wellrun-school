import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { invoiceLabel } from "./billing";
import { addPkr } from "./money";
import { logoFilePath, renderReceiptPdf, writePdfFile } from "./pdf";

@Injectable()
export class FeeReceiptService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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

  async detail(schoolId: string, id: string) {
    const receipt = await this.load(schoolId, id);
    return this.payload(receipt);
  }

  async byPayment(schoolId: string, paymentId: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { schoolId, OR: [{ id: paymentId }, { paymentId }] },
    });
    if (receipt) return this.detail(schoolId, receipt.id);
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, schoolId } });
    if (!payment) throw new NotFoundException("Receipt not found");
    return this.detail(schoolId, paymentId).catch(async () => this.payloadFromPayment(schoolId, paymentId));
  }

  async pdf(schoolId: string, id: string, res?: Response) {
    const receipt = await this.load(schoolId, id);
    const payload = this.payload(receipt);
    const bytes = await renderReceiptPdf({
      schoolName: payload.school.name,
      schoolAddress: payload.school.address,
      taxNumber: payload.school.taxNumber,
      ntn: payload.school.ntn,
      strn: payload.school.strn,
      primaryColor: payload.school.primaryColor,
      logoPath: logoFilePath(payload.logoUrl),
      header: payload.header,
      footer: payload.footer,
      receiptNumber: payload.receiptNumber,
      paymentDate: new Date(payload.paymentDate),
      studentName: payload.studentName,
      admissionNo: payload.admissionNo,
      method: payload.method,
      referenceNumber: payload.referenceNumber,
      lines: payload.lines,
      subtotalPkr: payload.subtotalPkr,
      discountAmountPkr: payload.discountAmountPkr,
      lateFeeAmountPkr: payload.lateFeeAmountPkr,
      taxAmountPkr: payload.taxAmountPkr,
      showTax: payload.showTax,
      totalPkr: payload.totalPkr,
      paidPkr: payload.paidPkr,
      remainingPkr: payload.remainingPkr,
      fbr: payload.fbr,
    });
    if (!receipt.pdfPath) {
      const pdfPath = writePdfFile(schoolId, receipt.receiptNumber, bytes);
      await this.prisma.receipt.update({ where: { id: receipt.id }, data: { pdfPath } });
    }
    if (res) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${receipt.receiptNumber}.pdf"`);
      res.send(bytes);
      return;
    }
    return bytes;
  }

  private async load(schoolId: string, id: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { schoolId, OR: [{ id }, { paymentId: id }] },
      include: {
        payment: {
          include: {
            allocations: { include: { invoice: { include: { items: true, feePlan: true, fbrInvoice: true } } } },
            student: true,
            invoice: { include: { student: true, feePlan: true, items: true, fbrInvoice: true } },
          },
        },
        student: true,
        school: {
          include: {
            media: { where: { kind: "LOGO" }, take: 1 },
            feeSettings: true,
          },
        },
      },
    });
    if (!receipt) throw new NotFoundException("Receipt not found");
    return receipt;
  }

  private payload(receipt: Awaited<ReturnType<FeeReceiptService["load"]>>) {
    const payment = receipt.payment;
    const invoices = payment.allocations.length
      ? payment.allocations.map((row) => row.invoice)
      : payment.invoice
        ? [payment.invoice]
        : [];
    const student = receipt.student ?? payment.student ?? payment.invoice?.student;
    const settings = receipt.school.feeSettings;
    const fbr = invoices
      .map((invoice) => invoice.fbrInvoice)
      .find((row) => row?.fbrStatus === "ACCEPTED" && row.fbrInvoiceNumber);
    const lines = payment.allocations.length
      ? payment.allocations.map((row) => ({
          description: invoiceLabel(row.invoice),
          amountPkr: row.amountPkr,
          invoiceNumber: row.invoice.invoiceNumber,
        }))
      : [{ description: payment.invoice ? invoiceLabel(payment.invoice) : "Fee", amountPkr: payment.amountPkr, invoiceNumber: payment.invoice?.invoiceNumber ?? "" }];
    const subtotalPkr = addPkr(...invoices.map((row) => row.subtotalPkr || row.amountPkr));
    const discountAmountPkr = addPkr(...invoices.map((row) => row.discountAmountPkr));
    const lateFeeAmountPkr = addPkr(...invoices.map((row) => row.lateFeeAmountPkr));
    const taxAmountPkr = addPkr(...invoices.map((row) => row.taxAmountPkr));
    const remainingPkr = addPkr(...invoices.map((row) => row.balanceAmountPkr));
    return {
      id: receipt.id,
      paymentId: payment.id,
      receiptNumber: receipt.receiptNumber,
      receiptNo: receipt.receiptNumber,
      paymentDate: receipt.receiptDate,
      paidAt: payment.paidAt,
      amountPkr: receipt.amountPkr,
      method: payment.method,
      referenceNumber: payment.referenceNumber,
      status: payment.status,
      studentName: student ? `${student.firstName} ${student.lastName}` : "Applicant",
      admissionNo: student?.admissionNo ?? "",
      student: student
        ? { id: student.id, firstName: student.firstName, lastName: student.lastName, admissionNo: student.admissionNo }
        : null,
      invoice: payment.invoice
        ? { ...payment.invoice, feePlan: { name: invoiceLabel(payment.invoice) } }
        : { student, feePlan: { name: lines[0]?.description ?? "Fee" } },
      school: {
        name: receipt.school.name,
        address: receipt.school.address,
        taxNumber: receipt.school.taxNumber,
        ntn: receipt.school.ntn,
        strn: receipt.school.strn,
        primaryColor: receipt.school.primaryColor,
      },
      logoUrl: receipt.school.media[0]?.url ?? "",
      header: settings?.receiptHeader ?? "",
      footer: settings?.receiptFooter ?? "Thank you for your payment.",
      showTax: settings?.showTaxOnReceipt ?? false,
      lines,
      subtotalPkr,
      discountAmountPkr,
      lateFeeAmountPkr,
      taxAmountPkr,
      totalPkr: addPkr(...invoices.map((row) => row.totalAmountPkr || row.amountPkr)),
      paidPkr: receipt.amountPkr,
      remainingPkr,
      fbr: fbr?.fbrInvoiceNumber ? { number: fbr.fbrInvoiceNumber } : null,
    };
  }

  private async payloadFromPayment(schoolId: string, paymentId: string) {
    const created = await this.prisma.receipt.findFirst({ where: { paymentId, schoolId } });
    if (created) return this.detail(schoolId, created.id);
    throw new NotFoundException("Receipt not found");
  }
}
