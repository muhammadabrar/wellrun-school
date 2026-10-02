import { z } from "zod";
import { addDays, eachDay, isWorkingDay, type AttendanceSettingsInput, type HolidayRange } from "./attendance";

/** Staff attendance and leave. Check-in is automatic; an admin only reads it. Rules are shared so the server and the screens agree. */

export const STAFF_ATTENDANCE_STATUSES = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE"] as const;
export type StaffAttendanceStatus = (typeof STAFF_ATTENDANCE_STATUSES)[number];

/** What a day looks like for one person: a saved status, or what we work out when nothing was saved. */
export type StaffDayStatus = StaffAttendanceStatus | "NOT_YET" | "OFF";

export const STAFF_DAY_LABEL: Record<StaffDayStatus, string> = {
  PRESENT: "Present",
  LATE: "Late",
  ABSENT: "Absent",
  ON_LEAVE: "On leave",
  NOT_YET: "Not in yet",
  OFF: "Day off",
};

export const LEAVE_TYPES = ["CASUAL", "SICK", "ANNUAL", "UNPAID", "OTHER"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABEL: Record<LeaveType, string> = {
  CASUAL: "Casual leave",
  SICK: "Sick leave",
  ANNUAL: "Annual leave",
  UNPAID: "Unpaid leave",
  OTHER: "Other",
};

export const LEAVE_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = {
  PENDING: "Waiting for approval",
  APPROVED: "Approved",
  REJECTED: "Not approved",
  CANCELLED: "Cancelled",
};

/** A leave can be filed for a week back (a sick day reported late) and no more than two months long. */
export const LEAVE_BACKDATE_DAYS = 7;
export const LEAVE_MAX_DAYS = 60;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

export const staffTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 08:00");

export const leaveRequestSchema = z
  .object({
    type: z.enum(LEAVE_TYPES),
    fromOn: isoDate,
    toOn: isoDate,
    reason: z.string().trim().min(3, "Say briefly why").max(500, "Keep the reason under 500 characters"),
  })
  .refine((v) => v.fromOn <= v.toOn, { message: "The last day can't be before the first day", path: ["toOn"] });

export const leaveDecisionSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().max(300).default(""),
});

export type LeaveRequestInput = z.input<typeof leaveRequestSchema>;
export type LeaveDecisionInput = z.input<typeof leaveDecisionSchema>;

// Pure rules -------------------------------------------------------------------------------------------------

export const minutesOfTime = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

const KARACHI_PARTS = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** The time of day, in minutes, that a moment falls on in Pakistan. */
export function karachiMinutes(date: Date) {
  const parts = KARACHI_PARTS.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function karachiClockText(date: Date) {
  const minutes = karachiMinutes(date);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** On time up to start plus the grace period; after that the person is late, counted from the start time itself. */
export function checkInResult(minutes: number, startTime: string, graceMinutes: number): { status: "PRESENT" | "LATE"; lateMinutes: number } {
  const start = minutesOfTime(startTime);
  if (minutes <= start + graceMinutes) return { status: "PRESENT", lateMinutes: 0 };
  return { status: "LATE", lateMinutes: minutes - start };
}

type LeaveSpan = { fromOn: string; toOn: string; status: LeaveStatus };

export const leaveCovers = (leaves: LeaveSpan[], day: string) => leaves.some((l) => l.status === "APPROVED" && l.fromOn <= day && day <= l.toOn);

export const rangesOverlap = (aFrom: string, aTo: string, bFrom: string, bTo: string) => aFrom <= bTo && bFrom <= aTo;

/** Working days a leave actually uses: weekends and holidays inside the range are free. */
export function leaveWorkingDays(from: string, to: string, settings: Pick<AttendanceSettingsInput, "workingWeekdays">, holidays: HolidayRange[]) {
  return eachDay(from, to).filter((day) => isWorkingDay(day, settings, holidays)).length;
}

/** Why a leave request can't be made, in words for the person asking, or null when it is fine. */
export function leaveRequestProblem(input: { fromOn: string; toOn: string }, today: string, workingDays: number) {
  if (input.fromOn < addDays(today, -LEAVE_BACKDATE_DAYS)) return `Leave can only start up to ${LEAVE_BACKDATE_DAYS} days ago`;
  const span = eachDay(input.fromOn, input.toOn).length;
  if (span > LEAVE_MAX_DAYS) return `A single leave can be at most ${LEAVE_MAX_DAYS} days`;
  if (workingDays === 0) return "Those days are already holidays or days off, so there is nothing to take leave for";
  return null;
}

export type StaffDayInput = {
  day: string;
  today: string;
  working: boolean;
  record: { status: StaffAttendanceStatus } | null;
  leaves: LeaveSpan[];
};

/** A saved record always wins. Without one: days off stay off, approved leave is leave, the past is absent, today is not in yet. */
export function deriveStaffDay(input: StaffDayInput): StaffDayStatus {
  if (input.record) return input.record.status;
  if (!input.working) return "OFF";
  if (leaveCovers(input.leaves, input.day)) return "ON_LEAVE";
  return input.day < input.today ? "ABSENT" : "NOT_YET";
}

export type StaffCounts = Record<StaffAttendanceStatus, number>;

export const emptyStaffCounts = (): StaffCounts => ({ PRESENT: 0, LATE: 0, ABSENT: 0, ON_LEAVE: 0 });

/** Share of counted days a person turned up. Leave days are left out, so approved leave never counts against anyone. */
export function staffAttendancePct(counts: StaffCounts) {
  const counted = counts.PRESENT + counts.LATE + counts.ABSENT;
  if (!counted) return null;
  return Math.round(((counts.PRESENT + counts.LATE) / counted) * 1000) / 10;
}

// Response shapes --------------------------------------------------------------------------------------------

export type StaffAttendanceRow = {
  staffId: string;
  name: string;
  employeeNo: string;
  title: string;
  department: string;
  status: StaffDayStatus;
  /** HH:MM in Pakistan time, when they checked in. */
  checkIn: string | null;
  lateMinutes: number;
};

export type StaffAttendanceDay = {
  date: string;
  working: boolean;
  holiday: string | null;
  rows: StaffAttendanceRow[];
  counts: Record<StaffDayStatus, number>;
  startTime: string;
  graceMinutes: number;
};

export type StaffMonthRow = {
  staffId: string;
  name: string;
  employeeNo: string;
  department: string;
  counts: StaffCounts;
  pct: number | null;
  /** Days with no mark and no leave, in the past. Includes today only once it is over. */
  workingDays: number;
};

export type StaffMonth = { month: string; workingDays: number; rows: StaffMonthRow[] };

export type StaffCheckIn = {
  date: string;
  working: boolean;
  holiday: string | null;
  status: StaffDayStatus;
  checkIn: string | null;
  lateMinutes: number;
  startTime: string;
};

export type LeaveView = {
  id: string;
  staffId: string;
  staffName: string;
  employeeNo: string;
  department: string;
  type: LeaveType;
  fromOn: string;
  toOn: string;
  workingDays: number;
  reason: string;
  status: LeaveStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string;
  createdAt: string;
  /** Whether the person can still withdraw it. */
  canCancel: boolean;
};

export type LeaveList = { items: LeaveView[]; total: number; page: number; pageSize: number; pending: number };
