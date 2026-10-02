import { Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  checkInResult,
  deriveStaffDay,
  eachDay,
  holidayOn,
  isWorkingDay,
  isoOf,
  karachiClockText,
  karachiMinutes,
  monthBounds,
  type HolidayRange,
  type StaffAttendanceDay,
  type StaffAttendanceRow,
  type StaffCheckIn,
  type StaffCounts,
  type StaffMonth,
} from "@wellrun/shared";
import { loadHolidays, loadSettings } from "../attendance/rules";
import { dateOnly, karachiToday } from "../common/date";
import { staffForUser } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";
import { summariseStaff, tallyDay, type StaffLeaveSpan } from "./summary";

export type StaffCtx = { schoolId: string; campusId?: string };

const TRACKED = ["ACTIVE", "ON_LEAVE"] as const;

/** Staff with no join date on file have always been here. */
const joinedOn = (s: { joinDate: Date | null }) => (s.joinDate ? isoOf(s.joinDate) : "1900-01-01");

const staffSelect = { id: true, name: true, employeeNo: true, title: true, department: true, campusId: true, joinDate: true } satisfies Prisma.StaffSelect;

@Injectable()
export class StaffAttendanceService {
  private readonly logger = new Logger(StaffAttendanceService.name);
  /** user id -> the day we last made sure they were checked in. Saves a database round trip on every request. */
  private readonly handled = new Map<string, string>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Automatic check-in --------------------------------------------------------------------------------------

  /**
   * Called on every signed-in request but does work only the first time a person is seen each day, so
   * a long-lived session still counts as turning up. It must never get in the way of the request itself.
   */
  async touch(user: { id: string; email: string; schoolId: string | null; role: string }) {
    if (!user.schoolId || user.role === "PLATFORM_ADMIN") return;
    const today = karachiToday();
    if (this.handled.get(user.id) === today) return;
    this.handled.set(user.id, today);
    if (this.handled.size > 5000) for (const [id, day] of this.handled) if (day !== today) this.handled.delete(id);
    try {
      await this.checkIn({ id: user.id, email: user.email, schoolId: user.schoolId }, today, new Date());
    } catch (error) {
      this.handled.delete(user.id);
      this.logger.warn(`Check-in failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  /** Records the first activity of the day. Never overwrites: the first moment of the day is the check-in. */
  async checkIn(user: { id: string; email: string; schoolId: string }, today: string, now: Date) {
    const staff = await staffForUser(this.prisma, user);
    if (!staff || !TRACKED.includes(staff.status as (typeof TRACKED)[number])) return null;
    const date = dateOnly(today);
    if (await this.prisma.staffAttendance.findUnique({ where: { staffId_date: { staffId: staff.id, date } }, select: { id: true } })) return null;
    const [settings, holidays] = await Promise.all([loadSettings(this.prisma, user.schoolId), loadHolidays(this.prisma, user.schoolId, today, today, staff.campusId)]);
    if (!isWorkingDay(today, settings, holidays)) return null;
    const onLeave = await this.prisma.staffLeave.findFirst({ where: { staffId: staff.id, status: "APPROVED", fromOn: { lte: date }, toOn: { gte: date } }, select: { id: true } });
    const result = onLeave ? null : checkInResult(karachiMinutes(now), settings.staffStartTime, settings.staffLateGraceMinutes);
    try {
      return await this.prisma.staffAttendance.create({
        data: {
          schoolId: user.schoolId,
          staffId: staff.id,
          date,
          checkInAt: now,
          status: onLeave ? "ON_LEAVE" : result!.status,
          source: onLeave ? "LEAVE" : "LOGIN",
          lateMinutes: result?.lateMinutes ?? 0,
        },
      });
    } catch (error) {
      // Two requests raced: the other one won, which is fine.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    }
  }

  // Views ---------------------------------------------------------------------------------------------------

  private staffWhere(ctx: StaffCtx): Prisma.StaffWhereInput {
    return { schoolId: ctx.schoolId, status: { in: [...TRACKED] }, ...(ctx.campusId ? { OR: [{ campusId: ctx.campusId }, { campusId: null }] } : {}) };
  }

  /** Holidays for each campus a group of staff belong to, so a campus-only holiday only closes that campus. */
  private async holidaysByCampus(schoolId: string, campuses: (string | null)[], from: string, to: string) {
    const out = new Map<string | null, HolidayRange[]>();
    for (const campusId of new Set(campuses)) out.set(campusId, await loadHolidays(this.prisma, schoolId, from, to, campusId));
    return out;
  }

  async day(ctx: StaffCtx, dateInput?: string): Promise<StaffAttendanceDay> {
    const today = karachiToday();
    const date = dateInput && /^\d{4}-\d{2}-\d{2}$/.test(dateInput) ? dateInput : today;
    const [settings, staff] = await Promise.all([
      loadSettings(this.prisma, ctx.schoolId),
      this.prisma.staff.findMany({ where: this.staffWhere(ctx), select: staffSelect, orderBy: [{ department: "asc" }, { name: "asc" }, { id: "asc" }] }),
    ]);
    const [holidays, records, leaves] = await Promise.all([
      this.holidaysByCampus(ctx.schoolId, staff.map((s) => s.campusId), date, date),
      this.prisma.staffAttendance.findMany({ where: { schoolId: ctx.schoolId, date: dateOnly(date), staffId: { in: staff.map((s) => s.id) } }, select: { staffId: true, status: true, checkInAt: true, lateMinutes: true } }),
      this.prisma.staffLeave.findMany({ where: { schoolId: ctx.schoolId, status: "APPROVED", fromOn: { lte: dateOnly(date) }, toOn: { gte: dateOnly(date) } }, select: { staffId: true, fromOn: true, toOn: true, status: true } }),
    ]);
    const recordBy = new Map(records.map((r) => [r.staffId, r]));
    const leavesBy = new Map<string, StaffLeaveSpan[]>();
    for (const l of leaves) leavesBy.set(l.staffId, [...(leavesBy.get(l.staffId) ?? []), { fromOn: isoOf(l.fromOn), toOn: isoOf(l.toOn), status: l.status }]);

    const rows: StaffAttendanceRow[] = staff
      .filter((s) => joinedOn(s) <= date)
      .map((s) => {
        const record = recordBy.get(s.id) ?? null;
        const campusHolidays = holidays.get(s.campusId) ?? [];
        const status = deriveStaffDay({ day: date, today, working: isWorkingDay(date, settings, campusHolidays), record, leaves: leavesBy.get(s.id) ?? [] });
        return {
          staffId: s.id,
          name: s.name,
          employeeNo: s.employeeNo,
          title: s.title,
          department: s.department,
          status,
          checkIn: record?.checkInAt ? karachiClockText(record.checkInAt) : null,
          lateMinutes: record?.lateMinutes ?? 0,
        };
      });
    const wide = holidays.get(null) ?? [...holidays.values()][0] ?? [];
    return {
      date,
      working: settings.workingWeekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) && !holidayOn(date, wide),
      holiday: holidayOn(date, wide)?.name ?? null,
      rows,
      counts: tallyDay(rows.map((r) => r.status)),
      startTime: settings.staffStartTime,
      graceMinutes: settings.staffLateGraceMinutes,
    };
  }

  /** Per-person counts across a range; the month view, the report and the ratio all use this. */
  async summaries(ctx: StaffCtx, from: string, to: string) {
    const today = karachiToday();
    const [settings, staff] = await Promise.all([
      loadSettings(this.prisma, ctx.schoolId),
      this.prisma.staff.findMany({ where: this.staffWhere(ctx), select: staffSelect, orderBy: [{ department: "asc" }, { name: "asc" }, { id: "asc" }] }),
    ]);
    const days = eachDay(from, to);
    const [holidays, records, leaves] = await Promise.all([
      this.holidaysByCampus(ctx.schoolId, staff.map((s) => s.campusId), from, to),
      this.prisma.staffAttendance.findMany({ where: { schoolId: ctx.schoolId, date: { gte: dateOnly(from), lte: dateOnly(to) }, staffId: { in: staff.map((s) => s.id) } }, select: { staffId: true, date: true, status: true } }),
      this.prisma.staffLeave.findMany({ where: { schoolId: ctx.schoolId, status: "APPROVED", fromOn: { lte: dateOnly(to) }, toOn: { gte: dateOnly(from) } }, select: { staffId: true, fromOn: true, toOn: true, status: true } }),
    ]);
    const recordsBy = new Map<string, Map<string, { status: (typeof records)[number]["status"] }>>();
    for (const r of records) {
      const m = recordsBy.get(r.staffId) ?? new Map();
      m.set(isoOf(r.date), { status: r.status });
      recordsBy.set(r.staffId, m);
    }
    const leavesBy = new Map<string, StaffLeaveSpan[]>();
    for (const l of leaves) leavesBy.set(l.staffId, [...(leavesBy.get(l.staffId) ?? []), { fromOn: isoOf(l.fromOn), toOn: isoOf(l.toOn), status: l.status }]);

    return staff.map((s) => {
      const campusHolidays = holidays.get(s.campusId) ?? [];
      const summary = summariseStaff({
        days,
        today,
        joinedOn: joinedOn(s),
        working: (day) => isWorkingDay(day, settings, campusHolidays),
        records: recordsBy.get(s.id) ?? new Map(),
        leaves: leavesBy.get(s.id) ?? [],
      });
      return { staff: s, counts: summary.counts as StaffCounts, pct: summary.pct, workingDays: summary.workingDays };
    });
  }

  async month(ctx: StaffCtx, monthInput?: string): Promise<StaffMonth> {
    const today = karachiToday();
    const month = monthInput && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthInput) ? monthInput : today.slice(0, 7);
    const { from, to } = monthBounds(month);
    const rows = await this.summaries(ctx, from, to);
    return {
      month,
      workingDays: Math.max(0, ...rows.map((r) => r.workingDays)),
      rows: rows.map((r) => ({ staffId: r.staff.id, name: r.staff.name, employeeNo: r.staff.employeeNo, department: r.staff.department, counts: r.counts, pct: r.pct, workingDays: r.workingDays })),
    };
  }

  /** The signed-in person's own day, for their portal page. */
  async mine(user: { id: string; email: string; schoolId: string }): Promise<StaffCheckIn | null> {
    const staff = await staffForUser(this.prisma, user);
    if (!staff) return null;
    const today = karachiToday();
    const date = dateOnly(today);
    const [settings, holidays, record, leave] = await Promise.all([
      loadSettings(this.prisma, user.schoolId),
      loadHolidays(this.prisma, user.schoolId, today, today, staff.campusId),
      this.prisma.staffAttendance.findUnique({ where: { staffId_date: { staffId: staff.id, date } }, select: { status: true, checkInAt: true, lateMinutes: true } }),
      this.prisma.staffLeave.findMany({ where: { staffId: staff.id, status: "APPROVED", fromOn: { lte: date }, toOn: { gte: date } }, select: { fromOn: true, toOn: true, status: true } }),
    ]);
    const holiday = holidayOn(today, holidays)?.name ?? null;
    const working = isWorkingDay(today, settings, holidays);
    return {
      date: today,
      working,
      holiday,
      status: deriveStaffDay({ day: today, today, working, record, leaves: leave.map((l) => ({ fromOn: isoOf(l.fromOn), toOn: isoOf(l.toOn), status: l.status })) }),
      checkIn: record?.checkInAt ? karachiClockText(record.checkInAt) : null,
      lateMinutes: record?.lateMinutes ?? 0,
      startTime: settings.staffStartTime,
    };
  }

  // Nightly job ---------------------------------------------------------------------------------------------

  /**
   * Saves a row for every person who had no activity on a school day, so reports and history don't depend on
   * working it out later. Safe to run again: existing rows are never touched.
   */
  async closeDay(schoolId: string, day: string) {
    const [settings, staff] = await Promise.all([
      loadSettings(this.prisma, schoolId),
      this.prisma.staff.findMany({ where: { schoolId, status: { in: [...TRACKED] } }, select: staffSelect }),
    ]);
    const date = dateOnly(day);
    const eligible = staff.filter((s) => joinedOn(s) <= day);
    if (!eligible.length) return 0;
    const holidays = await this.holidaysByCampus(schoolId, eligible.map((s) => s.campusId), day, day);
    const working = eligible.filter((s) => isWorkingDay(day, settings, holidays.get(s.campusId) ?? []));
    if (!working.length) return 0;
    const [existing, leaves] = await Promise.all([
      this.prisma.staffAttendance.findMany({ where: { schoolId, date, staffId: { in: working.map((s) => s.id) } }, select: { staffId: true } }),
      this.prisma.staffLeave.findMany({ where: { schoolId, status: "APPROVED", fromOn: { lte: date }, toOn: { gte: date } }, select: { staffId: true } }),
    ]);
    const have = new Set(existing.map((r) => r.staffId));
    const away = new Set(leaves.map((l) => l.staffId));
    const rows = working
      .filter((s) => !have.has(s.id))
      .map((s) => ({ schoolId, staffId: s.id, date, status: away.has(s.id) ? ("ON_LEAVE" as const) : ("ABSENT" as const), source: away.has(s.id) ? ("LEAVE" as const) : ("AUTO_ABSENT" as const) }));
    if (!rows.length) return 0;
    const result = await this.prisma.staffAttendance.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  async mustExist(schoolId: string, staffId: string) {
    const found = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId }, select: { id: true } });
    if (!found) throw new NotFoundException("Staff member not found");
  }
}
