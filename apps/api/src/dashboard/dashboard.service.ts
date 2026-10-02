import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  addDays,
  attendancePct,
  emptyCounts,
  holidayOn,
  isWorkingDay,
  isoOf,
  type AttendanceCounts,
  type AttendanceStatus,
  type DashboardActivity,
  type SchoolDashboard,
} from "@wellrun/shared";
import { dashboardAttention } from "./attention";
import { classLabel } from "../attendance/attendance.service";
import { loadHolidays, loadSettings } from "../attendance/rules";
import { dateOnly, karachiToday } from "../common/date";
import type { SchoolScope } from "../common/school-scope";
import { resolveYearId } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";

const TREND_DAYS = 14;
const MONTHS_SHOWN = 6;
const FEED_LENGTH = 10;

const monthOf = (iso: string) => iso.slice(0, 7);

function shiftMonth(ym: string, delta: number) {
  const [year, month] = ym.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function sentence(value: string) {
  const text = value.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(schoolId: string, scope: SchoolScope = {}): Promise<SchoolDashboard> {
    const date = karachiToday();
    const today = dateOnly(date);
    const period = monthOf(date);
    const monthStart = dateOnly(`${period}-01`);
    const firstMonth = shiftMonth(period, -(MONTHS_SHOWN - 1));
    const { campusId } = scope;

    const yearId = await resolveYearId(this.prisma, schoolId, scope).catch(() => null);
    const campusOrNull = campusId ? { OR: [{ campusId }, { campusId: null }] } : {};
    const viaStudent = campusId ? { OR: [{ campusId }, { campusId: null, student: { campusId } }] } : {};
    const classWhere: Prisma.ClassWhereInput = { schoolId, yearId: yearId ?? "none", ...(campusId ? { campusId } : {}) };

    const paymentWhere: Prisma.PaymentWhereInput = { schoolId, status: "COMPLETED", ...viaStudent };
    const invoiceWhere: Prisma.InvoiceWhereInput = {
      schoolId,
      status: { in: ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] },
      AND: [
        viaStudent,
        yearId ? { OR: [{ academicYearId: yearId }, { academicYearId: null, feePlan: { yearId } }] } : {},
      ],
    };
    const applicationWhere: Prisma.AdmissionApplicationWhereInput = {
      schoolId,
      ...(campusId ? { campusId } : {}),
      ...(yearId ? { yearId } : {}),
    };

    const [settings, holidays, classes] = await Promise.all([
      loadSettings(this.prisma, schoolId),
      loadHolidays(this.prisma, schoolId, addDays(date, -TREND_DAYS), date, campusId ?? null),
      this.prisma.class.findMany({
        where: classWhere,
        orderBy: [{ name: "asc" }, { section: "asc" }],
        select: { id: true, name: true, section: true, _count: { select: { enrollments: { where: { active: true } } } } },
      }),
    ]);
    const classIds = classes.map((c) => c.id);
    const trendFrom = addDays(date, -(TREND_DAYS - 1));

    const [
      enrolled,
      newStudents,
      staffGroups,
      todayRows,
      trendRows,
      collectedToday,
      monthPayments,
      unpaid,
      overdue,
      admissionGroups,
      confirmedThisMonth,
      activeExams,
      papersToVerify,
      pendingCorrections,
      upcomingPapers,
      payslipGroups,
      recentPayments,
      recentApplications,
      recentStudents,
      recentPapers,
      recentStaff,
    ] = await Promise.all([
      this.prisma.enrollment.count({ where: { schoolId, active: true, class: classWhere } }),
      this.prisma.student.count({ where: { schoolId, createdAt: { gte: monthStart }, ...(campusId ? { campusId } : {}) } }),
      this.prisma.staff.groupBy({ by: ["status"], where: { schoolId, ...campusOrNull }, _count: { _all: true } }),
      this.prisma.attendanceRecord.groupBy({
        by: ["classId", "status"],
        where: { schoolId, classId: { in: classIds }, date: today },
        _count: { _all: true },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ["date", "status"],
        where: { schoolId, classId: { in: classIds }, date: { gte: dateOnly(trendFrom), lte: today } },
        _count: { _all: true },
      }),
      // Midnight in Pakistan, so an evening payment lands on the right day.
      this.prisma.payment.aggregate({
        where: { ...paymentWhere, paymentDate: { gte: new Date(`${date}T00:00:00+05:00`) } },
        _sum: { amountPkr: true },
      }),
      this.prisma.payment.findMany({
        where: { ...paymentWhere, paymentDate: { gte: dateOnly(`${firstMonth}-01`) } },
        select: { paymentDate: true, amountPkr: true },
      }),
      this.prisma.invoice.aggregate({ where: invoiceWhere, _sum: { balanceAmountPkr: true }, _count: { _all: true } }),
      this.prisma.invoice.aggregate({
        where: { ...invoiceWhere, status: "OVERDUE" },
        _sum: { balanceAmountPkr: true },
        _count: { _all: true },
      }),
      this.prisma.admissionApplication.groupBy({ by: ["status"], where: applicationWhere, _count: { _all: true } }),
      this.prisma.admissionApplication.count({
        where: { ...applicationWhere, status: "ADMISSION_CONFIRMED", confirmedAt: { gte: monthStart } },
      }),
      yearId
        ? this.prisma.exam.count({ where: { schoolId, yearId, status: { in: ["SCHEDULED", "IN_PROGRESS", "MARKING"] } } })
        : 0,
      yearId
        ? this.prisma.examPaper.count({
            where: { schoolId, status: "SUBMITTED", exam: { yearId }, ...(campusId ? { class: { campusId } } : {}) },
          })
        : 0,
      this.prisma.markCorrection.count({ where: { schoolId, status: "PENDING" } }),
      yearId
        ? this.prisma.examPaper.findMany({
            where: {
              schoolId,
              exam: { yearId },
              date: { gte: today, lte: dateOnly(addDays(date, 7)) },
              ...(campusId ? { class: { campusId } } : {}),
            },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
            take: 5,
            select: {
              id: true,
              date: true,
              startTime: true,
              class: { select: { name: true, section: true } },
              subject: { select: { name: true } },
              exam: { select: { name: true } },
            },
          })
        : [],
      this.prisma.payslip.groupBy({
        by: ["status"],
        where: { schoolId, period, ...(campusId ? { staff: campusOrNull } : {}) },
        _count: { _all: true },
      }),
      this.prisma.payment.findMany({
        where: paymentWhere,
        orderBy: { paidAt: "desc" },
        take: 6,
        select: {
          id: true,
          amountPkr: true,
          method: true,
          paidAt: true,
          invoiceId: true,
          student: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.admissionApplication.findMany({
        where: { ...applicationWhere, status: { not: "DRAFT" } },
        orderBy: { updatedAt: "desc" },
        take: 6,
        select: { id: true, applicationNo: true, status: true, firstName: true, lastName: true, updatedAt: true },
      }),
      this.prisma.student.findMany({
        where: { schoolId, applications: { none: {} }, ...(campusId ? { campusId } : {}) },
        orderBy: { createdAt: "desc" },
        take: 4,
        select: { id: true, admissionNo: true, firstName: true, lastName: true, createdAt: true },
      }),
      yearId
        ? this.prisma.examPaper.findMany({
            where: { schoolId, exam: { yearId }, submittedAt: { not: null }, ...(campusId ? { class: { campusId } } : {}) },
            orderBy: { submittedAt: "desc" },
            take: 4,
            select: {
              id: true,
              submittedAt: true,
              class: { select: { name: true, section: true } },
              subject: { select: { name: true } },
              exam: { select: { name: true } },
            },
          })
        : [],
      this.prisma.staff.findMany({
        where: { schoolId, ...campusOrNull },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { id: true, name: true, title: true, createdAt: true },
      }),
    ]);

    // Attendance today and the last two weeks of school days.
    const dayInfo = { working: isWorkingDay(date, settings, holidays), holiday: holidayOn(date, holidays)?.name ?? null };
    const todayCounts = emptyCounts();
    const markedByClass = new Set<string>();
    for (const row of todayRows) {
      todayCounts[row.status as AttendanceStatus] += row._count._all;
      markedByClass.add(row.classId);
    }
    const perDay = new Map<string, AttendanceCounts>();
    for (const row of trendRows) {
      const key = isoOf(row.date);
      const counts = perDay.get(key) ?? perDay.set(key, emptyCounts()).get(key)!;
      counts[row.status as AttendanceStatus] += row._count._all;
    }
    const trend: { date: string; pct: number | null }[] = [];
    for (let i = 0; i < TREND_DAYS; i += 1) {
      const day = addDays(trendFrom, i);
      if (isWorkingDay(day, settings, holidays)) trend.push({ date: day, pct: attendancePct(perDay.get(day) ?? emptyCounts(), settings) });
    }
    const withStudents = classes.filter((c) => c._count.enrollments > 0);
    const unmarkedClasses = withStudents
      .filter((c) => !markedByClass.has(c.id))
      .map((c) => ({ id: c.id, label: classLabel(c), students: c._count.enrollments }));
    const marked = todayCounts.PRESENT + todayCounts.ABSENT + todayCounts.LATE + todayCounts.LEAVE + todayCounts.EXCUSED;
    const attendance = {
      marked,
      present: todayCounts.PRESENT,
      absent: todayCounts.ABSENT,
      late: todayCounts.LATE,
      leave: todayCounts.LEAVE + todayCounts.EXCUSED,
      pct: attendancePct(todayCounts, settings),
      classes: withStudents.length,
      classesMarked: withStudents.length - unmarkedClasses.length,
      unmarkedClasses: unmarkedClasses.slice(0, 8),
      trend,
      thresholdPct: settings.lowThresholdPct,
    };

    // Collections by month (this and the five before).
    const byMonth = new Map<string, number>();
    for (const p of monthPayments) {
      const key = monthOf(p.paymentDate.toISOString());
      byMonth.set(key, (byMonth.get(key) ?? 0) + p.amountPkr);
    }
    const monthly = Array.from({ length: MONTHS_SHOWN }, (_, i) => {
      const month = shiftMonth(firstMonth, i);
      return { month, pkr: byMonth.get(month) ?? 0 };
    });
    const fees = {
      todayPkr: collectedToday._sum.amountPkr ?? 0,
      monthPkr: byMonth.get(period) ?? 0,
      previousMonthPkr: byMonth.get(shiftMonth(period, -1)) ?? 0,
      outstandingPkr: unpaid._sum.balanceAmountPkr ?? 0,
      overduePkr: overdue._sum.balanceAmountPkr ?? 0,
      overdueInvoices: overdue._count._all,
      unpaidInvoices: unpaid._count._all,
      monthly,
    };

    const applications = Object.fromEntries(admissionGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;
    const closed = (applications.ADMISSION_CONFIRMED ?? 0) + (applications.REJECTED ?? 0) + (applications.WITHDRAWN ?? 0);
    const totalApplications = admissionGroups.reduce((sum, g) => sum + g._count._all, 0);
    const admissions = {
      open: totalApplications - closed - (applications.DRAFT ?? 0),
      needsReview: (applications.SUBMITTED ?? 0) + (applications.UNDER_REVIEW ?? 0),
      awaitingAssessment: (applications.ASSESSMENT_PENDING ?? 0) + (applications.INTERVIEW_PENDING ?? 0),
      awaitingConfirmation:
        (applications.ACCEPTED ?? 0) + (applications.FEE_PENDING ?? 0) + (applications.DOCUMENTS_PENDING ?? 0),
      confirmedThisMonth,
    };

    const staffBy = Object.fromEntries(staffGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;
    const staff = { active: staffBy.ACTIVE ?? 0, onLeave: staffBy.ON_LEAVE ?? 0 };
    const slips = Object.fromEntries(payslipGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;
    const payroll = {
      period,
      activeStaff: staff.active,
      generated: (slips.DRAFT ?? 0) + (slips.FINALIZED ?? 0) + (slips.PAID ?? 0),
      drafts: slips.DRAFT ?? 0,
      paid: slips.PAID ?? 0,
    };

    const exams = {
      activeExams,
      papersToVerify,
      pendingCorrections,
      upcoming: upcomingPapers.map((p) => ({
        id: p.id,
        date: isoOf(p.date!),
        startTime: p.startTime,
        className: classLabel(p.class),
        subject: p.subject.name,
        exam: p.exam.name,
      })),
    };

    const attention = dashboardAttention({ date, dayInfo, attendance, fees, admissions, exams, payroll });

    const activity: DashboardActivity[] = [
      ...recentPayments.map((p) => ({
        id: `payment-${p.id}`,
        type: "payment" as const,
        title: `Rs. ${p.amountPkr.toLocaleString("en-PK")} received`,
        detail: `${p.student ? `${p.student.firstName} ${p.student.lastName}` : "Student"} · ${sentence(p.method)}`,
        at: p.paidAt.toISOString(),
        href: p.invoiceId ? `/fees/invoices/${p.invoiceId}` : "/fees/payments",
      })),
      ...recentApplications.map((a) => ({
        id: `application-${a.id}`,
        type: "admission" as const,
        title: `${`${a.firstName} ${a.lastName}`.trim() || a.applicationNo} · ${sentence(a.status)}`,
        detail: `Application ${a.applicationNo}`,
        at: a.updatedAt.toISOString(),
        href: `/admissions/${a.id}`,
      })),
      ...recentStudents.map((s) => ({
        id: `student-${s.id}`,
        type: "student" as const,
        title: `${s.firstName} ${s.lastName} admitted`,
        detail: `Admission no. ${s.admissionNo}`,
        at: s.createdAt.toISOString(),
        href: `/students/${s.id}`,
      })),
      ...recentPapers.map((p) => ({
        id: `paper-${p.id}`,
        type: "exam" as const,
        title: `${p.subject.name} marks submitted`,
        detail: `${p.exam.name} · ${classLabel(p.class)}`,
        at: p.submittedAt!.toISOString(),
        href: "/exams/marks/pending",
      })),
      ...recentStaff.map((s) => ({
        id: `staff-${s.id}`,
        type: "staff" as const,
        title: `${s.name} joined the staff`,
        detail: s.title,
        at: s.createdAt.toISOString(),
        href: `/staff/${s.id}`,
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, FEED_LENGTH);

    const school = await this.prisma.school.findUnique({ where: { id: schoolId }, select: { name: true } });

    return {
      schoolName: school?.name ?? "School",
      date,
      working: dayInfo.working,
      holiday: dayInfo.holiday,
      students: { total: enrolled, newThisMonth: newStudents },
      staff,
      attendance,
      fees,
      admissions,
      exams,
      payroll,
      attention,
      activity,
    };
  }
}
