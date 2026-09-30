import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  addDays,
  attendancePct,
  attendanceReportQuery,
  daysBetween,
  emptyCounts,
  isoOf,
  monthBounds,
  type AttendanceCounts,
  type AttendanceOverview,
  type AttendanceReport,
  type AttendanceStatus,
  type StudentAttendanceSummary,
} from "@wellrun/shared";
import { dateOnly, karachiToday } from "../common/date";
import { teacherClassIds } from "../common/school";
import type { SchoolScope } from "../common/school-scope";
import { resolveYearId } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { classLabel } from "./attendance.service";
import { buildDays, classRoster } from "./register.service";
import { loadHolidays, loadSettings, requireAttendanceAdmin, type AttendanceCtx } from "./rules";

type StatusRow = { status: string; _count: { _all: number } };

function addCounts(counts: AttendanceCounts, row: StatusRow) {
  counts[row.status as AttendanceStatus] += row._count._all;
  return counts;
}

const minDate = (a: string, b: string) => (a < b ? a : b);
const maxDate = (a: string, b: string) => (a > b ? a : b);

@Injectable()
export class AttendanceReportsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Classes this viewer may report on: the year's classes (and campus), narrowed to a teacher's own. */
  private async scopedClasses(ctx: AttendanceCtx, classId?: string) {
    const yearId = await resolveYearId(this.prisma, ctx.schoolId, ctx.scope);
    const own = ctx.isAdmin ? null : ((await teacherClassIds(this.prisma, ctx.user)) ?? []);
    if (classId && own && !own.includes(classId)) throw new ForbiddenException("This class is not assigned to you");
    const classes = await this.prisma.class.findMany({
      where: {
        schoolId: ctx.schoolId,
        ...(classId ? { id: classId } : { yearId, ...(ctx.scope.campusId ? { campusId: ctx.scope.campusId } : {}) }),
        ...(own ? { id: classId ?? { in: own } } : {}),
      },
      select: { id: true, name: true, section: true, campusId: true },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });
    if (classId && !classes.length) throw new NotFoundException("Class not found");
    return classes;
  }

  async report(ctx: AttendanceCtx, query: unknown): Promise<AttendanceReport> {
    const { classId, from, to, below, limit, offset, register: withRegister } = attendanceReportQuery.parse(query);
    if (daysBetween(from, to) > 400) throw new BadRequestException("Pick a range of about a year or less");
    const classes = await this.scopedClasses(ctx, classId);
    const today = karachiToday();
    const campusId = classId ? classes[0]?.campusId ?? null : ctx.scope.campusId ?? null;
    const [settings, holidays, roster] = await Promise.all([
      loadSettings(this.prisma, ctx.schoolId),
      loadHolidays(this.prisma, ctx.schoolId, from, to, campusId),
      classRoster(this.prisma, ctx.schoolId, classes.map((c) => c.id)),
    ]);
    const range = { gte: dateOnly(from), lte: dateOnly(to) };
    // Counts are aggregated in the database for everyone so the totals cover the whole report; only one page of rows is sent.
    const grouped = roster.length
      ? await this.prisma.attendanceRecord.groupBy({
          by: ["studentId", "status"],
          where: { schoolId: ctx.schoolId, studentId: { in: roster.map((s) => s.id) }, date: range },
          _count: { _all: true },
        })
      : [];

    const byStudent = new Map<string, AttendanceCounts>();
    for (const row of grouped) addCounts(byStudent.get(row.studentId) ?? byStudent.set(row.studentId, emptyCounts()).get(row.studentId)!, row);
    const labels = new Map(classes.map((c) => [c.id, classLabel(c)]));
    const totals = emptyCounts();
    const all = roster.map((s) => {
      const counts = byStudent.get(s.id) ?? emptyCounts();
      for (const key of Object.keys(totals) as AttendanceStatus[]) totals[key] += counts[key];
      const pct = attendancePct(counts, settings);
      return {
        id: s.id,
        name: s.name,
        admissionNo: s.admissionNo,
        rollNo: s.rollNo,
        classId: s.classId,
        className: labels.get(s.classId) ?? "",
        counts,
        pct,
        below: pct !== null && pct < settings.lowThresholdPct,
      };
    });
    // Class, then roll number, then name; the id makes the order total so pages never repeat or skip a student.
    const order = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    all.sort(
      (a, b) =>
        order.compare(a.className, b.className) ||
        order.compare(a.rollNo ?? "~", b.rollNo ?? "~") ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
    const pcts = all.map((r) => r.pct).filter((p): p is number => p !== null);
    const filtered = below === "1" ? all.filter((r) => r.below) : all;
    const rows = filtered.slice(offset, offset + limit);

    const days = buildDays(from, to, settings, holidays);
    let register: AttendanceReport["register"] = null;
    if (classId && withRegister === "1" && rows.length) {
      const detail = await this.prisma.attendanceRecord.findMany({
        where: { schoolId: ctx.schoolId, studentId: { in: rows.map((r) => r.id) }, date: range },
        select: { studentId: true, date: true, status: true },
      });
      const marks: Record<string, Record<string, AttendanceStatus>> = {};
      for (const row of detail) (marks[row.studentId] ??= {})[isoOf(row.date)] = row.status as AttendanceStatus;
      register = { days, marks };
    }
    return {
      from,
      to,
      workingDays: days.filter((d) => d.working && d.date <= today).length,
      settings,
      rows,
      page: { total: filtered.length, offset, limit, hasMore: offset + rows.length < filtered.length },
      totals: {
        students: all.length,
        avgPct: pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null,
        below: all.filter((r) => r.below).length,
        counts: totals,
      },
      register,
    };
  }

  /** School-wide picture for a day: who is marked, today's %, a 30-day trend and the students below threshold. */
  async overview(ctx: AttendanceCtx, date = karachiToday()): Promise<AttendanceOverview> {
    requireAttendanceAdmin(ctx);
    const yearId = await resolveYearId(this.prisma, ctx.schoolId, ctx.scope);
    const [year, classes, settings] = await Promise.all([
      this.prisma.academicYear.findUniqueOrThrow({ where: { id: yearId }, select: { startsOn: true, endsOn: true } }),
      this.scopedClasses(ctx),
      loadSettings(this.prisma, ctx.schoolId),
    ]);
    const classIds = classes.map((c) => c.id);
    const trendFrom = addDays(date, -29);
    const yearFrom = isoOf(year.startsOn);
    const yearTo = minDate(isoOf(year.endsOn), date);
    const [holidays, enrolled, todayRows, trendRows, roster] = await Promise.all([
      loadHolidays(this.prisma, ctx.schoolId, minDate(trendFrom, yearFrom), date, ctx.scope.campusId ?? null),
      this.prisma.enrollment.groupBy({ by: ["classId"], where: { schoolId: ctx.schoolId, classId: { in: classIds }, active: true }, _count: { _all: true } }),
      this.prisma.attendanceRecord.groupBy({
        by: ["classId", "status"],
        where: { schoolId: ctx.schoolId, classId: { in: classIds }, date: dateOnly(date) },
        _count: { _all: true },
      }),
      this.prisma.attendanceRecord.groupBy({
        by: ["date", "status"],
        where: { schoolId: ctx.schoolId, classId: { in: classIds }, date: { gte: dateOnly(trendFrom), lte: dateOnly(date) } },
        _count: { _all: true },
      }),
      classRoster(this.prisma, ctx.schoolId, classIds),
    ]);
    const yearRows = roster.length && yearFrom <= yearTo
      ? await this.prisma.attendanceRecord.groupBy({
          by: ["studentId", "status"],
          where: { schoolId: ctx.schoolId, studentId: { in: roster.map((s) => s.id) }, date: { gte: dateOnly(yearFrom), lte: dateOnly(yearTo) } },
          _count: { _all: true },
        })
      : [];

    const days = buildDays(trendFrom, date, settings, holidays);
    const todayInfo = days[days.length - 1]!;
    const perClass = new Map<string, AttendanceCounts>();
    const todayCounts = emptyCounts();
    for (const row of todayRows) {
      addCounts(perClass.get(row.classId) ?? perClass.set(row.classId, emptyCounts()).get(row.classId)!, row);
      addCounts(todayCounts, row);
    }
    const perDay = new Map<string, AttendanceCounts>();
    for (const row of trendRows) {
      const key = isoOf(row.date);
      addCounts(perDay.get(key) ?? perDay.set(key, emptyCounts()).get(key)!, row);
    }
    const perStudent = new Map<string, AttendanceCounts>();
    for (const row of yearRows) addCounts(perStudent.get(row.studentId) ?? perStudent.set(row.studentId, emptyCounts()).get(row.studentId)!, row);
    const enrolledBy = new Map(enrolled.map((row) => [row.classId, row._count._all]));
    const labels = new Map(classes.map((c) => [c.id, classLabel(c)]));
    const sum = (c: AttendanceCounts) => c.PRESENT + c.ABSENT + c.LATE + c.LEAVE + c.EXCUSED;

    return {
      date,
      working: todayInfo.working,
      holiday: todayInfo.holiday,
      today: {
        marked: sum(todayCounts),
        present: todayCounts.PRESENT,
        absent: todayCounts.ABSENT,
        late: todayCounts.LATE,
        leave: todayCounts.LEAVE + todayCounts.EXCUSED,
        pct: attendancePct(todayCounts, settings),
      },
      classes: classes.map((c) => {
        const counts = perClass.get(c.id) ?? emptyCounts();
        return { id: c.id, label: labels.get(c.id)!, students: enrolledBy.get(c.id) ?? 0, marked: sum(counts), pct: attendancePct(counts, settings) };
      }),
      trend: days.filter((d) => d.working).map((d) => ({ date: d.date, pct: attendancePct(perDay.get(d.date) ?? emptyCounts(), settings) })),
      lowStudents: roster
        .map((s) => ({ id: s.id, name: s.name, className: labels.get(s.classId) ?? "", pct: attendancePct(perStudent.get(s.id) ?? emptyCounts(), settings) }))
        .filter((s): s is typeof s & { pct: number } => s.pct !== null && s.pct < settings.lowThresholdPct)
        .sort((a, b) => a.pct - b.pct)
        .slice(0, 12),
      thresholdPct: settings.lowThresholdPct,
    };
  }

  /** A student's academic-year and per-term %, monthly trend, this month's calendar and recent non-present days. */
  async student(schoolId: string, studentId: string, scope: SchoolScope = {}): Promise<StudentAttendanceSummary> {
    const [student, settings] = await Promise.all([
      this.prisma.student.findFirst({ where: { id: studentId, schoolId }, select: { campusId: true } }),
      loadSettings(this.prisma, schoolId),
    ]);
    if (!student) throw new NotFoundException("Student not found");
    const today = karachiToday();
    let yearId: string | null = null;
    try {
      yearId = await resolveYearId(this.prisma, schoolId, scope);
    } catch {
      yearId = null;
    }
    const year = yearId
      ? await this.prisma.academicYear.findUnique({
          where: { id: yearId },
          select: { id: true, name: true, startsOn: true, endsOn: true, terms: { orderBy: { sortOrder: "asc" }, select: { id: true, name: true, startsOn: true, endsOn: true } } },
        })
      : null;
    const from = year ? isoOf(year.startsOn) : addDays(today, -365);
    const to = year ? minDate(isoOf(year.endsOn), today) : today;
    const calMonth = (to < from ? from : to).slice(0, 7);
    const cal = monthBounds(calMonth);
    const [holidays, records] = await Promise.all([
      loadHolidays(this.prisma, schoolId, minDate(from, cal.from), maxDate(to, cal.to), student.campusId),
      this.prisma.attendanceRecord.findMany({
        where: { schoolId, studentId, date: { gte: dateOnly(minDate(from, cal.from)), lte: dateOnly(maxDate(to, cal.to)) } },
        select: { date: true, status: true, class: { select: { name: true, section: true } } },
        orderBy: { date: "desc" },
      }),
    ]);
    const marks = records.map((r) => ({ date: isoOf(r.date), status: r.status as AttendanceStatus, className: classLabel(r.class) }));
    const countIn = (a: string, b: string) => {
      const counts = emptyCounts();
      for (const m of marks) if (m.date >= a && m.date <= b) counts[m.status] += 1;
      return counts;
    };
    const yearCounts = countIn(from, to);

    const months: StudentAttendanceSummary["months"] = [];
    for (let m = from.slice(0, 7); m <= to.slice(0, 7); ) {
      const b = monthBounds(m);
      const counts = countIn(maxDate(b.from, from), minDate(b.to, to));
      months.push({ month: m, counts, pct: attendancePct(counts, settings) });
      const next = new Date(`${m}-01T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      m = isoOf(next).slice(0, 7);
    }
    const byDate = new Map(marks.map((m) => [m.date, m.status]));

    return {
      thresholdPct: settings.lowThresholdPct,
      year: year
        ? {
            id: year.id,
            name: year.name,
            from,
            to,
            counts: yearCounts,
            pct: attendancePct(yearCounts, settings),
            workingDays: from <= to ? buildDays(from, to, settings, holidays).filter((d) => d.working).length : 0,
          }
        : null,
      terms: (year?.terms ?? []).map((term) => {
        const a = isoOf(term.startsOn);
        const b = isoOf(term.endsOn);
        const counts = countIn(a, minDate(b, today));
        return { id: term.id, name: term.name, from: a, to: b, counts, pct: attendancePct(counts, settings), current: a <= today && today <= b };
      }),
      months,
      calendar: {
        month: calMonth,
        days: buildDays(cal.from, cal.to, settings, holidays).map((d) => ({ ...d, status: byDate.get(d.date) ?? null })),
      },
      recent: marks.filter((m) => m.status !== "PRESENT" && m.date >= from && m.date <= to).slice(0, 15),
    };
  }
}
