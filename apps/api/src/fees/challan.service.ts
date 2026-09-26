import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Response } from "express";
import { PrismaService } from "../prisma/prisma.service";
import { invoiceLabel } from "./billing";
import { renderChallanDocument, type ChallanStudentData } from "./challan-pdf";
import { logoFilePath } from "./pdf";
import { clampPkr } from "./money";

@Injectable()
export class ChallanService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async pdf(schoolId: string, invoiceId: string, res?: Response) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, schoolId },
      include: {
        student: { include: { enrollments: { where: { active: true }, include: { class: true }, take: 1 } } },
        items: { orderBy: { createdAt: "asc" } },
        school: { include: { media: { where: { kind: "LOGO" }, take: 1 } } },
        campus: true,
      },
    });
    if (!invoice || !invoice.student) throw new NotFoundException("Invoice not found");
    const activeClass = invoice.student.enrollments[0]?.class ?? null;
    const fresh = invoice;
    // Arrears = anything still owed on this student's earlier invoices.
    const otherOverdue = await this.prisma.invoice.findMany({
      where: {
        schoolId,
        studentId: invoice.studentId,
        id: { not: invoiceId },
        status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
        dueOn: { lt: invoice.dueOn },
      },
      select: { balanceAmountPkr: true },
    });
    const guardianLink = await this.prisma.studentGuardian.findFirst({
      where: { studentId: invoice.student.id },
      include: { guardian: { select: { name: true } } },
    });
    const arrearsPkr = otherOverdue.reduce((sum, row) => sum + Math.max(row.balanceAmountPkr, 0), 0);

    const lateFeePkr = 0;
    const basePayablePkr = clampPkr(fresh.subtotalPkr - fresh.discountAmountPkr + fresh.taxAmountPkr - fresh.paidAmountPkr);

    const data: ChallanStudentData = {
      schoolName: invoice.school.name,
      campusName: invoice.campus?.name,
      schoolAddress: invoice.campus?.address || invoice.school.address,
      phone: invoice.campus?.phone || invoice.school.phone,
      primaryColor: invoice.school.primaryColor,
      logoPath: logoFilePath(invoice.school.media[0]?.url ?? ""),
      invoiceNumber: invoice.invoiceNumber,
      billingPeriod: invoice.billingPeriod,
      issueDate: invoice.issueDate,
      dueOn: invoice.dueDate ?? invoice.dueOn,
      studentName: `${invoice.student.firstName} ${invoice.student.lastName}`,
      guardianName: guardianLink?.guardian.name,
      admissionNo: invoice.student.admissionNo,
      rollNo: invoice.student.rollNo,
      className: activeClass?.name ?? "",
      section: activeClass?.section ?? undefined,
      lines: [
        ...invoice.items.map((item) => ({ description: item.description || invoiceLabel(invoice), amountPkr: item.grossAmountPkr })),
        ...(fresh.discountAmountPkr ? [{ description: "Discount", amountPkr: -fresh.discountAmountPkr }] : []),
        ...(fresh.paidAmountPkr ? [{ description: "Less: already paid / credit", amountPkr: -fresh.paidAmountPkr }] : []),
      ],
      currentTotalPkr: basePayablePkr,
      arrearsPkr,
      totalPayableWithinDuePkr: basePayablePkr + arrearsPkr,
      lateFeePkr,
      totalPayableAfterDuePkr: basePayablePkr + arrearsPkr + lateFeePkr,
    };
    const bytes = await renderChallanDocument([data]);
    if (res) {
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${invoice.invoiceNumber}-challan.pdf"`);
      res.send(bytes);
      return;
    }
    return bytes;
  }
}
