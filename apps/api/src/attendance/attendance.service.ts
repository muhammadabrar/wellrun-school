import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { holidayOn, weekdayOf, type SaveAttendanceInput, type TeacherTodayClasses } from "@wellrun/shared";
import { audit } from "../common/audit";
import { dateOnly, karachiToday } from "../common/date";
import { assertWritableSchool, firstPeriodClassIds, firstTeachingPeriod, teacherClassIds } from "../common/school";
import type { CurrentUser } from "../common/current-user";
import type { SchoolScope } from "../common/school-scope";
import { PrismaService } from "../prisma/prisma.service";
import { dayLockReason, loadHolidays, loadSettings, type AttendanceCtx } from "./rules";

export const classLabel = (cls: { name: string; section: string }) => `${cls.name} ${cls.section}`.trim();

@Injectable()
export class AttendanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async day(ctx: AttendanceCtx, classId: string, date: string) {
    const cls = await this.classOrThrow(ctx.schoolId, classId);
    const [records, enrollments, settings, holidays, firstPeriod] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { schoolId: ctx.schoolId, classId, date: dateOnly(date) },
        select: { studentId: true, status: true },
      }),
      this.prisma.enrollment.findMany({
        where: { schoolId: ctx.schoolId, classId, active: true },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
        orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
      }),
      loadSettings(this.prisma, ctx.schoolId),
      loadHolidays(this.prisma, ctx.schoolId, date, date, cls.campusId),
      this.teacherFirstPeriod(ctx, date),
    ]);
    if (!ctx.isAdmin && !firstPeriod.includes(classId)) {
      const own = (await teacherClassIds(this.prisma, ctx.user)) ?? [];
      if (!own.includes(classId)) throw new ForbiddenException("This class is not assigned to you");
    }
    const lockReason = this.lockReason(ctx, classId, date, settings, holidays, firstPeriod);
    return {
      records,
      students: enrollments.map((row) => row.student),
      day: {
        date,
        working: settings.workingWeekdays.includes(weekdayOf(date)) && !holidayOn(date, holidays),
        holiday: holidayOn(date, holidays)?.name ?? null,
      },
      canMark: lockReason === null,
      lockReason,
    };
  }

  async save(ctx: AttendanceCtx, input: SaveAttendanceInput) {
    const { schoolId } = ctx;
    await assertWritableSchool(this.prisma, schoolId);
    const cls = await this.classOrThrow(schoolId, input.classId);
    const [settings, holidays, firstPeriod, roster] = await Promise.all([
      loadSettings(this.prisma, schoolId),
      loadHolidays(this.prisma, schoolId, input.date, input.date, cls.campusId),
      this.teacherFirstPeriod(ctx, input.date),
      this.prisma.enrollment.findMany({ where: { schoolId, classId: input.classId }, select: { studentId: true } }),
    ]);
    const reason = this.lockReason(ctx, input.classId, input.date, settings, holidays, firstPeriod);
    if (reason) throw new ForbiddenException(reason);
    const inClass = new Set(roster.map((row) => row.studentId));
    if (input.records.some((row) => !inClass.has(row.studentId))) throw new ForbiddenException("Some students are not in this class");

    const date = dateOnly(input.date);
    await this.prisma.$transaction(
      input.records.map((record) =>
        this.prisma.attendanceRecord.upsert({
          where: { studentId_date: { studentId: record.studentId, date } },
          create: { schoolId, studentId: record.studentId, classId: input.classId, date, status: record.status, markedById: ctx.user.id },
          update: { status: record.status, classId: input.classId, markedById: ctx.user.id },
        }),
      ),
    );
    await audit(this.prisma, {
      schoolId,
      actorId: ctx.user.id,
      action: "attendance_saved",
      entity: "attendance",
      entityId: input.classId,
      summary: `${input.date} ${input.records.length} marks`,
    });
    return this.day(ctx, input.classId, input.date);
  }

  /** Today's first-period classes for the signed-in teacher: the only classes they may mark. */
  async today(ctx: AttendanceCtx): Promise<TeacherTodayClasses> {
    const date = karachiToday();
    const [settings, holidays, period, ids] = await Promise.all([
      loadSettings(this.prisma, ctx.schoolId),
      loadHolidays(this.prisma, ctx.schoolId, date, date, ctx.scope.campusId ?? null),
      firstTeachingPeriod(this.prisma, ctx.schoolId),
      this.teacherFirstPeriod(ctx, date),
    ]);
    const holiday = holidayOn(date, holidays)?.name ?? null;
    const working = settings.workingWeekdays.includes(weekdayOf(date)) && !holiday;
    const [classes, marked] = ids.length
      ? await Promise.all([
          this.prisma.class.findMany({ where: { schoolId: ctx.schoolId, id: { in: ids } }, select: { id: true, name: true, section: true } }),
          this.prisma.attendanceRecord.groupBy({ by: ["classId"], where: { schoolId: ctx.schoolId, date: dateOnly(date), classId: { in: ids } } }),
        ])
      : [[], []];
    const markedIds = new Set(marked.map((row) => row.classId));
    return {
      date,
      working,
      holiday,
      period,
      classes: classes.map((cls) => ({ id: cls.id, label: classLabel(cls), marked: markedIds.has(cls.id) })),
    };
  }

  async absent(user: CurrentUser, date = karachiToday(), scope: SchoolScope = {}) {
    const schoolId = user.schoolId!;
    const allowed = await teacherClassIds(this.prisma, user);
    return this.prisma.attendanceRecord.findMany({
      where: {
        schoolId,
        date: dateOnly(date),
        status: { in: ["ABSENT", "LEAVE"] },
        classId: allowed ? { in: allowed } : undefined,
        class: scope.campusId ? { campusId: scope.campusId } : undefined,
      },
      include: {
        student: true,
        class: true,
      },
      orderBy: [{ class: { name: "asc" } }, { student: { lastName: "asc" } }],
    });
  }

  /** Classes whose first period this teacher teaches on the date's weekday. Empty for admins and non-staff. */
  private async teacherFirstPeriod(ctx: AttendanceCtx, date: string) {
    if (ctx.isAdmin || !ctx.staff) return [];
    const weekday = weekdayOf(date);
    return firstPeriodClassIds(this.prisma, ctx.schoolId, ctx.staff.id, weekday);
  }

  /** Teachers mark only the classes whose first period they teach that day, inside the edit window. */
  private lockReason(
    ctx: AttendanceCtx,
    classId: string,
    date: string,
    settings: Awaited<ReturnType<typeof loadSettings>>,
    holidays: Awaited<ReturnType<typeof loadHolidays>>,
    firstPeriod: string[],
  ) {
    const dayReason = dayLockReason(date, karachiToday(), settings, holidays, ctx.isAdmin);
    if (dayReason) return dayReason;
    if (ctx.isAdmin) return null;
    if (!ctx.staff || (ctx.staff.status !== "ACTIVE" && ctx.staff.status !== "ON_LEAVE")) {
      return "Your staff record isn't active, so you can't mark attendance.";
    }
    if (!firstPeriod.includes(classId)) return "Only the teacher of this class's first period can mark its attendance that day.";
    return null;
  }

  private async classOrThrow(schoolId: string, classId: string) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, select: { id: true, name: true, section: true, campusId: true } });
    if (!cls) throw new NotFoundException("Class not found");
    return cls;
  }
}
