import type {
  AttendanceOverview,
  AttendanceReport,
  AttendanceSettingsInput,
  AttendanceSettingsView,
  AttendanceStatus,
  HolidayInput,
  HolidayView,
  MonthRegister,
  SaveRegisterInput,
  StudentAttendanceSummary,
  TeacherTodayClasses,
} from "@wellrun/shared";
import { request } from "./api";
import { readYearId } from "./school-context";

export type {
  AttendanceOverview,
  AttendanceReport,
  AttendanceSettingsView,
  AttendanceStatus,
  HolidayView,
  MonthRegister,
  StudentAttendanceSummary,
  TeacherTodayClasses,
};

type Params = Record<string, string | undefined>;

function qs(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const out = search.toString();
  return out ? `?${out}` : "";
}

const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload) });

export type AttendanceDayView = {
  records: { studentId: string; status: AttendanceStatus }[];
  students: { id: string; firstName: string; lastName: string; admissionNo: string }[];
  day: { date: string; working: boolean; holiday: string | null };
  canMark: boolean;
  lockReason: string | null;
};

export const attendanceApi = {
  day: (classId: string, date: string) => request<AttendanceDayView>(`/console/attendance${qs({ classId, date })}`),
  save: (payload: { classId: string; date: string; records: { studentId: string; status: AttendanceStatus }[] }) =>
    request<AttendanceDayView>("/console/attendance", json("POST", payload)),
  today: () => request<TeacherTodayClasses>("/console/attendance/me/today"),
  overview: (date?: string) => request<AttendanceOverview>(`/console/attendance/overview${qs({ date })}`),
  register: (classId: string, month: string) => request<MonthRegister>(`/console/attendance/register${qs({ classId, month })}`),
  saveRegister: (payload: SaveRegisterInput) => request<{ saved: number }>("/console/attendance/register", json("PUT", payload)),
  report: (query: { classId?: string; from: string; to: string }) => request<AttendanceReport>(`/console/attendance/report${qs(query)}`),
  settings: () => request<AttendanceSettingsView>("/console/attendance/settings"),
  saveSettings: (payload: AttendanceSettingsInput) => request<AttendanceSettingsView>("/console/attendance/settings", json("PUT", payload)),
  holidays: (year?: string) => request<HolidayView[]>(`/console/attendance/holidays${qs({ year })}`),
  createHoliday: (payload: HolidayInput) => request<HolidayView>("/console/attendance/holidays", json("POST", payload)),
  updateHoliday: (id: string, payload: HolidayInput) => request<HolidayView>(`/console/attendance/holidays/${id}`, json("PATCH", payload)),
  removeHoliday: (id: string) => request<{ ok: true }>(`/console/attendance/holidays/${id}`, { method: "DELETE" }),
  student: (id: string) => request<StudentAttendanceSummary>(`/console/students/${id}/attendance`),
};

const y = () => readYearId();

/** Everything sits under ["attendance"], which a campus switch already invalidates. */
export const attendanceKeys = {
  root: ["attendance"] as const,
  day: (classId: string, date: string) => ["attendance", "day", classId, date] as const,
  today: ["attendance", "today"] as const,
  overview: (date: string) => ["attendance", y(), "overview", date] as const,
  register: (classId: string, month: string) => ["attendance", "register", classId, month] as const,
  report: (query: Params) => ["attendance", y(), "report", query] as const,
  settings: ["attendance", "settings"] as const,
  holidays: (year?: string) => ["attendance", "holidays", year ?? "all"] as const,
  student: (id: string) => ["attendance", y(), "student", id] as const,
};
