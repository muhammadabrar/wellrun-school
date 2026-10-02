import type { LeaveList, LeaveRequestInput, LeaveView, StaffAttendanceDay, StaffCheckIn, StaffMonth } from "@wellrun/shared";
import { request } from "./api";

export type { LeaveList, LeaveView, StaffAttendanceDay, StaffCheckIn, StaffMonth };

type Params = Record<string, string | number | undefined>;

function qs(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const out = search.toString();
  return out ? `?${out}` : "";
}

const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload) });

export const staffAttendanceKeys = {
  root: ["staff-attendance"] as const,
  day: (date: string) => ["staff-attendance", "day", date] as const,
  month: (month: string) => ["staff-attendance", "month", month] as const,
  mine: ["staff-attendance", "me"] as const,
};

export const leaveKeys = {
  root: ["leave"] as const,
  mine: ["leave", "mine"] as const,
  list: (status: string, page: number) => ["leave", "list", status, page] as const,
};

export const staffAttendanceApi = {
  day: (date: string) => request<StaffAttendanceDay>(`/console/staff-attendance${qs({ date })}`),
  month: (month: string) => request<StaffMonth>(`/console/staff-attendance/month${qs({ month })}`),
  mine: () => request<{ today: StaffCheckIn | null }>("/console/staff-attendance/me"),
};

export const leaveApi = {
  mine: () => request<LeaveView[]>("/console/leave/mine"),
  request: (payload: LeaveRequestInput) => request<LeaveView>("/console/leave", json("POST", payload)),
  cancel: (id: string) => request<LeaveView>(`/console/leave/${id}/cancel`, { method: "POST" }),
  list: (status: string, page = 1) => request<LeaveList>(`/console/leave${qs({ status: status === "ALL" ? undefined : status, page: page > 1 ? page : undefined })}`),
  decide: (id: string, payload: { decision: "APPROVE" | "REJECT"; note: string }) => request<LeaveView>(`/console/leave/${id}/decide`, json("POST", payload)),
};
