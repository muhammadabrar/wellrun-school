import { ForbiddenException } from "@nestjs/common";
import {
  DEFAULT_ATTENDANCE_SETTINGS,
  attendancePct,
  countStatuses,
  holidayOn,
  isoOf,
  weekdayOf,
  withinEditWindow,
  type AttendanceSettingsView,
  type AttendanceStatus,
  type HolidayRange,
} from "@wellrun/shared";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolId } from "../common/roles";
import { staffForUser } from "../common/school";
import type { SchoolScope } from "../common/school-scope";
import type { PrismaService } from "../prisma/prisma.service";

export type AttendanceReq = { user: CurrentUser; schoolScope?: SchoolScope };

/** Who is asking: admins see and edit everything; teachers get their staff record. */
export type AttendanceCtx = {
  schoolId: string;
  user: CurrentUser;
  isAdmin: boolean;
  staff: { id: string; status: string } | null;
  scope: SchoolScope;
};

export async function attendanceContext(prisma: PrismaService, req: AttendanceReq): Promise<AttendanceCtx> {
  const schoolId = requireSchoolId(req.user);
  const isAdmin = req.user.role === "SCHOOL_ADMIN";
  const staff = isAdmin ? null : await staffForUser(prisma, req.user);
  return { schoolId, user: req.user, isAdmin, staff: staff ? { id: staff.id, status: staff.status } : null, scope: req.schoolScope ?? {} };
}

export function requireAttendanceAdmin(ctx: AttendanceCtx) {
  if (!ctx.isAdmin) throw new ForbiddenException("School admin only");
}

export async function loadSettings(prisma: PrismaService, schoolId: string): Promise<AttendanceSettingsView> {
  const row = await prisma.attendanceSettings.findUnique({ where: { schoolId } });
  if (!row) return { ...DEFAULT_ATTENDANCE_SETTINGS };
  return {
    workingWeekdays: row.workingWeekdays,
    lowThresholdPct: row.lowThresholdPct,
    teacherEditDays: row.teacherEditDays,
    lateCountsPresent: row.lateCountsPresent,
    leaveCountsPresent: row.leaveCountsPresent,
    staffStartTime: row.staffStartTime,
    staffLateGraceMinutes: row.staffLateGraceMinutes,
  };
}

/**
 * Holidays overlapping [from, to]. `campusId` undefined = every holiday; null = school-wide only;
 * a campus id = school-wide plus that campus.
 */
export async function loadHolidays(prisma: PrismaService, schoolId: string, from: string, to: string, campusId?: string | null): Promise<HolidayRange[]> {
  const rows = await prisma.holiday.findMany({
    where: {
      schoolId,
      startsOn: { lte: new Date(`${to}T00:00:00.000Z`) },
      endsOn: { gte: new Date(`${from}T00:00:00.000Z`) },
      ...(campusId === undefined ? {} : { OR: [{ campusId: null }, ...(campusId ? [{ campusId }] : [])] }),
    },
    orderBy: { startsOn: "asc" },
    select: { name: true, startsOn: true, endsOn: true },
  });
  return rows.map((row) => ({ name: row.name, startsOn: isoOf(row.startsOn), endsOn: isoOf(row.endsOn) }));
}

export function pctOf(statuses: Iterable<string>, settings: AttendanceSettingsView) {
  return attendancePct(countStatuses(statuses as Iterable<AttendanceStatus>), settings);
}

/** Why a date can't be marked, or null when it can. Holidays and closed weekdays block everyone. */
export function dayLockReason(
  date: string,
  today: string,
  settings: AttendanceSettingsView,
  holidays: HolidayRange[],
  isAdmin: boolean,
): string | null {
  if (date > today) return "You can't mark attendance for a future date.";
  const holiday = holidayOn(date, holidays);
  if (holiday) return `${holiday.name} is a holiday.`;
  if (!settings.workingWeekdays.includes(weekdayOf(date))) return "The school is closed on this weekday.";
  if (!isAdmin && !withinEditWindow(date, today, settings.teacherEditDays)) {
    return settings.teacherEditDays === 0
      ? "Teachers can only mark today's attendance."
      : `Teachers can only change attendance from the last ${settings.teacherEditDays} day(s).`;
  }
  return null;
}
