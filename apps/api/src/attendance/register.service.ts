import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  attendancePct,
  eachDay,
  emptyCounts,
  holidayOn,
  isoOf,
  monthBounds,
  monthRegisterQuery,
  saveRegisterSchema,
  weekdayOf,
  type AttendanceDay,
  type AttendanceSettingsView,
  type AttendanceStatus,
  type AttendanceStudentRow,
  type HolidayRange,
  type MonthRegister,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import { dateOnly, karachiToday } from "../common/date";
import { assertWritableSchool, teacherClassIds } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";
import { classLabel } from "./attendance.service";
import { assertYearOpen } from "../common/year-lock";
import { dayLockReason, loadHolidays, loadSettings, requireAttendanceAdmin, type AttendanceCtx } from "./rules";

export function buildDays(from: string, to: string, settings: AttendanceSettingsView, holidays: HolidayRange[]): AttendanceDay[] {
  return eachDay(from, to).map((date) => {
    const weekday = weekdayOf(date);
    const holiday = holidayOn(date, holidays)?.name ?? null;
    return { date, weekday, working: settings.workingWeekdays.includes(weekday) && !holiday, holiday };
  });
}

const rollSort = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Active roster of a class, ordered by roll number then name. */
export async function classRoster(prisma: PrismaService, schoolId: string, classIds: string[]) {
  const rows = await prisma.enrollment.findMany({
    where: { schoolId, classId: { in: classIds }, active: true },
    select: {
      classId: true,
      rollNo: true,
      student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
    },
  });
  return rows
    .map((row) => ({
      classId: row.classId,
      id: row.student.id,
      name: `${row.student.firstName} ${row.student.lastName}`.trim(),
      admissionNo: row.student.admissionNo,
      rollNo: row.rollNo || null,
    }))
    .sort((a, b) => rollSort.compare(a.rollNo ?? "~", b.rollNo ?? "~") || a.name.localeCompare(b.name));
}

@Injectable()
export class RegisterService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async month(ctx: AttendanceCtx, query: unknown): Promise<MonthRegister> {
    const { classId, month } = monthRegisterQuery.parse(query);
    const cls = await this.prisma.class.findFirst({
      where: { id: classId, schoolId: ctx.schoolId },
      select: { id: true, name: true, section: true, campusId: true, year: { select: { status: true } } },
    });
    if (!cls) throw new NotFoundException("Class not found");
    if (!ctx.isAdmin) {
      const own = (await teacherClassIds(this.prisma, ctx.user)) ?? [];
      if (!own.includes(classId)) throw new ForbiddenException("This class is not assigned to you");
    }
    const { from, to } = monthBounds(month);
    const [settings, holidays, roster] = await Promise.all([
      loadSettings(this.prisma, ctx.schoolId),
      loadHolidays(this.prisma, ctx.schoolId, from, to, cls.campusId),
      classRoster(this.prisma, ctx.schoolId, [classId]),
    ]);
    const records = roster.length
      ? await this.prisma.attendanceRecord.findMany({
          where: { schoolId: ctx.schoolId, studentId: { in: roster.map((s) => s.id) }, date: { gte: dateOnly(from), lte: dateOnly(to) } },
          select: { studentId: true, date: true, status: true },
        })
      : [];

    const days = buildDays(from, to, settings, holidays);
    const marks: MonthRegister["marks"] = {};
    const dailyPresent: Record<string, number> = {};
    for (const row of records) {
      const date = isoOf(row.date);
      (marks[row.studentId] ??= {})[date] = row.status as AttendanceStatus;
      if (row.status === "PRESENT" || (row.status === "LATE" && settings.lateCountsPresent)) dailyPresent[date] = (dailyPresent[date] ?? 0) + 1;
    }
    const students: AttendanceStudentRow[] = roster.map((s) => {
      const counts = emptyCounts();
      for (const status of Object.values(marks[s.id] ?? {})) counts[status] += 1;
      return { id: s.id, name: s.name, admissionNo: s.admissionNo, rollNo: s.rollNo, counts, pct: attendancePct(counts, settings) };
    });
    const today = karachiToday();
    const canEditGrid = ctx.isAdmin && cls.year.status !== "CLOSED";
    return {
      class: { id: cls.id, label: classLabel(cls) },
      month,
      days,
      students,
      marks,
      dailyPresent,
      settings,
      editableDates: canEditGrid ? days.filter((d) => d.working && d.date <= today).map((d) => d.date) : [],
      canEditGrid,
    };
  }

  /** Admin edits from the month grid. A null status clears that day's mark. */
  async saveCells(ctx: AttendanceCtx, body: unknown) {
    requireAttendanceAdmin(ctx);
    const input = saveRegisterSchema.parse(body);
    await assertWritableSchool(this.prisma, ctx.schoolId);
    const cls = await this.prisma.class.findFirst({
      where: { id: input.classId, schoolId: ctx.schoolId },
      select: { campusId: true, year: { select: { name: true, status: true } } },
    });
    if (!cls) throw new NotFoundException("Class not found");
    assertYearOpen(cls.year);
    const dates = input.cells.map((c) => c.date).sort();
    const [settings, holidays, roster] = await Promise.all([
      loadSettings(this.prisma, ctx.schoolId),
      loadHolidays(this.prisma, ctx.schoolId, dates[0]!, dates[dates.length - 1]!, cls.campusId),
      this.prisma.enrollment.findMany({ where: { schoolId: ctx.schoolId, classId: input.classId }, select: { studentId: true } }),
    ]);
    const inClass = new Set(roster.map((r) => r.studentId));
    const today = karachiToday();
    for (const cell of input.cells) {
      if (!inClass.has(cell.studentId)) throw new BadRequestException("Some students are not in this class");
      const reason = dayLockReason(cell.date, today, settings, holidays, true);
      if (reason) throw new BadRequestException(`${cell.date}: ${reason}`);
    }
    await this.prisma.$transaction(
      input.cells.map((cell) => {
        const date = dateOnly(cell.date);
        if (!cell.status) return this.prisma.attendanceRecord.deleteMany({ where: { schoolId: ctx.schoolId, studentId: cell.studentId, date } });
        return this.prisma.attendanceRecord.upsert({
          where: { studentId_date: { studentId: cell.studentId, date } },
          create: { schoolId: ctx.schoolId, studentId: cell.studentId, classId: input.classId, date, status: cell.status, markedById: ctx.user.id },
          update: { status: cell.status, classId: input.classId, markedById: ctx.user.id },
        });
      }),
    );
    await audit(this.prisma, {
      schoolId: ctx.schoolId,
      actorId: ctx.user.id,
      action: "attendance_register_saved",
      entity: "attendance",
      entityId: input.classId,
      summary: `${input.cells.length} register edits (${dates[0]} – ${dates[dates.length - 1]})`,
    });
    return { saved: input.cells.length };
  }
}
