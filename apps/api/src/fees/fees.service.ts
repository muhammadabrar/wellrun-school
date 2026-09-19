import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { CreatePaymentInput } from "@wellrun/shared";
import type { SchoolScope } from "../common/school-scope";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FeesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  invoices(schoolId: string, scope: SchoolScope = {}) {
    return this.prisma.invoice.findMany({
      where: {
        schoolId,
        ...(scope.campusId
          ? { OR: [{ student: { campusId: scope.campusId } }, { application: { campusId: scope.campusId } }] }
          : {}),
      },
      include: { student: true, feePlan: true, payments: true, application: true },
      orderBy: { dueOn: "desc" },
    });
  }

  async pay(schoolId: string, input: CreatePaymentInput) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: input.invoiceId, schoolId },
      include: { payments: true, student: true, feePlan: true },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    const paid = invoice.payments.reduce((sum, p) => sum + p.amountPkr, 0);
    const remaining = invoice.amountPkr - paid;
    if (input.amountPkr > remaining) {
      throw new BadRequestException("Payment is larger than the remaining balance");
    }

    const count = await this.prisma.payment.count({ where: { schoolId } });
    const receiptNo = `WR-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    const nextPaid = paid + input.amountPkr;
    const status = nextPaid >= invoice.amountPkr ? "PAID" : "PARTIAL";

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          schoolId,
          invoiceId: invoice.id,
          amountPkr: input.amountPkr,
          method: input.method,
          receiptNo,
        },
        include: { invoice: { include: { student: true, feePlan: true, application: true } } },
      });
      await tx.invoice.update({ where: { id: invoice.id }, data: { status } });
      if (invoice.applicationId && status === "PAID") {
        const application = await tx.admissionApplication.findFirst({
          where: { id: invoice.applicationId },
          include: { invoices: { include: { payments: true } } },
        });
        if (application && ["FEE_PENDING", "ACCEPTED", "DOCUMENTS_PENDING"].includes(application.status)) {
          const remaining = application.invoices.reduce((sum, row) => {
            if (row.status === "VOID" || row.status === "DRAFT") return sum;
            const paidAmount = row.payments.reduce((total, item) => total + item.amountPkr, 0);
            return sum + Math.max(row.amountPkr - paidAmount, 0);
          }, 0);
          if (remaining <= 0) {
            await tx.admissionApplication.update({
              where: { id: application.id },
              data: { status: "DOCUMENTS_PENDING" },
            });
          }
        }
      }
      return payment;
    });
  }

  async receipt(schoolId: string, id: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { id, schoolId },
      include: { invoice: { include: { student: true, feePlan: true } }, school: true },
    });
    if (!payment) throw new NotFoundException("Receipt not found");
    return payment;
  }
}
