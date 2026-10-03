import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import {
  addDays,
  attendancePct,
  eventVisibleTo,
  type CalendarItem,
  countStatuses,
  holidayOn,
  isoOf,
  monthBounds,
  parentProfileSchema,
  weekdayOf,
  type ParentAttendance,
  type ParentChild,
  type ParentDiary,
  type ParentDiaryEntry,
  type ParentFees,
  type ParentMe,
  type ParentNotice,
  type ParentResult,
  type ParentSummary,
  type ParentTimetable,
} from "@wellrun/shared";
import { loadHolidays, loadSettings } from "../attendance/rules";
import { karachiToday, dateOnly } from "../common/date";
import { ReportCardService } from "../exams/report-card.service";
import { ChallanService } from "../fees/challan.service";
import { FeeReceiptService } from "../fees/receipt.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CurrentParent } from "./parent.guard";
import { duesSummary, monthDays, monthOrCurrent } from "./rules";

const childArgs = {
  select: {
    guardian: { select: { relation: true } },
    student: {
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        gender: true,
        extra: true,
        schoolId: true,
        campusId: true,
        school: { select: { id: true, name: true, city: true, primaryColor: true, media: { where: { kind: "LOGO" as const }, select: { url: true }, take: 1 } } },
        enrollments: { where: { active: true }, take: 1, select: { class: { select: { id: true, name: true, section: true, yearId: true } } } },
      },
    },
  },
} satisfies Prisma.StudentGuardianDefaultArgs;

type ChildLink = Prisma.StudentGuardianGetPayload<typeof childArgs>;

/** Everything a parent endpoint needs to know about one of their own children, and nothing else. */
type ChildCtx = { studentId: string; schoolId: string; campusId: string | null; classId: string | null; yearId: string | null; view: ParentChild };

const OPEN_STATUSES = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;
const BILLABLE = { notIn: ["DRAFT", "CANCELLED"] as ("DRAFT" | "CANCELLED")[] };

const stringOr = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

@Injectable()
export class ParentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ChallanService) private readonly challans: ChallanService,
    @Inject(FeeReceiptService) private readonly receipts: FeeReceiptService,
    @Inject(ReportCardService) private readonly reportCards: ReportCardService,
  ) {}

  private toCtx(link: ChildLink): ChildCtx {
    const { student } = link;
    const cls = student.enrollments[0]?.class ?? null;
    const extra = (student.extra && typeof student.extra === "object" ? student.extra : {}) as Record<string, unknown>;
    return {
      studentId: student.id,
      schoolId: student.schoolId,
      campusId: student.campusId,
      classId: cls?.id ?? null,
      yearId: cls?.yearId ?? null,
      view: {
        id: student.id,
        name: `${student.firstName} ${student.lastName}`.trim(),
        firstName: student.firstName,
        admissionNo: student.admissionNo,
        gender: student.gender,
        photoUrl: stringOr(extra.photo),
        classId: cls?.id ?? null,
        classLabel: cls ? `${cls.name} ${cls.section}`.trim() : "",
        relation: link.guardian.relation,
        school: {
          id: student.school.id,
          name: student.school.name,
          city: student.school.city,
          logoUrl: student.school.media[0]?.url ?? "",
          color: student.school.primaryColor,
        },
      },
    };
  }

  private childWhere(parent: CurrentParent): Prisma.StudentGuardianWhereInput {
    return { guardian: { phoneNorm: parent.phoneNorm }, student: { status: "active", school: { deletedAt: null } } };
  }

  /** The single gate: a parent reaches a child only through a guardian record that carries their verified phone. */
  private async owned(parent: CurrentParent, studentId: string): Promise<ChildCtx> {
    const link = await this.prisma.studentGuardian.findFirst({ where: { ...this.childWhere(parent), studentId }, ...childArgs });
    if (!link) throw new ForbiddenException("This child isn't linked to your phone number");
    return this.toCtx(link);
  }

  async children(parent: CurrentParent): Promise<ParentChild[]> {
    const links = await this.prisma.studentGuardian.findMany({ where: this.childWhere(parent), ...childArgs, take: 40 });
    const seen = new Set<string>();
    const out: ParentChild[] = [];
    for (const link of links) {
      if (seen.has(link.student.id)) continue;
      seen.add(link.student.id);
      out.push(this.toCtx(link).view);
    }
    return out.sort((a, b) => a.school.name.localeCompare(b.school.name) || a.firstName.localeCompare(b.firstName));
  }

  /** After sign-in the device isn't known to the guard yet, so build the caller from the parent record. */
  async profileById(parentId: string): Promise<CurrentParent> {
    const row = await this.prisma.parentUser.findUniqueOrThrow({ where: { id: parentId }, select: { id: true, phoneNorm: true, name: true, locale: true } });
    return { ...row, deviceId: "" };
  }

  async me(parent: CurrentParent): Promise<ParentMe> {
    return { parent: { id: parent.id, phone: `+${parent.phoneNorm}`, name: parent.name, locale: parent.locale === "ur" ? "ur" : "en" }, children: await this.children(parent) };
  }

  async updateProfile(parent: CurrentParent, body: unknown) {
    const data = parentProfileSchema.parse(body);
    await this.prisma.parentUser.update({ where: { id: parent.id }, data: { locale: data.locale, name: data.name }, select: { id: true } });
    return this.me({ ...parent, locale: data.locale ?? parent.locale, name: data.name ?? parent.name });
  }

  private noticeWhere(ctx: ChildCtx): Prisma.NoticeWhereInput {
    const and: Prisma.NoticeWhereInput[] = [
      { OR: [{ audience: "ALL" }, ...(ctx.classId ? [{ audience: "CLASSES" as const, classIds: { array_contains: [ctx.classId] } }] : [])] },
    ];
    if (ctx.campusId) and.push({ OR: [{ campusId: null }, { campusId: ctx.campusId }] });
    return { schoolId: ctx.schoolId, AND: and };
  }

  async summary(parent: CurrentParent, studentId: string): Promise<ParentSummary> {
    const ctx = await this.owned(parent, studentId);
    const today = karachiToday();
    const { from, to } = monthBounds(today.slice(0, 7));
    const [settings, holidays, records, invoices, nextExam, todayDiary, dueSoon, notice] = await Promise.all([
      loadSettings(this.prisma, ctx.schoolId),
      loadHolidays(this.prisma, ctx.schoolId, today, today, ctx.campusId),
      this.prisma.attendanceRecord.findMany({ where: { studentId, date: { gte: dateOnly(from), lte: dateOnly(to) } }, select: { date: true, status: true } }),
      this.prisma.invoice.findMany({ where: { studentId, status: BILLABLE }, select: { status: true, dueOn: true, balanceAmountPkr: true, amountPkr: true, paidAmountPkr: true } }),
      ctx.classId
        ? this.prisma.examPaper.findFirst({
            where: { classId: ctx.classId, date: { gte: dateOnly(today) }, exam: { status: { not: "DRAFT" } } },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
            select: { date: true, startTime: true, subject: { select: { name: true } }, exam: { select: { name: true } } },
          })
        : null,
      ctx.classId ? this.prisma.diaryEntry.count({ where: { classId: ctx.classId, date: dateOnly(today) } }) : 0,
      ctx.classId ? this.prisma.diaryEntry.count({ where: { classId: ctx.classId, kind: "HOMEWORK", dueOn: { gte: dateOnly(today), lte: dateOnly(addDays(today, 7)) } } }) : 0,
      this.prisma.notice.findFirst({ where: this.noticeWhere(ctx), orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }], select: { id: true, title: true, publishedAt: true } }),
    ]);
    const holiday = holidayOn(today, holidays)?.name ?? null;
    const working = settings.workingWeekdays.includes(weekdayOf(today)) && !holiday;
    const todays = records.find((row) => isoOf(row.date) === today);
    const counts = countStatuses(records.map((row) => row.status));
    return {
      child: ctx.view,
      date: today,
      attendance: { working, holiday, status: todays?.status ?? null, monthPct: attendancePct(counts, settings), absentThisMonth: counts.ABSENT },
      fees: duesSummary(
        invoices.map((row) => ({
          status: row.status,
          dueOn: isoOf(row.dueOn),
          balancePkr: (OPEN_STATUSES as readonly string[]).includes(row.status) ? row.balanceAmountPkr || Math.max(row.amountPkr - row.paidAmountPkr, 0) : 0,
        })),
        today,
      ),
      nextExam: nextExam?.date ? { examName: nextExam.exam.name, subject: nextExam.subject.name, date: isoOf(nextExam.date), startTime: nextExam.startTime } : null,
      diary: { todayCount: todayDiary, dueSoonCount: dueSoon },
      notice: notice ? { id: notice.id, title: notice.title, publishedAt: notice.publishedAt.toISOString() } : null,
    };
  }

  async attendance(parent: CurrentParent, studentId: string, monthInput?: string): Promise<ParentAttendance> {
    const ctx = await this.owned(parent, studentId);
    const month = monthOrCurrent(monthInput, karachiToday());
    const { from, to } = monthBounds(month);
    const [settings, holidays, records] = await Promise.all([
      loadSettings(this.prisma, ctx.schoolId),
      loadHolidays(this.prisma, ctx.schoolId, from, to, ctx.campusId),
      this.prisma.attendanceRecord.findMany({ where: { studentId, date: { gte: dateOnly(from), lte: dateOnly(to) } }, select: { date: true, status: true } }),
    ]);
    const marked = records.map((row) => ({ date: isoOf(row.date), status: row.status }));
    const counts = countStatuses(marked.map((row) => row.status));
    return { month, days: monthDays(month, marked, holidays, settings.workingWeekdays), counts, pct: attendancePct(counts, settings) };
  }

  private diaryRow(row: {
    id: string;
    date: Date;
    kind: ParentDiaryEntry["kind"];
    title: string;
    body: string;
    dueOn: Date | null;
    imageUrl: string;
    subject: { name: string } | null;
    author: { name: string } | null;
  }): ParentDiaryEntry {
    return {
      id: row.id,
      date: isoOf(row.date),
      kind: row.kind,
      subject: row.subject?.name ?? null,
      title: row.title,
      body: row.body,
      dueOn: row.dueOn ? isoOf(row.dueOn) : null,
      imageUrl: row.imageUrl,
      author: row.author?.name ?? null,
    };
  }

  async diary(parent: CurrentParent, studentId: string, dateInput?: string): Promise<ParentDiary> {
    const ctx = await this.owned(parent, studentId);
    const today = karachiToday();
    const date = dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? dateInput : today;
    if (!ctx.classId) return { date, entries: [], dueSoon: [] };
    const select = { id: true, date: true, kind: true, title: true, body: true, dueOn: true, imageUrl: true, subject: { select: { name: true } }, author: { select: { name: true } } } as const;
    const [entries, dueSoon] = await Promise.all([
      this.prisma.diaryEntry.findMany({ where: { classId: ctx.classId, date: dateOnly(date) }, select, orderBy: [{ subject: { name: "asc" } }, { createdAt: "asc" }], take: 50 }),
      this.prisma.diaryEntry.findMany({
        where: { classId: ctx.classId, kind: "HOMEWORK", dueOn: { gte: dateOnly(today), lte: dateOnly(addDays(today, 14)) }, NOT: { date: dateOnly(date) } },
        select,
        orderBy: [{ dueOn: "asc" }, { createdAt: "asc" }],
        take: 30,
      }),
    ]);
    return { date, entries: entries.map((row) => this.diaryRow(row)), dueSoon: dueSoon.map((row) => this.diaryRow(row)) };
  }

  async fees(parent: CurrentParent, studentId: string): Promise<ParentFees> {
    const ctx = await this.owned(parent, studentId);
    const [invoices, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { studentId, schoolId: ctx.schoolId, status: BILLABLE },
        orderBy: [{ issueDate: "desc" }, { id: "asc" }],
        take: 24,
        select: { id: true, invoiceNumber: true, billingPeriod: true, issueDate: true, dueOn: true, status: true, amountPkr: true, totalAmountPkr: true, paidAmountPkr: true, balanceAmountPkr: true },
      }),
      this.prisma.payment.findMany({
        where: { studentId, schoolId: ctx.schoolId, status: "COMPLETED", method: { not: "credit" } },
        orderBy: [{ paymentDate: "desc" }, { id: "asc" }],
        take: 24,
        select: { id: true, paymentNumber: true, receiptNo: true, paymentDate: true, amountPkr: true, method: true, allocations: { select: { invoice: { select: { invoiceNumber: true } } } } },
      }),
    ]);
    const rows = invoices.map((row) => {
      const total = row.totalAmountPkr || row.amountPkr;
      const open = (OPEN_STATUSES as readonly string[]).includes(row.status);
      return {
        id: row.id,
        number: row.invoiceNumber,
        period: row.billingPeriod,
        issueDate: isoOf(row.issueDate),
        dueOn: isoOf(row.dueOn),
        totalPkr: total,
        paidPkr: row.paidAmountPkr,
        balancePkr: open ? row.balanceAmountPkr || Math.max(total - row.paidAmountPkr, 0) : 0,
        status: row.status,
      };
    });
    return {
      totalDuePkr: rows.reduce((sum, row) => sum + row.balancePkr, 0),
      invoices: rows,
      payments: payments.map((row) => ({
        id: row.id,
        number: row.paymentNumber || row.receiptNo,
        date: isoOf(row.paymentDate),
        amountPkr: row.amountPkr,
        method: row.method,
        invoices: [...new Set(row.allocations.map((a) => a.invoice.invoiceNumber))],
      })),
    };
  }

  async challanPdf(parent: CurrentParent, studentId: string, invoiceId: string, res: Response) {
    const ctx = await this.owned(parent, studentId);
    const invoice = await this.prisma.invoice.findFirst({ where: { id: invoiceId, studentId, schoolId: ctx.schoolId, status: BILLABLE }, select: { id: true } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    return this.challans.pdf(ctx.schoolId, invoice.id, res);
  }

  async receiptPdf(parent: CurrentParent, studentId: string, paymentId: string, res: Response) {
    const ctx = await this.owned(parent, studentId);
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, studentId, schoolId: ctx.schoolId, status: "COMPLETED" }, select: { id: true } });
    if (!payment) throw new NotFoundException("Receipt not found");
    return this.receipts.pdf(ctx.schoolId, payment.id, res);
  }

  /** Only results the school has published; a parent never sees marks that are still being checked. */
  async results(parent: CurrentParent, studentId: string): Promise<ParentResult[]> {
    const ctx = await this.owned(parent, studentId);
    const rows = await this.prisma.studentResult.findMany({
      where: { studentId, schoolId: ctx.schoolId, publishedAt: { not: null } },
      orderBy: [{ publishedAt: "desc" }, { id: "asc" }],
      take: 20,
      include: { exam: { select: { name: true } }, year: { select: { name: true } } },
    });
    const termIds = [...new Set(rows.flatMap((row) => (row.termId ? [row.termId] : [])))];
    const terms = termIds.length ? await this.prisma.term.findMany({ where: { id: { in: termIds } }, select: { id: true, name: true } }) : [];
    const termName = new Map(terms.map((term) => [term.id, term.name]));
    return rows.map((row) => {
      const subjects = (Array.isArray(row.subjects) ? row.subjects : []) as { name?: string; obtained?: number; max?: number; grade?: string; passed?: boolean }[];
      return {
        id: row.id,
        title: row.scope === "EXAM" ? (row.exam?.name ?? "Exam") : row.scope === "TERM" ? (termName.get(row.termId ?? "") ?? "Term") : "Annual result",
        scope: row.scope,
        yearName: row.year.name,
        totalObtained: row.totalObtained,
        totalMax: row.totalMax,
        percentage: row.percentage,
        grade: row.grade,
        rank: row.rank,
        passed: row.passed,
        attendancePct: row.attendancePct,
        teacherRemark: row.teacherRemark,
        principalRemark: row.principalRemark,
        subjects: subjects.map((s) => ({ name: s.name ?? "", obtained: s.obtained ?? 0, max: s.max ?? 0, grade: s.grade ?? "", passed: s.passed ?? false })),
        publishedAt: (row.publishedAt ?? row.computedAt).toISOString(),
      };
    });
  }

  async reportCardPdf(parent: CurrentParent, studentId: string, resultId: string, res: Response) {
    const ctx = await this.owned(parent, studentId);
    const result = await this.prisma.studentResult.findFirst({
      where: { id: resultId, studentId, schoolId: ctx.schoolId, publishedAt: { not: null } },
      select: { scope: true, scopeKey: true, yearId: true },
    });
    if (!result) throw new NotFoundException("Result not found");
    return this.reportCards.pdf(ctx.schoolId, result.yearId, { scope: result.scope, scopeId: result.scopeKey, studentId }, null, res);
  }

  async timetable(parent: CurrentParent, studentId: string): Promise<ParentTimetable> {
    const ctx = await this.owned(parent, studentId);
    if (!ctx.classId) return { periods: [], lessons: [] };
    const [periods, lessons] = await Promise.all([
      this.prisma.timetablePeriod.findMany({ where: { schoolId: ctx.schoolId }, orderBy: { sortOrder: "asc" }, select: { id: true, label: true, startTime: true, endTime: true, isBreak: true } }),
      this.prisma.timetableLesson.findMany({ where: { classId: ctx.classId }, select: { weekday: true, periodId: true, subject: true, staff: { select: { name: true } } } }),
    ]);
    return { periods, lessons: lessons.map((row) => ({ weekday: row.weekday, periodId: row.periodId, subject: row.subject, teacher: row.staff?.name ?? null })) };
  }

  /**
   * What is coming up for this child: events for everyone or for their class, holidays, and their class's exam papers.
   * Staff-only events never appear, and neither do exams that haven't been announced yet.
   */
  async calendar(parent: CurrentParent, studentId: string, fromInput?: string, toInput?: string): Promise<CalendarItem[]> {
    const ctx = await this.owned(parent, studentId);
    const today = karachiToday();
    const isDay = (v?: string) => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
    const from = isDay(fromInput) ? fromInput! : `${today.slice(0, 7)}-01`;
    const to = isDay(toInput) ? toInput! : monthBounds(from.slice(0, 7)).to;
    if (to < from || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000 > 62) return [];
    const [events, holidays, papers] = await Promise.all([
      this.prisma.schoolEvent.findMany({
        where: {
          schoolId: ctx.schoolId,
          audience: { not: "STAFF" },
          startsOn: { lte: dateOnly(to) },
          OR: [{ endsOn: { gte: dateOnly(from) } }, { endsOn: null, startsOn: { gte: dateOnly(from) } }],
          AND: [{ OR: [{ campusId: null }, ...(ctx.campusId ? [{ campusId: ctx.campusId }] : [])] }],
        },
        orderBy: [{ startsOn: "asc" }, { id: "asc" }],
        take: 300,
      }),
      loadHolidays(this.prisma, ctx.schoolId, from, to, ctx.campusId),
      ctx.classId
        ? this.prisma.examPaper.findMany({
            where: { classId: ctx.classId, date: { gte: dateOnly(from), lte: dateOnly(to) }, exam: { status: { not: "DRAFT" } } },
            orderBy: [{ date: "asc" }, { startTime: "asc" }],
            take: 300,
            select: { id: true, date: true, startTime: true, endTime: true, subject: { select: { name: true } }, exam: { select: { name: true } } },
          })
        : [],
    ]);
    const viewer = { role: "parent" as const, classIds: new Set(ctx.classId ? [ctx.classId] : []) };
    const idsOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);
    return [
      ...holidays.map((h) => ({ id: `holiday:${h.name}:${h.startsOn}`, type: "HOLIDAY" as const, title: h.name, subtitle: "", date: h.startsOn, endDate: h.endsOn, startTime: "", endTime: "", kind: null, audience: null, classLabels: [], eventId: null })),
      ...events
        .filter((e) => eventVisibleTo({ audience: e.audience, classIds: idsOf(e.classIds) }, viewer))
        .map((e) => ({
          id: e.id,
          type: "EVENT" as const,
          title: e.title,
          subtitle: [e.location, e.description].filter(Boolean).join(" · "),
          date: isoOf(e.startsOn),
          endDate: e.endsOn ? isoOf(e.endsOn) : isoOf(e.startsOn),
          startTime: e.allDay ? "" : e.startTime,
          endTime: e.allDay ? "" : e.endTime,
          kind: e.kind,
          audience: null,
          classLabels: [],
          eventId: null,
        })),
      ...papers.flatMap((p) =>
        p.date
          ? [{ id: `exam:${p.id}`, type: "EXAM" as const, title: p.subject.name, subtitle: p.exam.name, date: isoOf(p.date), endDate: isoOf(p.date), startTime: p.startTime, endTime: p.endTime, kind: null, audience: null, classLabels: [], eventId: null }]
          : [],
      ),
    ];
  }

  async notices(parent: CurrentParent, studentId: string): Promise<ParentNotice[]> {
    const ctx = await this.owned(parent, studentId);
    const rows = await this.prisma.notice.findMany({
      where: this.noticeWhere(ctx),
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }, { id: "asc" }],
      take: 40,
      select: { id: true, title: true, body: true, pinned: true, publishedAt: true },
    });
    return rows.map((row) => ({ id: row.id, title: row.title, body: row.body, pinned: row.pinned, publishedAt: row.publishedAt.toISOString() }));
  }
}
