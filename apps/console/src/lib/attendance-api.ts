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
import { request, type AbsentRow } from "./api";
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

export type ReportQuery = { classId?: string; from: string; to: string; below?: boolean; register?: boolean; limit?: number; offset?: number };

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
  /** One page of the report; pass `limit: REPORT_EXPORT_LIMIT` and `register` to export everything. */
  report: (query: ReportQuery) =>
    request<AttendanceReport>(
      `/console/attendance/report${qs({
        classId: query.classId,
        from: query.from,
        to: query.to,
        below: query.below ? "1" : undefined,
        register: query.register ? "1" : undefined,
        limit: query.limit === undefined ? undefined : String(query.limit),
        offset: query.offset ? String(query.offset) : undefined,
      })}`,
    ),
  absent: (date: string) => request<AbsentRow[]>(`/console/attendance/absent${qs({ date })}`),
  settings: () => request<AttendanceSettingsView>("/console/attendance/settings"),
  saveSettings: (payload: AttendanceSettingsInput) => request<AttendanceSettingsView>("/console/attendance/settings", json("PUT", payload)),
  /** `yearId` = an academic year; `year` = a calendar year (fallback before any academic year exists). */
  holidays: (range: { yearId?: string; year?: string }) => request<HolidayView[]>(`/console/attendance/holidays${qs(range)}`),
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
  /** Filters only: pages of one report share this key inside an infinite query. */
  report: (query: Params) => ["attendance", y(), "report", query] as const,
  absent: (date: string) => ["attendance", "absent", date] as const,
  settings: ["attendance", "settings"] as const,
  holidays: (range: { yearId?: string; year?: string }) => ["attendance", "holidays", range.yearId ?? range.year ?? "all"] as const,
  student: (id: string) => ["attendance", y(), "student", id] as const,
};
