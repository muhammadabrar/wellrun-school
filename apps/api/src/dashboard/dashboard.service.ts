import { Inject, Injectable } from "@nestjs/common";
import { dateOnly, karachiToday } from "../common/date";
import type { SchoolScope } from "../common/school-scope";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(schoolId: string, scope: SchoolScope = {}) {
    const today = dateOnly(karachiToday());
    const campusFilter = scope.campusId
      ? { class: { campusId: scope.campusId } }
      : {};
    const invoiceCampus = scope.campusId
      ? {
          OR: [{ student: { campusId: scope.campusId } }, { application: { campusId: scope.campusId } }],
        }
      : {};

    const [absentToday, invoices, school] = await Promise.all([
      this.prisma.attendanceRecord.count({
        where: { schoolId, date: today, status: { in: ["ABSENT", "LEAVE"] }, ...campusFilter },
      }),
      this.prisma.invoice.findMany({
        where: { schoolId, ...invoiceCampus },
        include: { payments: true },
      }),
      this.prisma.school.findUnique({ where: { id: schoolId } }),
    ]);

    const collected = invoices.reduce(
      (sum, invoice) => sum + invoice.payments.reduce((s, p) => s + p.amountPkr, 0),
      0,
    );
    const billed = invoices.reduce((sum, invoice) => sum + invoice.amountPkr, 0);

    return {
      schoolName: school?.name ?? "School",
      absentToday,
      collected,
      outstanding: Math.max(billed - collected, 0),
      invoiceCount: invoices.length,
    };
  }
}
