import { deriveStaffDay, emptyStaffCounts, staffAttendancePct, type StaffAttendanceStatus, type StaffCounts, type StaffDayStatus } from "@wellrun/shared";

export type StaffLeaveSpan = { fromOn: string; toOn: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" };

/**
 * One person's attendance over some days. Days before they joined are skipped. A saved record wins; with none, a working
 * day in the past is absent unless approved leave covers it. Today and the future are never counted.
 */
export function summariseStaff(input: {
  days: string[];
  today: string;
  joinedOn: string;
  working: (day: string) => boolean;
  records: Map<string, { status: StaffAttendanceStatus }>;
  leaves: StaffLeaveSpan[];
}) {
  const counts: StaffCounts = emptyStaffCounts();
  const statuses = new Map<string, StaffDayStatus>();
  for (const day of input.days) {
    if (day < input.joinedOn) continue;
    const status = deriveStaffDay({ day, today: input.today, working: input.working(day), record: input.records.get(day) ?? null, leaves: input.leaves });
    statuses.set(day, status);
    if (status === "PRESENT" || status === "LATE" || status === "ABSENT" || status === "ON_LEAVE") counts[status] += 1;
  }
  return { counts, pct: staffAttendancePct(counts), workingDays: counts.PRESENT + counts.LATE + counts.ABSENT + counts.ON_LEAVE, statuses };
}

/** How many people in a group are in each state, for the summary chips on the day view. */
export function tallyDay(statuses: StaffDayStatus[]): Record<StaffDayStatus, number> {
  const out: Record<StaffDayStatus, number> = { PRESENT: 0, LATE: 0, ABSENT: 0, ON_LEAVE: 0, NOT_YET: 0, OFF: 0 };
  for (const s of statuses) out[s] += 1;
  return out;
}
