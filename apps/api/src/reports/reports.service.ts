import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { InvoiceStatus, Prisma } from "@prisma/client";
import {
  AGING_BUCKETS,
  HUB_EXPORT_ROW_LIMIT,
  HUB_REPORT_PAGE_SIZE,
  agingBucket,
  attendancePct,
  countStatuses,
  defaultRangeStart,
  daysOverdue,
  isoOf,
  pageParams,
  reportById,
  type AttendanceStatus,
  type RatioReport,
  type ReportColumn,
  type ReportParams,
  type ReportResult,
  type ReportRow,
  type ReportScopeOption,
} from "@wellrun/shared";
import { loadSettings } from "../attendance/rules";
import { karachiToday } from "../common/date";
import { ExamAnalyticsService } from "../exams/analytics.service";
import { StaffAttendanceService } from "../staff-attendance/staff-attendance.service";
import { PrismaService } from "../prisma/prisma.service";
import { byLabel, dateRange, dayName, endOf, karachiDay, karachiMonth, monthName, monthsBetween, percentOf, personName, shiftMonth, startOf, sumOf } from "./helpers";
import { attendanceTally, buildRatios } from "./ratios";

export type ReportCtx = { schoolId: string; yearId: string; campusId?: string };

type Built = {
  columns: ReportColumn[];
  rows: ReportRow[];
  totals?: ReportRow | null;
  chart?: ReportResult["chart"];
  subtitle: string;
  /** Set when the query itself had to stop early. */
  truncated?: boolean;
};

const OPEN: InvoiceStatus[] = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"];
const BILLED: { notIn: InvoiceStatus[] } = { notIn: ["DRAFT", "CANCELLED"] };
const LIMIT = HUB_EXPORT_ROW_LIMIT;
const TEACHING_STATUSES = ["ACTIVE", "ON_LEAVE"] as const;

const MALE = new Set(["male", "m", "boy"]);
const FEMALE = new Set(["female", "f", "girl"]);

@Injectable()
export class ReportsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExamAnalyticsService) private readonly analytics: ExamAnalyticsService,
    @Inject(StaffAttendanceService) private readonly staffAttendance: StaffAttendanceService,
  ) {}

  // Scope helpers -------------------------------------------------------------------------------------------

  private classWhere(ctx: ReportCtx): Prisma.ClassWhereInput {
    return { schoolId: ctx.schoolId, yearId: ctx.yearId, ...(ctx.campusId ? { OR: [{ campusId: ctx.campusId }, { campusId: null }] } : {}) };
  }

  private viaStudent(ctx: ReportCtx) {
    return ctx.campusId ? { OR: [{ campusId: ctx.campusId }, { campusId: null, student: { campusId: ctx.campusId } }] } : {};
  }

  private async classes(ctx: ReportCtx, classId?: string) {
    const rows = await this.prisma.class.findMany({ where: { ...this.classWhere(ctx), ...(classId ? { id: classId } : {}) }, select: { id: true, name: true, section: true } });
    const label = (c: { name: string; section: string }) => (c.section ? `${c.name} ${c.section}` : c.name);
    return rows.map((c) => ({ id: c.id, label: label(c) })).sort((a, b) => byLabel(a.label, b.label));
  }

  private async yearName(ctx: ReportCtx) {
    return (await this.prisma.academicYear.findFirst({ where: { id: ctx.yearId, schoolId: ctx.schoolId }, select: { name: true } }))?.name ?? "";
  }

  private async classNameOf(ctx: ReportCtx, classId?: string) {
    if (!classId) return "";
    const rows = await this.classes(ctx, classId);
    if (!rows.length) throw new BadRequestException("Class not found in this academic year");
    return rows[0]!.label;
  }

  // Entry points --------------------------------------------------------------------------------------------

  async scopes(ctx: ReportCtx): Promise<ReportScopeOption[]> {
    return this.analytics.scopes(ctx.schoolId, ctx.yearId);
  }

  async run(ctx: ReportCtx, id: string, params: ReportParams): Promise<ReportResult> {
    const def = reportById(id);
    if (!def) throw new NotFoundException("Report not found");
    const today = karachiToday();
    const built = await this.build(ctx, id, params, today);
    const exporting = params.export === "1";
    const { page, pageSize, skip, take } = exporting ? { page: 1, pageSize: LIMIT, skip: 0, take: LIMIT } : pageParams(params, HUB_REPORT_PAGE_SIZE);
    const cut = built.rows.length > LIMIT;
    const rows = cut ? built.rows.slice(0, LIMIT) : built.rows;
    return {
      id,
      title: def.title,
      subtitle: built.subtitle,
      columns: built.columns,
      rows: exporting ? rows : rows.slice(skip, skip + take),
      totals: built.totals ?? null,
      chart: built.chart ?? null,
      total: rows.length,
      page,
      pageSize,
      truncated: cut || Boolean(built.truncated),
      generatedAt: new Date().toISOString(),
    };
  }

  private build(ctx: ReportCtx, id: string, params: ReportParams, today: string): Promise<Built> {
    switch (id) {
      case "students.strength":
        return this.studentStrength(ctx);
      case "students.admissions":
        return this.studentAdmissions(ctx, params, today);
      case "students.directory":
        return this.studentDirectory(ctx, params);
      case "attendance.classes":
        return this.attendanceClasses(ctx, params, today);
      case "attendance.below":
        return this.attendanceBelow(ctx, params, today);
      case "fees.collection":
        return this.feeCollection(ctx, params, today);
      case "fees.billing-heads":
        return this.feeBillingHeads(ctx, params, today);
      case "fees.aging":
        return this.feeAging(ctx, today);
      case "fees.defaulters":
        return this.feeDefaulters(ctx, params, today);
      case "fees.discounts":
        return this.feeDiscounts(ctx, params, today);
      case "fees.reversals":
        return this.feeReversals(ctx, params, today);
      case "exams.classes":
        return this.examClasses(ctx, params);
      case "exams.subjects":
        return this.examSubjects(ctx, params);
      case "staff.attendance":
        return this.staffAttendanceReport(ctx, params, today);
      case "staff.payroll":
        return this.payrollByMonth(ctx, params, today);
      case "staff.departments":
        return this.payrollByDepartment(ctx, params, today);
      default:
        throw new NotFoundException("Report not found");
    }
  }

  // Students ------------------------------------------------------------------------------------------------

  private async studentStrength(ctx: ReportCtx): Promise<Built> {
    const [classes, enrollments, year] = await Promise.all([
      this.classes(ctx),
      this.prisma.enrollment.findMany({
        where: { schoolId: ctx.schoolId, active: true, class: this.classWhere(ctx), student: { status: "active" } },
        select: { classId: true, student: { select: { gender: true } } },
      }),
      this.yearName(ctx),
    ]);
    const tally = new Map<string, { boys: number; girls: number; other: number }>();
    for (const row of enrollments) {
      const t = tally.get(row.classId) ?? { boys: 0, girls: 0, other: 0 };
      const g = row.student.gender.trim().toLowerCase();
      if (MALE.has(g)) t.boys += 1;
      else if (FEMALE.has(g)) t.girls += 1;
      else t.other += 1;
      tally.set(row.classId, t);
    }
    const rows: ReportRow[] = classes.map((c) => {
      const t = tally.get(c.id) ?? { boys: 0, girls: 0, other: 0 };
      return { class: c.label, students: t.boys + t.girls + t.other, boys: t.boys, girls: t.girls, other: t.other };
    });
    return {
      subtitle: `Active students, ${year}`,
      columns: [
        { key: "class", label: "Class" },
        { key: "students", label: "Students", format: "int", align: "end" },
        { key: "boys", label: "Boys", format: "int", align: "end" },
        { key: "girls", label: "Girls", format: "int", align: "end" },
        { key: "other", label: "Not stated", format: "int", align: "end" },
      ],
      rows,
      totals: { class: "All classes", students: sumOf(rows, "students"), boys: sumOf(rows, "boys"), girls: sumOf(rows, "girls"), other: sumOf(rows, "other") },
      chart: { labelKey: "class", valueKey: "students", format: "int" },
    };
  }

  private async studentAdmissions(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const { from, to } = dateRange(params, today, defaultRangeStart("year", today));
    const students = await this.prisma.student.findMany({
      where: { schoolId: ctx.schoolId, admissionDate: { gte: startOf(from), lte: endOf(to) }, ...(ctx.campusId ? { OR: [{ campusId: ctx.campusId }, { campusId: null }] } : {}) },
      orderBy: [{ admissionDate: "desc" }, { id: "asc" }],
      take: LIMIT + 1,
      select: {
        admissionNo: true,
        firstName: true,
        lastName: true,
        gender: true,
        admissionDate: true,
        enrollments: { where: { active: true }, take: 1, select: { class: { select: { name: true, section: true } } } },
        guardians: { take: 1, select: { guardian: { select: { name: true, phone: true } } } },
      },
    });
    const rows: ReportRow[] = students.map((s) => {
      const cls = s.enrollments[0]?.class;
      return {
        admissionNo: s.admissionNo,
        student: personName(s),
        gender: s.gender,
        class: cls ? `${cls.name} ${cls.section}`.trim() : "",
        admitted: karachiDay(s.admissionDate),
        guardian: s.guardians[0]?.guardian.name ?? "",
        phone: s.guardians[0]?.guardian.phone ?? "",
      };
    });
    return {
      subtitle: `Admitted ${from} to ${to}`,
      columns: [
        { key: "admissionNo", label: "Admission no." },
        { key: "student", label: "Student" },
        { key: "gender", label: "Gender" },
        { key: "class", label: "Class" },
        { key: "admitted", label: "Admitted on", format: "date" },
        { key: "guardian", label: "Guardian" },
        { key: "phone", label: "Phone" },
      ],
      rows,
      totals: { admissionNo: "Total", student: `${Math.min(rows.length, LIMIT)} students` },
    };
  }

  private async studentDirectory(ctx: ReportCtx, params: ReportParams): Promise<Built> {
    const className = await this.classNameOf(ctx, params.classId);
    const students = await this.prisma.student.findMany({
      where: {
        schoolId: ctx.schoolId,
        status: "active",
        ...(ctx.campusId ? { OR: [{ campusId: ctx.campusId }, { campusId: null }] } : {}),
        enrollments: { some: { active: true, class: { ...this.classWhere(ctx), ...(params.classId ? { id: params.classId } : {}) } } },
      },
      take: LIMIT,
      select: {
        admissionNo: true,
        rollNo: true,
        firstName: true,
        lastName: true,
        enrollments: { where: { active: true }, take: 1, select: { class: { select: { name: true, section: true } } } },
        guardians: { select: { guardian: { select: { name: true, relation: true, phone: true, cnic: true } } } },
      },
    });
    const rows: ReportRow[] = [];
    for (const s of students) {
      const cls = s.enrollments[0]?.class;
      const label = cls ? `${cls.name} ${cls.section}`.trim() : "";
      const base = { class: label, roll: s.rollNo, admissionNo: s.admissionNo, student: personName(s) };
      if (!s.guardians.length) rows.push({ ...base, guardian: "", relation: "", phone: "", cnic: "" });
      for (const link of s.guardians) rows.push({ ...base, guardian: link.guardian.name, relation: link.guardian.relation, phone: link.guardian.phone, cnic: link.guardian.cnic ?? "" });
    }
    rows.sort((a, b) => byLabel(String(a.class), String(b.class)) || byLabel(String(a.roll), String(b.roll)) || String(a.student).localeCompare(String(b.student)));
    return {
      subtitle: className ? `${className}, active students` : "All active students",
      columns: [
        { key: "class", label: "Class" },
        { key: "roll", label: "Roll" },
        { key: "admissionNo", label: "Admission no." },
        { key: "student", label: "Student" },
        { key: "guardian", label: "Guardian" },
        { key: "relation", label: "Relation" },
        { key: "phone", label: "Phone" },
        { key: "cnic", label: "CNIC" },
      ],
      rows,
      totals: null,
      truncated: students.length >= LIMIT,
    };
  }

  // Attendance ----------------------------------------------------------------------------------------------

  private async attendanceClasses(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const { from, to } = dateRange(params, today);
    const [classes, settings] = await Promise.all([this.classes(ctx), loadSettings(this.prisma, ctx.schoolId)]);
    const groups = await this.prisma.attendanceRecord.groupBy({
      by: ["classId", "status"],
      where: { schoolId: ctx.schoolId, classId: { in: classes.map((c) => c.id) }, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      _count: { _all: true },
    });
    const byClass = new Map<string, Partial<Record<AttendanceStatus, number>>>();
    for (const g of groups) byClass.set(g.classId, { ...byClass.get(g.classId), [g.status]: g._count._all });
    const toCounts = (c: Partial<Record<AttendanceStatus, number>> | undefined) => ({ PRESENT: c?.PRESENT ?? 0, ABSENT: c?.ABSENT ?? 0, LATE: c?.LATE ?? 0, LEAVE: c?.LEAVE ?? 0, EXCUSED: c?.EXCUSED ?? 0 });
    const rows: ReportRow[] = classes.map((c) => {
      const counts = toCounts(byClass.get(c.id));
      return { class: c.label, present: counts.PRESENT, absent: counts.ABSENT, late: counts.LATE, leave: counts.LEAVE + counts.EXCUSED, pct: attendancePct(counts, settings) };
    });
    const all = toCounts(
      [...byClass.values()].reduce<Partial<Record<AttendanceStatus, number>>>((sum, c) => {
        for (const [k, v] of Object.entries(c)) sum[k as AttendanceStatus] = (sum[k as AttendanceStatus] ?? 0) + (v ?? 0);
        return sum;
      }, {}),
    );
    return {
      subtitle: `${from} to ${to}`,
      columns: [
        { key: "class", label: "Class" },
        { key: "present", label: "Present", format: "int", align: "end" },
        { key: "absent", label: "Absent", format: "int", align: "end" },
        { key: "late", label: "Late", format: "int", align: "end" },
        { key: "leave", label: "Leave", format: "int", align: "end" },
        { key: "pct", label: "Attendance", format: "pct", align: "end" },
      ],
      rows,
      totals: { class: "All classes", present: all.PRESENT, absent: all.ABSENT, late: all.LATE, leave: all.LEAVE + all.EXCUSED, pct: attendancePct(all, settings) },
      chart: { labelKey: "class", valueKey: "pct", format: "pct" },
    };
  }

  private async attendanceBelow(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const { from, to } = dateRange(params, today);
    const [classes, settings, className] = await Promise.all([this.classes(ctx, params.classId), loadSettings(this.prisma, ctx.schoolId), this.classNameOf(ctx, params.classId)]);
    const threshold = params.threshold ? Number(params.threshold) : settings.lowThresholdPct;
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 100) throw new BadRequestException("Pick a percentage between 1 and 100");
    const groups = await this.prisma.attendanceRecord.groupBy({
      by: ["studentId", "status"],
      where: { schoolId: ctx.schoolId, classId: { in: classes.map((c) => c.id) }, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      _count: { _all: true },
    });
    const per = new Map<string, Partial<Record<AttendanceStatus, number>>>();
    for (const g of groups) per.set(g.studentId, { ...per.get(g.studentId), [g.status]: g._count._all });
    const flagged = [...per]
      .map(([studentId, c]) => {
        const counts = { PRESENT: c.PRESENT ?? 0, ABSENT: c.ABSENT ?? 0, LATE: c.LATE ?? 0, LEAVE: c.LEAVE ?? 0, EXCUSED: c.EXCUSED ?? 0 };
        return { studentId, counts, pct: attendancePct(counts, settings) };
      })
      .filter((row): row is typeof row & { pct: number } => row.pct !== null && row.pct < threshold)
      .sort((a, b) => a.pct - b.pct);
    const students = flagged.length
      ? await this.prisma.student.findMany({
          where: { id: { in: flagged.map((f) => f.studentId) }, schoolId: ctx.schoolId },
          select: { id: true, admissionNo: true, firstName: true, lastName: true, enrollments: { where: { active: true }, take: 1, select: { class: { select: { name: true, section: true } } } }, guardians: { take: 1, select: { guardian: { select: { name: true, phone: true } } } } },
        })
      : [];
    const byId = new Map(students.map((s) => [s.id, s]));
    const rows: ReportRow[] = flagged.flatMap((f) => {
      const s = byId.get(f.studentId);
      if (!s) return [];
      const cls = s.enrollments[0]?.class;
      return [
        {
          student: personName(s),
          admissionNo: s.admissionNo,
          class: cls ? `${cls.name} ${cls.section}`.trim() : "",
          present: f.counts.PRESENT + f.counts.LATE,
          absent: f.counts.ABSENT,
          leave: f.counts.LEAVE + f.counts.EXCUSED,
          pct: f.pct,
          guardian: s.guardians[0]?.guardian.name ?? "",
          phone: s.guardians[0]?.guardian.phone ?? "",
        },
      ];
    });
    return {
      subtitle: `${className || "All classes"}, ${from} to ${to}, below ${threshold}%`,
      columns: [
        { key: "student", label: "Student" },
        { key: "admissionNo", label: "Admission no." },
        { key: "class", label: "Class" },
        { key: "present", label: "Days present", format: "int", align: "end" },
        { key: "absent", label: "Days absent", format: "int", align: "end" },
        { key: "leave", label: "On leave", format: "int", align: "end" },
        { key: "pct", label: "Attendance", format: "pct", align: "end" },
        { key: "guardian", label: "Guardian" },
        { key: "phone", label: "Phone" },
      ],
      rows,
      totals: null,
    };
  }

  // Fees ----------------------------------------------------------------------------------------------------

  private async feeCollection(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const { from, to } = dateRange(params, today);
    const groupBy = ["day", "month", "method", "class"].includes(params.groupBy ?? "") ? (params.groupBy as string) : "month";
    const payments = await this.prisma.payment.findMany({
      where: { schoolId: ctx.schoolId, status: "COMPLETED", method: { not: "credit" }, paymentDate: { gte: startOf(from), lte: endOf(to) }, ...this.viaStudent(ctx) },
      orderBy: [{ paymentDate: "asc" }, { id: "asc" }],
      take: 100_000,
      select: {
        paymentDate: true,
        amountPkr: true,
        method: true,
        ...(groupBy === "class" ? { student: { select: { enrollments: { where: { active: true }, take: 1, select: { class: { select: { name: true, section: true } } } } } } } : {}),
      },
    });
    const buckets = new Map<string, { label: string; count: number; amount: number }>();
    for (const p of payments as unknown as { paymentDate: Date; amountPkr: number; method: string; student?: { enrollments: { class: { name: string; section: string } }[] } | null }[]) {
      let key: string;
      let label: string;
      if (groupBy === "day") {
        key = karachiDay(p.paymentDate);
        label = dayName(key);
      } else if (groupBy === "month") {
        key = karachiMonth(p.paymentDate);
        label = monthName(key);
      } else if (groupBy === "method") {
        key = p.method.toLowerCase();
        label = key.charAt(0).toUpperCase() + key.slice(1);
      } else {
        const cls = p.student?.enrollments[0]?.class;
        label = cls ? `${cls.name} ${cls.section}`.trim() : "No class";
        key = label;
      }
      const b = buckets.get(key) ?? { label, count: 0, amount: 0 };
      b.count += 1;
      b.amount += p.amountPkr;
      buckets.set(key, b);
    }
    const ordered = [...buckets].sort(([ka, a], [kb, b]) => (groupBy === "day" || groupBy === "month" ? ka.localeCompare(kb) : groupBy === "class" ? byLabel(a.label, b.label) : b.amount - a.amount)).map(([, b]) => b);
    const totalAmount = ordered.reduce((s, b) => s + b.amount, 0);
    const rows: ReportRow[] = ordered.map((b) => ({ group: b.label, payments: b.count, amountPkr: b.amount, sharePct: percentOf(b.amount, totalAmount) }));
    const groupLabel = { day: "Day", month: "Month", method: "Payment method", class: "Class" }[groupBy]!;
    return {
      subtitle: `Money received ${from} to ${to}`,
      columns: [
        { key: "group", label: groupLabel },
        { key: "payments", label: "Payments", format: "int", align: "end" },
        { key: "amountPkr", label: "Amount", format: "pkr", align: "end" },
        { key: "sharePct", label: "Share", format: "pct", align: "end" },
      ],
      rows,
      totals: { group: "Total", payments: sumOf(rows, "payments"), amountPkr: totalAmount, sharePct: totalAmount ? 100 : null },
      chart: { labelKey: "group", valueKey: "amountPkr", format: "pkr" },
      truncated: payments.length >= 100_000,
    };
  }

  private async feeBillingHeads(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const { from, to } = dateRange(params, today);
    const groups = await this.prisma.invoiceItem.groupBy({
      by: ["feeHeadId"],
      where: { invoice: { schoolId: ctx.schoolId, status: BILLED, issueDate: { gte: startOf(from), lte: endOf(to) }, ...this.viaStudent(ctx) } },
      _sum: { grossAmountPkr: true, discountAmountPkr: true, netAmountPkr: true },
      _count: { _all: true },
    });
    const heads = await this.prisma.feeHead.findMany({ where: { schoolId: ctx.schoolId, id: { in: groups.flatMap((g) => (g.feeHeadId ? [g.feeHeadId] : [])) } }, select: { id: true, name: true } });
    const name = new Map(heads.map((h) => [h.id, h.name]));
    const rows: ReportRow[] = groups
      .map((g) => ({ head: g.feeHeadId ? (name.get(g.feeHeadId) ?? "Removed fee head") : "Other charges", items: g._count._all, grossPkr: g._sum.grossAmountPkr ?? 0, discountPkr: g._sum.discountAmountPkr ?? 0, netPkr: g._sum.netAmountPkr ?? 0 }))
      .sort((a, b) => b.netPkr - a.netPkr);
    const net = sumOf(rows, "netPkr");
    const withShare = rows.map((r) => ({ ...r, sharePct: percentOf(r.netPkr as number, net) }));
    return {
      subtitle: `Billed ${from} to ${to}`,
      columns: [
        { key: "head", label: "Fee head" },
        { key: "items", label: "Bills", format: "int", align: "end" },
        { key: "grossPkr", label: "Before discount", format: "pkr", align: "end" },
        { key: "discountPkr", label: "Discount", format: "pkr", align: "end" },
        { key: "netPkr", label: "Billed", format: "pkr", align: "end" },
        { key: "sharePct", label: "Share", format: "pct", align: "end" },
      ],
      rows: withShare,
      totals: { head: "Total", items: sumOf(rows, "items"), grossPkr: sumOf(rows, "grossPkr"), discountPkr: sumOf(rows, "discountPkr"), netPkr: net, sharePct: net ? 100 : null },
      chart: { labelKey: "head", valueKey: "netPkr", format: "pkr" },
    };
  }

  private async openInvoices(ctx: ReportCtx, classId?: string) {
    return this.prisma.invoice.findMany({
      where: {
        schoolId: ctx.schoolId,
        status: { in: OPEN },
        balanceAmountPkr: { gt: 0 },
        ...this.viaStudent(ctx),
        ...(classId ? { student: { enrollments: { some: { classId, active: true } } } } : {}),
      },
      take: 50_000,
      orderBy: [{ dueOn: "asc" }, { id: "asc" }],
      select: {
        studentId: true,
        dueOn: true,
        balanceAmountPkr: true,
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNo: true,
            enrollments: { where: { active: true }, take: 1, select: { class: { select: { name: true, section: true } } } },
            guardians: { take: 1, select: { guardian: { select: { name: true, phone: true } } } },
          },
        },
      },
    });
  }

  private async feeAging(ctx: ReportCtx, today: string): Promise<Built> {
    const invoices = await this.openInvoices(ctx);
    const buckets = new Map<string, { invoices: number; students: Set<string>; balance: number }>(AGING_BUCKETS.map((b) => [b.key, { invoices: 0, students: new Set<string>(), balance: 0 }]));
    for (const inv of invoices) {
      const b = buckets.get(agingBucket(isoOf(inv.dueOn), today))!;
      b.invoices += 1;
      if (inv.studentId) b.students.add(inv.studentId);
      b.balance += inv.balanceAmountPkr;
    }
    const total = [...buckets.values()].reduce((s, b) => s + b.balance, 0);
    const rows: ReportRow[] = AGING_BUCKETS.map((def) => {
      const b = buckets.get(def.key)!;
      return { age: def.label, invoices: b.invoices, students: b.students.size, balancePkr: b.balance, sharePct: percentOf(b.balance, total) };
    });
    const allStudents = new Set(invoices.flatMap((i) => (i.studentId ? [i.studentId] : [])));
    return {
      subtitle: `All unpaid fees as of ${today}`,
      columns: [
        { key: "age", label: "How overdue" },
        { key: "invoices", label: "Bills", format: "int", align: "end" },
        { key: "students", label: "Students", format: "int", align: "end" },
        { key: "balancePkr", label: "Still owed", format: "pkr", align: "end" },
        { key: "sharePct", label: "Share", format: "pct", align: "end" },
      ],
      rows,
      totals: { age: "Total", invoices: sumOf(rows, "invoices"), students: allStudents.size, balancePkr: total, sharePct: total ? 100 : null },
      chart: { labelKey: "age", valueKey: "balancePkr", format: "pkr" },
      truncated: invoices.length >= 50_000,
    };
  }

  private async feeDefaulters(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const [invoices, className] = await Promise.all([this.openInvoices(ctx, params.classId), this.classNameOf(ctx, params.classId)]);
    const students = new Map<string, { row: ReportRow; balance: number; bills: number; oldest: string }>();
    for (const inv of invoices) {
      const due = isoOf(inv.dueOn);
      if (!inv.studentId || !inv.student || due >= today) continue;
      const cls = inv.student.enrollments[0]?.class;
      const entry = students.get(inv.studentId) ?? {
        balance: 0,
        bills: 0,
        oldest: due,
        row: {
          student: personName(inv.student),
          admissionNo: inv.student.admissionNo,
          class: cls ? `${cls.name} ${cls.section}`.trim() : "",
          guardian: inv.student.guardians[0]?.guardian.name ?? "",
          phone: inv.student.guardians[0]?.guardian.phone ?? "",
        },
      };
      entry.balance += inv.balanceAmountPkr;
      entry.bills += 1;
      if (due < entry.oldest) entry.oldest = due;
      students.set(inv.studentId, entry);
    }
    const rows: ReportRow[] = [...students.values()]
      .sort((a, b) => b.balance - a.balance || String(a.row.student).localeCompare(String(b.row.student)))
      .map((s) => ({ ...s.row, bills: s.bills, oldestDue: s.oldest, daysOverdue: daysOverdue(s.oldest, today), balancePkr: s.balance }));
    return {
      subtitle: `${className || "All classes"}, overdue as of ${today}`,
      columns: [
        { key: "student", label: "Student" },
        { key: "admissionNo", label: "Admission no." },
        { key: "class", label: "Class" },
        { key: "guardian", label: "Guardian" },
        { key: "phone", label: "Phone" },
        { key: "bills", label: "Bills", format: "int", align: "end" },
        { key: "oldestDue", label: "Oldest due", format: "date" },
        { key: "daysOverdue", label: "Days overdue", format: "int", align: "end" },
        { key: "balancePkr", label: "Owes", format: "pkr", align: "end" },
      ],
      rows,
      totals: { student: `${rows.length} students`, bills: sumOf(rows, "bills"), balancePkr: sumOf(rows, "balancePkr") },
      truncated: invoices.length >= 50_000,
    };
  }

  private async feeDiscounts(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const { from, to } = dateRange(params, today, defaultRangeStart("months6", today));
    const groups = await this.prisma.invoice.groupBy({
      by: ["billingPeriod"],
      where: { schoolId: ctx.schoolId, status: BILLED, issueDate: { gte: startOf(from), lte: endOf(to) }, ...this.viaStudent(ctx) },
      _sum: { subtotalPkr: true, discountAmountPkr: true },
      _count: { _all: true },
    });
    const rows: ReportRow[] = groups
      .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod))
      .map((g) => ({
        period: /^\d{4}-\d{2}$/.test(g.billingPeriod) ? monthName(g.billingPeriod) : g.billingPeriod,
        invoices: g._count._all,
        billedPkr: g._sum.subtotalPkr ?? 0,
        discountPkr: g._sum.discountAmountPkr ?? 0,
        pct: percentOf(g._sum.discountAmountPkr ?? 0, g._sum.subtotalPkr ?? 0),
      }));
    const billed = sumOf(rows, "billedPkr");
    const discount = sumOf(rows, "discountPkr");
    return {
      subtitle: `Billed ${from} to ${to}`,
      columns: [
        { key: "period", label: "Billing month" },
        { key: "invoices", label: "Bills", format: "int", align: "end" },
        { key: "billedPkr", label: "Before discount", format: "pkr", align: "end" },
        { key: "discountPkr", label: "Discounts", format: "pkr", align: "end" },
        { key: "pct", label: "Discount rate", format: "pct", align: "end" },
      ],
      rows,
      totals: { period: "Total", invoices: sumOf(rows, "invoices"), billedPkr: billed, discountPkr: discount, pct: percentOf(discount, billed) },
      chart: { labelKey: "period", valueKey: "discountPkr", format: "pkr" },
    };
  }

  private async feeReversals(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const { from, to } = dateRange(params, today);
    const payments = await this.prisma.payment.findMany({
      where: { schoolId: ctx.schoolId, status: { in: ["VOIDED", "REFUNDED"] }, reversedAt: { gte: startOf(from), lte: endOf(to) }, ...this.viaStudent(ctx) },
      orderBy: [{ reversedAt: "desc" }, { id: "asc" }],
      take: LIMIT,
      select: { paymentNumber: true, receiptNo: true, reversedAt: true, paymentDate: true, amountPkr: true, status: true, method: true, student: { select: { firstName: true, lastName: true, admissionNo: true } } },
    });
    const rows: ReportRow[] = payments.map((p) => ({
      reversed: p.reversedAt ? karachiDay(p.reversedAt) : "",
      payment: p.paymentNumber || p.receiptNo,
      paid: karachiDay(p.paymentDate),
      student: p.student ? personName(p.student) : "",
      admissionNo: p.student?.admissionNo ?? "",
      method: p.method,
      kind: p.status === "REFUNDED" ? "Refunded" : "Voided",
      amountPkr: p.amountPkr,
    }));
    return {
      subtitle: `Reversed ${from} to ${to}`,
      columns: [
        { key: "reversed", label: "Reversed on", format: "date" },
        { key: "payment", label: "Payment no." },
        { key: "paid", label: "Paid on", format: "date" },
        { key: "student", label: "Student" },
        { key: "admissionNo", label: "Admission no." },
        { key: "method", label: "Method" },
        { key: "kind", label: "What happened" },
        { key: "amountPkr", label: "Amount", format: "pkr", align: "end" },
      ],
      rows,
      totals: { reversed: "Total", payment: `${rows.length} payments`, amountPkr: sumOf(rows, "amountPkr") },
    };
  }

  // Exams ---------------------------------------------------------------------------------------------------

  private async pickScope(ctx: ReportCtx, params: ReportParams) {
    const scopes = await this.analytics.scopes(ctx.schoolId, ctx.yearId);
    const chosen = scopes.find((s) => s.scope === params.scope && s.scopeId === params.scopeId) ?? scopes[0];
    return chosen ?? null;
  }

  private async examClasses(ctx: ReportCtx, params: ReportParams): Promise<Built> {
    const scope = await this.pickScope(ctx, params);
    const columns: ReportColumn[] = [
      { key: "class", label: "Class" },
      { key: "students", label: "Students", format: "int", align: "end" },
      { key: "avg", label: "Average", format: "pct", align: "end" },
      { key: "median", label: "Median", format: "pct", align: "end" },
      { key: "passPct", label: "Passed", format: "pct", align: "end" },
      { key: "failed", label: "Failed", format: "int", align: "end" },
      { key: "topper", label: "Topper" },
      { key: "topperPct", label: "Topper's score", format: "pct", align: "end" },
    ];
    if (!scope) return { subtitle: "No results have been calculated yet", columns, rows: [], totals: null };
    const result = await this.analytics.classPerformance(ctx.schoolId, ctx.yearId, { scope: scope.scope, scopeId: scope.scopeId }, null);
    const rows: ReportRow[] = result.classes.map((c) => ({ class: c.label, students: c.students, avg: c.avg, median: c.median, passPct: c.passPct, failed: c.failed, topper: c.topper?.name ?? "", topperPct: c.topper?.percentage ?? null }));
    return {
      subtitle: scope.label,
      columns,
      rows,
      totals: { class: "Whole school", students: result.overall.students, avg: result.overall.avg, median: result.overall.median, passPct: result.overall.passPct, failed: sumOf(rows, "failed") },
      chart: { labelKey: "class", valueKey: "avg", format: "pct" },
    };
  }

  private async examSubjects(ctx: ReportCtx, params: ReportParams): Promise<Built> {
    const scope = await this.pickScope(ctx, params);
    const columns: ReportColumn[] = [
      { key: "subject", label: "Subject" },
      { key: "entries", label: "Results counted", format: "int", align: "end" },
      { key: "avg", label: "Average", format: "pct", align: "end" },
      { key: "median", label: "Median", format: "pct", align: "end" },
      { key: "passPct", label: "Passed", format: "pct", align: "end" },
      { key: "failed", label: "Failed", format: "int", align: "end" },
    ];
    if (!scope) return { subtitle: "No results have been calculated yet", columns, rows: [], totals: null };
    const result = await this.analytics.subjectPerformance(ctx.schoolId, ctx.yearId, { scope: scope.scope, scopeId: scope.scopeId }, null);
    const rows: ReportRow[] = result.subjects.map((s) => ({ subject: s.name, entries: s.count, avg: s.avg, median: s.median, passPct: s.passPct, failed: s.failed }));
    return { subtitle: `${scope.label}, weakest subject first`, columns, rows, totals: null, chart: { labelKey: "subject", valueKey: "avg", format: "pct" } };
  }

  // Staff ---------------------------------------------------------------------------------------------------

  private async staffAttendanceReport(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const { from, to } = dateRange(params, today);
    const people = await this.staffAttendance.summaries(ctx, from, to);
    const rows: ReportRow[] = people.map((p) => ({
      staff: p.staff.name,
      employeeNo: p.staff.employeeNo,
      department: p.staff.department,
      present: p.counts.PRESENT,
      late: p.counts.LATE,
      absent: p.counts.ABSENT,
      leave: p.counts.ON_LEAVE,
      pct: p.pct,
    }));
    const all = people.reduce((sum, p) => ({ PRESENT: sum.PRESENT + p.counts.PRESENT, LATE: sum.LATE + p.counts.LATE, ABSENT: sum.ABSENT + p.counts.ABSENT, ON_LEAVE: sum.ON_LEAVE + p.counts.ON_LEAVE }), { PRESENT: 0, LATE: 0, ABSENT: 0, ON_LEAVE: 0 });
    return {
      subtitle: `${from} to ${to}. Days that have not finished yet are not counted.`,
      columns: [
        { key: "staff", label: "Staff member" },
        { key: "employeeNo", label: "Employee no." },
        { key: "department", label: "Department" },
        { key: "present", label: "On time", format: "int", align: "end" },
        { key: "late", label: "Late", format: "int", align: "end" },
        { key: "absent", label: "Absent", format: "int", align: "end" },
        { key: "leave", label: "On leave", format: "int", align: "end" },
        { key: "pct", label: "Attendance", format: "pct", align: "end" },
      ],
      rows,
      totals: { staff: "Everyone", present: all.PRESENT, late: all.LATE, absent: all.ABSENT, leave: all.ON_LEAVE, pct: percentOf(all.PRESENT + all.LATE, all.PRESENT + all.LATE + all.ABSENT) },
    };
  }

  private async payrollByMonth(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const { from, to } = dateRange(params, today, defaultRangeStart("months6", today));
    const months = monthsBetween(from, to);
    const base = { schoolId: ctx.schoolId, period: { gte: months[0]!, lte: months[months.length - 1]! }, status: { not: "CANCELLED" as const } };
    const [all, paid] = await Promise.all([
      this.prisma.payslip.groupBy({ by: ["period"], where: base, _sum: { grossPkr: true, deductionPkr: true, netPkr: true }, _count: { _all: true } }),
      this.prisma.payslip.groupBy({ by: ["period"], where: { ...base, status: "PAID" }, _sum: { netPkr: true } }),
    ]);
    const paidBy = new Map(paid.map((p) => [p.period, p._sum.netPkr ?? 0]));
    const byPeriod = new Map(all.map((a) => [a.period, a]));
    const rows: ReportRow[] = months.map((m) => {
      const a = byPeriod.get(m);
      const net = a?._sum.netPkr ?? 0;
      const paidNet = paidBy.get(m) ?? 0;
      return { period: monthName(m), staff: a?._count._all ?? 0, grossPkr: a?._sum.grossPkr ?? 0, deductionPkr: a?._sum.deductionPkr ?? 0, netPkr: net, paidPkr: paidNet, unpaidPkr: net - paidNet };
    });
    return {
      subtitle: `${monthName(months[0]!)} to ${monthName(months[months.length - 1]!)}`,
      columns: [
        { key: "period", label: "Month" },
        { key: "staff", label: "Payslips", format: "int", align: "end" },
        { key: "grossPkr", label: "Gross", format: "pkr", align: "end" },
        { key: "deductionPkr", label: "Deductions", format: "pkr", align: "end" },
        { key: "netPkr", label: "Net pay", format: "pkr", align: "end" },
        { key: "paidPkr", label: "Paid", format: "pkr", align: "end" },
        { key: "unpaidPkr", label: "Not yet paid", format: "pkr", align: "end" },
      ],
      rows,
      totals: { period: "Total", staff: sumOf(rows, "staff"), grossPkr: sumOf(rows, "grossPkr"), deductionPkr: sumOf(rows, "deductionPkr"), netPkr: sumOf(rows, "netPkr"), paidPkr: sumOf(rows, "paidPkr"), unpaidPkr: sumOf(rows, "unpaidPkr") },
      chart: { labelKey: "period", valueKey: "netPkr", format: "pkr" },
    };
  }

  private async payrollByDepartment(ctx: ReportCtx, params: ReportParams, today: string): Promise<Built> {
    const month = params.month && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.month) ? params.month : today.slice(0, 7);
    const slips = await this.prisma.payslip.findMany({
      where: { schoolId: ctx.schoolId, period: month, status: { not: "CANCELLED" }, ...(ctx.campusId ? { staff: { OR: [{ campusId: ctx.campusId }, { campusId: null }] } } : {}) },
      select: { grossPkr: true, deductionPkr: true, netPkr: true, staff: { select: { department: true } } },
    });
    const byDept = new Map<string, { staff: number; gross: number; deduction: number; net: number }>();
    for (const s of slips) {
      const key = s.staff.department.trim() || "No department";
      const d = byDept.get(key) ?? { staff: 0, gross: 0, deduction: 0, net: 0 };
      d.staff += 1;
      d.gross += s.grossPkr;
      d.deduction += s.deductionPkr;
      d.net += s.netPkr;
      byDept.set(key, d);
    }
    const rows: ReportRow[] = [...byDept].sort((a, b) => b[1].net - a[1].net).map(([department, d]) => ({ department, staff: d.staff, grossPkr: d.gross, deductionPkr: d.deduction, netPkr: d.net }));
    return {
      subtitle: monthName(month),
      columns: [
        { key: "department", label: "Department" },
        { key: "staff", label: "Staff", format: "int", align: "end" },
        { key: "grossPkr", label: "Gross", format: "pkr", align: "end" },
        { key: "deductionPkr", label: "Deductions", format: "pkr", align: "end" },
        { key: "netPkr", label: "Net pay", format: "pkr", align: "end" },
      ],
      rows,
      totals: { department: "Total", staff: sumOf(rows, "staff"), grossPkr: sumOf(rows, "grossPkr"), deductionPkr: sumOf(rows, "deductionPkr"), netPkr: sumOf(rows, "netPkr") },
      chart: { labelKey: "department", valueKey: "netPkr", format: "pkr" },
    };
  }

  // Ratios --------------------------------------------------------------------------------------------------

  async ratios(ctx: ReportCtx, params: ReportParams): Promise<RatioReport> {
    const today = karachiToday();
    const { from, to } = dateRange(params, today);
    const [settings, yearName, classCount, enrollments, teachers, staff, billed, defaulters] = await Promise.all([
      loadSettings(this.prisma, ctx.schoolId),
      this.yearName(ctx),
      this.prisma.class.count({ where: this.classWhere(ctx) }),
      this.prisma.enrollment.findMany({ where: { schoolId: ctx.schoolId, active: true, class: this.classWhere(ctx), student: { status: "active" } }, select: { student: { select: { gender: true } } } }),
      this.prisma.staff.count({
        where: {
          schoolId: ctx.schoolId,
          status: { in: [...TEACHING_STATUSES] },
          ...(ctx.campusId ? { OR: [{ campusId: ctx.campusId }, { campusId: null }] } : {}),
          AND: [{ OR: [{ assignments: { some: { class: { yearId: ctx.yearId } } } }, { lessons: { some: { class: { yearId: ctx.yearId } } } }] }],
        },
      }),
      this.prisma.staff.count({ where: { schoolId: ctx.schoolId, status: { in: [...TEACHING_STATUSES] }, ...(ctx.campusId ? { OR: [{ campusId: ctx.campusId }, { campusId: null }] } : {}) } }),
      this.prisma.invoice.aggregate({
        where: { schoolId: ctx.schoolId, status: BILLED, issueDate: { gte: startOf(from), lte: endOf(to) }, ...this.viaStudent(ctx) },
        _sum: { totalAmountPkr: true, paidAmountPkr: true, subtotalPkr: true, discountAmountPkr: true },
      }),
      this.prisma.invoice.findMany({ where: { schoolId: ctx.schoolId, status: { in: OPEN }, balanceAmountPkr: { gt: 0 }, dueOn: { lt: new Date(`${today}T00:00:00Z`) }, studentId: { not: null }, ...this.viaStudent(ctx) }, distinct: ["studentId"], select: { studentId: true } }),
    ]);

    const classIds = (await this.prisma.class.findMany({ where: this.classWhere(ctx), select: { id: true } })).map((c) => c.id);
    const attendance = await this.prisma.attendanceRecord.groupBy({
      by: ["status"],
      where: { schoolId: ctx.schoolId, classId: { in: classIds }, date: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T00:00:00Z`) } },
      _count: { _all: true },
    });
    const tally = attendanceTally(countStatuses(attendance.flatMap((a) => Array<AttendanceStatus>(a._count._all).fill(a.status))), settings);

    const staffPeople = await this.staffAttendance.summaries(ctx, from, to);
    const staffAttended = staffPeople.reduce((sum, p) => sum + p.counts.PRESENT + p.counts.LATE, 0);
    const staffCounted = staffPeople.reduce((sum, p) => sum + p.counts.PRESENT + p.counts.LATE + p.counts.ABSENT, 0);

    // The most recently calculated result set this year, whichever exam or term it was.
    const latest = await this.prisma.studentResult.findFirst({ where: { schoolId: ctx.schoolId, yearId: ctx.yearId }, orderBy: [{ computedAt: "desc" }, { id: "asc" }], select: { scope: true, scopeKey: true } });
    const resultWhere = latest ? { schoolId: ctx.schoolId, yearId: ctx.yearId, scope: latest.scope, scopeKey: latest.scopeKey, classId: { in: classIds } } : null;
    const [resulted, passed] = resultWhere
      ? await Promise.all([this.prisma.studentResult.count({ where: resultWhere }), this.prisma.studentResult.count({ where: { ...resultWhere, passed: true } })])
      : [0, 0];

    // Six months of history for the two ratios that move month to month.
    const months = Array.from({ length: 6 }, (_, i) => shiftMonth(today.slice(0, 7), i - 5));
    const trendFrom = `${months[0]}-01`;
    const [billing, dailyAttendance] = await Promise.all([
      this.prisma.invoice.groupBy({ by: ["billingPeriod"], where: { schoolId: ctx.schoolId, status: BILLED, billingPeriod: { in: months }, ...this.viaStudent(ctx) }, _sum: { totalAmountPkr: true, paidAmountPkr: true } }),
      this.prisma.attendanceRecord.groupBy({ by: ["date", "status"], where: { schoolId: ctx.schoolId, classId: { in: classIds }, date: { gte: new Date(`${trendFrom}T00:00:00Z`), lte: new Date(`${today}T00:00:00Z`) } }, _count: { _all: true } }),
    ]);
    const billedBy = new Map(billing.map((b) => [b.billingPeriod, b._sum]));
    const monthlyAttendance = new Map<string, Partial<Record<AttendanceStatus, number>>>();
    for (const row of dailyAttendance) {
      const key = isoOf(row.date).slice(0, 7);
      const current = monthlyAttendance.get(key) ?? {};
      current[row.status] = (current[row.status] ?? 0) + row._count._all;
      monthlyAttendance.set(key, current);
    }

    let boys = 0;
    let girls = 0;
    for (const e of enrollments) {
      const g = e.student.gender.trim().toLowerCase();
      if (MALE.has(g)) boys += 1;
      else if (FEMALE.has(g)) girls += 1;
    }

    const ratios = buildRatios({
      students: enrollments.length,
      boys,
      girls,
      classes: classCount,
      teachers,
      staff,
      billedPkr: billed._sum.totalAmountPkr ?? 0,
      collectedPkr: billed._sum.paidAmountPkr ?? 0,
      grossBilledPkr: billed._sum.subtotalPkr ?? 0,
      discountPkr: billed._sum.discountAmountPkr ?? 0,
      overdueStudents: defaulters.length,
      attendedDays: tally.attended,
      countedDays: tally.counted,
      staffAttendedDays: staffAttended,
      staffCountedDays: staffCounted,
      passed,
      resulted,
      collectionTrend: months.map((m) => ({ label: monthName(m), billedPkr: billedBy.get(m)?.totalAmountPkr ?? 0, collectedPkr: billedBy.get(m)?.paidAmountPkr ?? 0 })),
      attendanceTrend: months.map((m) => {
        const c = monthlyAttendance.get(m) ?? {};
        const t = attendanceTally({ PRESENT: c.PRESENT ?? 0, ABSENT: c.ABSENT ?? 0, LATE: c.LATE ?? 0, LEAVE: c.LEAVE ?? 0, EXCUSED: c.EXCUSED ?? 0 }, settings);
        return { label: monthName(m), attendedDays: t.attended, countedDays: t.counted };
      }),
    });
    return { from, to, yearName, ratios, generatedAt: new Date().toISOString() };
  }
}
