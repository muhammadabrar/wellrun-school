import { LEAVE_STATUS_LABEL, LEAVE_TYPE_LABEL, STAFF_DAY_LABEL, type LeaveStatus, type StaffDayStatus } from "@wellrun/shared";
import { Badge } from "@wellrun/ui";

export const DAY_TONE: Record<StaffDayStatus, "success" | "warning" | "danger" | "indigo" | "neutral"> = {
  PRESENT: "success",
  LATE: "warning",
  ABSENT: "danger",
  ON_LEAVE: "indigo",
  NOT_YET: "neutral",
  OFF: "neutral",
};

export function DayBadge({ status }: { status: StaffDayStatus }) {
  return <Badge tone={DAY_TONE[status]}>{STAFF_DAY_LABEL[status]}</Badge>;
}

const LEAVE_TONE: Record<LeaveStatus, "success" | "warning" | "danger" | "neutral"> = { PENDING: "warning", APPROVED: "success", REJECTED: "danger", CANCELLED: "neutral" };

export function LeaveBadge({ status }: { status: LeaveStatus }) {
  return <Badge tone={LEAVE_TONE[status]}>{LEAVE_STATUS_LABEL[status]}</Badge>;
}

export const leaveTypeName = (type: keyof typeof LEAVE_TYPE_LABEL) => LEAVE_TYPE_LABEL[type];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-10-05 as 5 Oct 2026. */
export function shortDate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

export function leaveRange(fromOn: string, toOn: string) {
  return fromOn === toOn ? shortDate(fromOn) : `${shortDate(fromOn)} to ${shortDate(toOn)}`;
}

/** 08:05 as 8:05 am. */
export function clock12(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
