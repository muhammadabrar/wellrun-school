import { z } from "zod";

export const attendanceStatus = ["PRESENT", "ABSENT", "LATE", "LEAVE", "EXCUSED"] as const;
export type AttendanceStatus = (typeof attendanceStatus)[number];

/** Short codes printed in the month register and exports. */
export const ATTENDANCE_CODES: Record<AttendanceStatus, string> = {
  PRESENT: "P",
  ABSENT: "A",
  LATE: "L",
  LEAVE: "Lv",
  EXCUSED: "E",
};

export const ATTENDANCE_LABELS: Record<AttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
  LEAVE: "Leave",
  EXCUSED: "Excused",
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const isoMonth = z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM");

export const saveAttendanceSchema = z.object({
  classId: z.string(),
  date: isoDate,
  records: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum(attendanceStatus),
    }),
  ),
});
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;

/** Admin edits from the month register. A null status clears the mark. */
export const saveRegisterSchema = z.object({
  classId: z.string(),
  cells: z
    .array(z.object({ studentId: z.string(), date: isoDate, status: z.enum(attendanceStatus).nullable() }))
    .min(1)
    .max(5000),
});
export type SaveRegisterInput = z.infer<typeof saveRegisterSchema>;

export const monthRegisterQuery = z.object({ classId: z.string().min(1), month: isoMonth });

export const attendanceReportQuery = z
  .object({
    classId: z.string().optional(),
    from: isoDate,
    to: isoDate,
  })
  .refine((v) => v.from <= v.to, { message: "Start date must be before end date", path: ["to"] });
export type AttendanceReportQuery = z.infer<typeof attendanceReportQuery>;

export const attendanceSettingsSchema = z.object({
  workingWeekdays: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one working day").max(7),
  lowThresholdPct: z.number().min(0).max(100),
  teacherEditDays: z.number().int().min(0).max(31),
  lateCountsPresent: z.boolean(),
  leaveCountsPresent: z.boolean(),
});
export type AttendanceSettingsInput = z.infer<typeof attendanceSettingsSchema>;

export const DEFAULT_ATTENDANCE_SETTINGS: AttendanceSettingsInput = {
  workingWeekdays: [1, 2, 3, 4, 5, 6],
  lowThresholdPct: 75,
  teacherEditDays: 0,
  lateCountsPresent: true,
  leaveCountsPresent: false,
};

export const holidaySchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    startsOn: isoDate,
    endsOn: isoDate,
    campusId: z.string().nullable().optional(),
  })
  .refine((v) => v.startsOn <= v.endsOn, { message: "End date must be on or after the start date", path: ["endsOn"] });
export type HolidayInput = z.infer<typeof holidaySchema>;

// Pure helpers (shared by API and console) ------------------------------------

export type HolidayRange = { name: string; startsOn: string; endsOn: string };

export function isoOf(date: Date | string) {
  return typeof date === "string" ? date.slice(0, 10) : date.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday for a YYYY-MM-DD date. */
export function weekdayOf(iso: string) {
  return new Date(`${iso}T00:00:00.000Z`).getUTCDay();
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoOf(d);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function eachDay(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

export function holidayOn(iso: string, holidays: HolidayRange[]) {
  return holidays.find((h) => isoOf(h.startsOn) <= iso && iso <= isoOf(h.endsOn));
}

export function isWorkingDay(iso: string, settings: Pick<AttendanceSettingsInput, "workingWeekdays">, holidays: HolidayRange[]) {
  return settings.workingWeekdays.includes(weekdayOf(iso)) && !holidayOn(iso, holidays);
}

export function workingDays(from: string, to: string, settings: Pick<AttendanceSettingsInput, "workingWeekdays">, holidays: HolidayRange[]) {
  return eachDay(from, to).filter((d) => isWorkingDay(d, settings, holidays));
}

/** Teachers may change marks from `today - editDays` up to today, never in the future. */
export function withinEditWindow(iso: string, today: string, editDays: number) {
  const diff = daysBetween(iso, today);
  return diff >= 0 && diff <= editDays;
}

export type AttendanceCounts = Record<AttendanceStatus, number>;

export function emptyCounts(): AttendanceCounts {
  return { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, EXCUSED: 0 };
}

export function countStatuses(statuses: Iterable<AttendanceStatus>) {
  const counts = emptyCounts();
  for (const s of statuses) counts[s] += 1;
  return counts;
}

/**
 * Percentage of marked days attended. Late counts as attended when `lateCountsPresent`.
 * Leave/excused count as attended when `leaveCountsPresent`, otherwise they are left out entirely.
 * Returns null when nothing counts yet.
 */
export function attendancePct(counts: AttendanceCounts, settings: Pick<AttendanceSettingsInput, "lateCountsPresent" | "leaveCountsPresent">) {
  const leave = counts.LEAVE + counts.EXCUSED;
  const attended = counts.PRESENT + (settings.lateCountsPresent ? counts.LATE : 0) + (settings.leaveCountsPresent ? leave : 0);
  const total = counts.PRESENT + counts.ABSENT + counts.LATE + (settings.leaveCountsPresent ? leave : 0);
  if (!total) return null;
  return Math.round((attended / total) * 1000) / 10;
}

// Response shapes --------------------------------------------------------------

export type AttendanceSettingsView = AttendanceSettingsInput;

export type HolidayView = { id: string; name: string; startsOn: string; endsOn: string; campusId: string | null; campusName: string | null };

export type AttendanceDay = { date: string; weekday: number; working: boolean; holiday: string | null };

export type AttendanceStudentRow = {
  id: string;
  name: string;
  admissionNo: string;
  rollNo: string | null;
  counts: AttendanceCounts;
  pct: number | null;
};

export type MonthRegister = {
  class: { id: string; label: string };
  month: string;
  days: AttendanceDay[];
  students: AttendanceStudentRow[];
  /** studentId -> date -> status */
  marks: Record<string, Record<string, AttendanceStatus>>;
  dailyPresent: Record<string, number>;
  settings: AttendanceSettingsView;
  /** Dates the viewer may still edit (teachers: first-period days inside the edit window). */
  editableDates: string[];
  canEditGrid: boolean;
};

export type AttendanceReportRow = AttendanceStudentRow & { classId: string; className: string; below: boolean };

export type AttendanceReport = {
  from: string;
  to: string;
  workingDays: number;
  settings: AttendanceSettingsView;
  rows: AttendanceReportRow[];
  totals: { students: number; avgPct: number | null; below: number; counts: AttendanceCounts };
  /** Day-by-day marks, only when the report is for a single class. */
  register: { days: AttendanceDay[]; marks: Record<string, Record<string, AttendanceStatus>> } | null;
};

export type AttendanceOverview = {
  date: string;
  working: boolean;
  holiday: string | null;
  today: { marked: number; present: number; absent: number; late: number; leave: number; pct: number | null };
  classes: { id: string; label: string; students: number; marked: number; pct: number | null }[];
  trend: { date: string; pct: number | null }[];
  lowStudents: { id: string; name: string; className: string; pct: number }[];
  thresholdPct: number;
};

export type StudentAttendanceSummary = {
  thresholdPct: number;
  year: { id: string; name: string; from: string; to: string; counts: AttendanceCounts; pct: number | null; workingDays: number } | null;
  terms: { id: string; name: string; from: string; to: string; counts: AttendanceCounts; pct: number | null; current: boolean }[];
  months: { month: string; pct: number | null; counts: AttendanceCounts }[];
  calendar: { month: string; days: (AttendanceDay & { status: AttendanceStatus | null })[] };
  recent: { date: string; status: AttendanceStatus; className: string }[];
};

export type TeacherTodayClasses = {
  date: string;
  working: boolean;
  holiday: string | null;
  period: { id: string; label: string; startTime: string; endTime: string } | null;
  classes: { id: string; label: string; marked: boolean }[];
};
