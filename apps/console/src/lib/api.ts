import type { Paged, SchoolDashboard } from "@wellrun/shared";
import { ApiError } from "./query";
import { defaultCampusId, readCampusId, writeCampusId } from "./campus";
import { readYearId, type SchoolContext, writeSchoolContext } from "./school-context";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "PLATFORM_ADMIN" | "SCHOOL_ADMIN" | "TEACHER" | "PARENT" | "PUBLIC";
  schoolId: string | null;
};

export function token() {
  return localStorage.getItem("wellrun-token");
}

export function setSession(next: { token: string; user: SessionUser; schoolContext?: SchoolContext } | null) {
  if (!next) {
    localStorage.removeItem("wellrun-token");
    localStorage.removeItem("wellrun-user");
    writeSchoolContext(null);
    writeCampusId("");
    return;
  }
  localStorage.setItem("wellrun-token", next.token);
  localStorage.setItem("wellrun-user", JSON.stringify(next.user));
  if (next.schoolContext) {
    writeSchoolContext(next.schoolContext);
    const campusId = defaultCampusId(next.schoolContext.campuses);
    if (campusId) writeCampusId(campusId);
  }
}

export function currentUser() {
  const raw = localStorage.getItem("wellrun-user");
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> | undefined) };
  if (init?.body && !headers["Content-Type"] && !headers["content-type"]) {
    headers["Content-Type"] = "application/json";
  }
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const campusId = readCampusId();
  if (campusId) headers["X-Campus-Id"] = campusId;
  const yearId = readYearId();
  if (yearId) headers["X-Year-Id"] = yearId;
  const method = (init?.method ?? "GET").toUpperCase();
  const t0 = performance.now();
  const res = await fetch(`${API}${path}`, { ...init, headers, credentials: "include" });
  const ttfbMs = Math.round(performance.now() - t0);
  const requestId = res.headers.get("x-request-id");
  const serverMsRaw = res.headers.get("x-server-duration-ms");
  const serverMs = serverMsRaw != null ? Number(serverMsRaw) : Number.NaN;
  let body: unknown = undefined;
  if (res.status !== 204) {
    body = await res.json().catch(() => ({}));
  }
  const totalMs = Math.round(performance.now() - t0);
  const downloadMs = Math.max(0, totalMs - ttfbMs);
  const networkMs = Number.isFinite(serverMs) ? Math.max(0, ttfbMs - serverMs) : undefined;
  reportClientTrace({
    id: requestId,
    method,
    path,
    ttfbMs,
    serverMs: Number.isFinite(serverMs) ? serverMs : undefined,
    networkMs,
    downloadMs,
    totalMs,
  });
  if (res.status === 401) {
    setSession(null);
    throw new ApiError("unauthorized", 401);
  }
  if (!res.ok) {
    const message = Array.isArray((body as { message?: unknown })?.message)
      ? ((body as { message: unknown[] }).message[0] as string)
      : ((body as { message?: string })?.message as string | undefined);
    throw new ApiError(message ?? `Request failed: ${path}`, res.status);
  }
  return body as T;
}

function reportClientTrace(payload: {
  id: string | null;
  method: string;
  path: string;
  ttfbMs: number;
  serverMs?: number;
  networkMs?: number;
  downloadMs: number;
  totalMs: number;
}) {
  console.debug("[wellrun]", payload.method, payload.path, {
    requestId: payload.id,
    ttfbMs: payload.ttfbMs,
    serverMs: payload.serverMs,
    networkMs: payload.networkMs,
    downloadMs: payload.downloadMs,
    totalMs: payload.totalMs,
  });
  if (!payload.id) return;
  void fetch(`${API}/debug/trace`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: payload.id,
      ttfbMs: payload.ttfbMs,
      networkMs: payload.networkMs,
      downloadMs: payload.downloadMs,
      totalMs: payload.totalMs,
    }),
    credentials: "include",
    keepalive: true,
  }).catch(() => undefined);
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser; schoolContext: SchoolContext }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  registerSchool: (payload: { name: string; email: string; password: string; confirm: string; schoolName: string }) =>
    request<{ token: string; user: SessionUser; schoolContext: SchoolContext }>("/auth/register-school", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () => request("/auth/logout", { method: "POST" }),
  forgot: (email: string) =>
    request<{ message: string }>("/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }),
  reset: (token: string, password: string, confirm: string) =>
    request<{ message: string }>("/auth/reset", {
      method: "POST",
      body: JSON.stringify({ token, password, confirm }),
    }),
  acceptInvite: (payload: { token: string; password?: string; name?: string }) =>
    request<{ token: string; user: SessionUser; schoolContext: SchoolContext }>("/auth/invite/accept", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  schoolSession: () => request<SchoolContext>("/console/session"),
  dashboard: () => request<SchoolDashboard>("/console/dashboard"),
  students: (query?: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
    }
    const suffix = params.size ? `?${params}` : "";
    return request<StudentList>(`/console/students${suffix}`);
  },
  guardians: (q?: string) =>
    request<Guardian[]>(`/console/students/guardians${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  student: (id: string) => request<StudentProfile>(`/console/students/${id}`),
  createStudent: (payload: Record<string, unknown>) =>
    request<Student>("/console/students", { method: "POST", body: JSON.stringify(payload) }),
  admitStudent: (payload: Record<string, unknown>) =>
    request<Student>("/console/students/admit", { method: "POST", body: JSON.stringify(payload) }),
  updateStudent: (id: string, payload: Record<string, unknown>) =>
    request<StudentProfile>(`/console/students/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  saveStudentPhoto: (id: string, dataUrl: string) =>
    request<StudentProfile>(`/console/students/${id}/photo`, {
      method: "POST",
      body: JSON.stringify({ dataUrl }),
    }),
  addGuardian: (id: string, payload: Record<string, unknown>) =>
    request<StudentProfile>(`/console/students/${id}/guardians`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  studentTab: <T>(id: string, tab: string) => request<T>(`/console/students/${id}/${tab}`),
  promoteStudent: (id: string, classId: string, feeStructureId?: string) =>
    request<StudentProfile>(`/console/students/${id}/promote`, { method: "POST", body: JSON.stringify({ classId, feeStructureId }) }),
  transferStudent: (id: string, classId: string, feeStructureId?: string) =>
    request<StudentProfile>(`/console/students/${id}/transfer`, { method: "POST", body: JSON.stringify({ classId, feeStructureId }) }),
  deactivateStudent: (id: string) =>
    request<StudentProfile>(`/console/students/${id}/deactivate`, { method: "POST", body: JSON.stringify({}) }),
  bulkStudents: (payload: { ids: string[]; action: string; classId?: string; feeStructureId?: string; confirm: true }) =>
    request<{ updated?: number; ids?: string[]; action: string }>("/console/students/bulk", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  addStudentCommunication: (id: string, payload: Record<string, unknown>) =>
    request(`/console/students/${id}/communications`, { method: "POST", body: JSON.stringify(payload) }),
  uploadStudentDocument: (id: string, payload: Record<string, unknown>) =>
    request(`/console/students/${id}/documents`, { method: "POST", body: JSON.stringify(payload) }),
  admissions: (query?: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
    }
    const suffix = params.size ? `?${params}` : "";
    return request<AdmissionList>(`/console/admissions${suffix}`);
  },
  admissionsSummary: () => request<AdmissionSummary>("/console/admissions/summary"),
  admissionApplication: (id: string) => request<AdmissionDetail>(`/console/admissions/${id}`),
  admissionSiblingFees: (id: string) => request<AdmissionSiblingFees>(`/console/admissions/${id}/sibling-fees`),
  createAdmission: (payload: Record<string, unknown> = {}) =>
    request<AdmissionDetail>("/console/admissions", { method: "POST", body: JSON.stringify(payload) }),
  patchAdmission: (id: string, payload: Record<string, unknown>) =>
    request<AdmissionDetail>(`/console/admissions/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  admissionAction: (id: string, action: string, payload: Record<string, unknown> = {}) =>
    request<AdmissionDetail | { deleted: true; id: string }>(`/console/admissions/${id}/${action}`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadAdmissionDocument: (id: string, payload: Record<string, unknown>) =>
    request<AdmissionDetail>(`/console/admissions/${id}/documents`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  removeAdmissionDocument: (id: string, documentId: string) =>
    request<AdmissionDetail>(`/console/admissions/${id}/documents/${documentId}`, { method: "DELETE" }),
  admissionDuplicates: (query: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(key, value);
    }
    return request<{ matches: DuplicateMatch[] }>(`/console/admissions/duplicates?${params}`);
  },
  saveAttendance: (payload: {
    classId: string;
    date: string;
    records: { studentId: string; status: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "EXCUSED" }[];
  }) => request("/console/attendance", { method: "POST", body: JSON.stringify(payload) }),
  feesDashboard: () => request<FeesDashboard>("/console/fees/dashboard"),
  feeHeads: () => request<FeeHead[]>("/console/fees/heads"),
  createFeeHead: (payload: Record<string, unknown>) =>
    request<FeeHead>("/console/fees/heads", { method: "POST", body: JSON.stringify(payload) }),
  updateFeeHead: (id: string, payload: Record<string, unknown>) =>
    request<FeeHead>(`/console/fees/heads/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  archiveFeeHead: (id: string) => request(`/console/fees/heads/${id}`, { method: "DELETE" }),
  feeStructures: () => request<FeeStructureRow[]>("/console/fees/structures"),
  feeStructureDetail: (id: string) => request<FeeStructureRow>(`/console/fees/structures/${id}`),
  createFeeStructure: (payload: Record<string, unknown>) =>
    request<FeeStructureRow>("/console/fees/structures", { method: "POST", body: JSON.stringify(payload) }),
  updateFeeStructure: (id: string, payload: Record<string, unknown>) =>
    request<FeeStructureRow>(`/console/fees/structures/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  feeAssignments: (studentId?: string) =>
    request(`/console/fees/assignments${studentId ? `?studentId=${studentId}` : ""}`),
  createFeeAssignment: (payload: Record<string, unknown>) =>
    request("/console/fees/assignments", { method: "POST", body: JSON.stringify(payload) }),
  updateFeeAssignment: (id: string, payload: Record<string, unknown>) =>
    request(`/console/fees/assignments/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  feeDiscounts: () => request<FeeDiscount[]>("/console/fees/discounts"),
  createFeeDiscount: (payload: Record<string, unknown>) =>
    request("/console/fees/discounts", { method: "POST", body: JSON.stringify(payload) }),
  updateFeeDiscount: (id: string, payload: Record<string, unknown>) =>
    request(`/console/fees/discounts/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  assignStudentDiscount: (payload: Record<string, unknown>) =>
    request("/console/fees/student-discounts", { method: "POST", body: JSON.stringify(payload) }),
  feeSetupStatus: () =>
    request<{ feeHeads: number; classes: number; classesWithoutStructure: string[] }>("/console/fees/setup-status"),
  applyFeeCatalog: (payload: { academicYearId: string; campusId?: string | null; classNames: string[] }) =>
    request<{ created: number; updated: number }>("/console/fees/structures/apply-catalog", { method: "POST", body: JSON.stringify(payload) }),
  previewFees: (payload: GenerateFeesPayload) =>
    request<FeePreview>("/console/fees/generate/preview", { method: "POST", body: JSON.stringify(payload) }),
  generateFees: (payload: GenerateFeesPayload & { confirm: true }) =>
    request<FeeGenerateResult>("/console/fees/generate", { method: "POST", body: JSON.stringify(payload) }),
  generateYearForStudent: (studentId: string, academicYearId: string, from: "year_start" | "this_month") =>
    request<{ createdInvoiceIds: string[]; totalPkr: number }>(`/console/fees/students/${studentId}/generate-year`, {
      method: "POST",
      body: JSON.stringify({ academicYearId, from }),
    }),
  syncFeesFromAdmission: () =>
    request<{ updated: number; students: string[] }>("/console/fees/assignments/sync-from-admission", { method: "POST", body: "{}" }),
  generateCurrentForStudent: (studentId: string, academicYearId: string) =>
    request<{ created: boolean; reason?: string; invoiceId?: string; totalPkr?: number }>(`/console/fees/students/${studentId}/generate-current`, {
      method: "POST",
      body: JSON.stringify({ academicYearId }),
    }),
  feeInvoices: (query: FeeInvoiceQuery = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    const qs = params.toString();
    return request<Paged<FeeInvoiceRow> & { balancePkr: number }>(`/console/fees/invoices${qs ? `?${qs}` : ""}`);
  },
  feeInvoice: (id: string) => request<FeeInvoiceDetail>(`/console/fees/invoices/${id}`),
  cancelFeeInvoice: (id: string, notes?: string) =>
    request(`/console/fees/invoices/${id}/cancel`, { method: "POST", body: JSON.stringify({ notes }) }),
  studentFees: (studentId: string) => request<StudentFees>(`/console/students/${studentId}/fees`),
  feePayments: (query: { studentId?: string; q?: string; page?: string; pageSize?: string } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    const qs = params.toString();
    return request<Paged<FeePaymentRow> & { todayPkr: number }>(`/console/fees/payments${qs ? `?${qs}` : ""}`);
  },
  collectFeePayment: (payload: CollectPaymentPayload) =>
    request<PaymentResult>("/console/fees/payments", { method: "POST", body: JSON.stringify(payload) }),
  voidFeePayment: (id: string) => request(`/console/fees/payments/${id}/void`, { method: "POST", body: "{}" }),
  refundFeePayment: (id: string) => request(`/console/fees/payments/${id}/refund`, { method: "POST", body: "{}" }),
  feeReceipt: (id: string) => request<FeeReceipt>(`/console/fees/receipts/${id}`),
  feeReports: (query: Record<string, string | undefined> = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    const suffix = params.toString();
    return request<FeeReportResult>(`/console/fees/reports${suffix ? `?${suffix}` : ""}`);
  },
  feeSettings: () => request<FeeSettings>("/console/fees/settings"),
  saveFeeSettings: (payload: Record<string, unknown>) =>
    request<FeeSettings>("/console/fees/settings", { method: "PATCH", body: JSON.stringify(payload) }),
  async receiptPdf(id: string) {
    const headers: Record<string, string> = {};
    const auth = token();
    if (auth) headers.Authorization = `Bearer ${auth}`;
    const campusId = readCampusId();
    if (campusId) headers["X-Campus-Id"] = campusId;
    const yearId = readYearId();
    if (yearId) headers["X-Year-Id"] = yearId;
    const res = await fetch(`${API}/console/fees/receipts/${id}/pdf`, { headers, credentials: "include" });
    if (!res.ok) throw new ApiError("Could not download this PDF", res.status);
    return URL.createObjectURL(await res.blob());
  },
  async challanPdf(invoiceId: string) {
    const headers: Record<string, string> = {};
    const auth = token();
    if (auth) headers.Authorization = `Bearer ${auth}`;
    const campusId = readCampusId();
    if (campusId) headers["X-Campus-Id"] = campusId;
    const yearId = readYearId();
    if (yearId) headers["X-Year-Id"] = yearId;
    const res = await fetch(`${API}/console/fees/invoices/${invoiceId}/challan`, { headers, credentials: "include" });
    if (!res.ok) throw new ApiError("Could not download this challan", res.status);
    return URL.createObjectURL(await res.blob());
  },
  setup: () => request<Setup>("/console/setup"),
  setupStatus: () => request<{ setupCompleted: boolean; setupStep: number }>("/console/setup/status"),
  admissionForm: () => request<{ fields: AdmissionField[] }>("/console/setup/admission-form"),
  admission: () =>
    request<{ fields: AdmissionField[]; classes: { id: string; name: string; section: string }[] }>(
      "/console/setup/admission",
    ),
  campuses: () => request<{ campuses: Setup["campuses"] }>("/console/setup/campuses"),
  academics: () => request<Academics>("/console/setup/academics"),
  removeClass: (id: string) => request<{ ok: true }>(`/console/setup/classes/${id}`, { method: "DELETE" }),
  setClassSubjects: (id: string, subjectIds: string[]) =>
    request<{ subjectIds: string[] }>(`/console/setup/classes/${id}/subjects`, {
      method: "PUT",
      body: JSON.stringify({ subjectIds }),
    }),
  removeSubject: (id: string) => request<{ ok: true }>(`/console/setup/subjects/${id}`, { method: "DELETE" }),
  feeStructure: () =>
    request<{ feeItems: Setup["feeItems"]; templates: { feeItems: string[] } }>("/console/setup/fees"),
  schoolProfile: () =>
    request<{
      school: {
        name: string;
        address: string;
        area: string;
        whatsapp: string;
        phone: string;
        website: string;
        feeBand: string;
        profile: Record<string, unknown> | null;
      };
    }>("/console/setup/profile"),
  saveOrg: (payload: Record<string, unknown>) =>
    request("/console/setup/org", { method: "POST", body: JSON.stringify(payload) }),
  saveCampus: (payload: Record<string, unknown>) =>
    request("/console/setup/campus", { method: "POST", body: JSON.stringify(payload) }),
  addCampus: (payload: Record<string, unknown>) =>
    request("/console/setup/campuses", { method: "POST", body: JSON.stringify(payload) }),
  updateCampus: (id: string, payload: Record<string, unknown>) =>
    request(`/console/setup/campuses/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  updateClass: (id: string, payload: Record<string, unknown>) =>
    request(`/console/setup/classes/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  applySubjects: (payload: { template: string }) =>
    request("/console/setup/subjects/apply", { method: "POST", body: JSON.stringify(payload) }),
  createYear: (payload: Record<string, unknown>) =>
    request("/console/setup/years", { method: "POST", body: JSON.stringify(payload) }),
  createClass: (payload: Record<string, unknown>) =>
    request("/console/setup/classes", { method: "POST", body: JSON.stringify(payload) }),
  applyClasses: (payload: Record<string, unknown>) =>
    request("/console/setup/classes/apply", { method: "POST", body: JSON.stringify(payload) }),
  saveSubject: (payload: Record<string, unknown>) =>
    request("/console/setup/subjects", { method: "POST", body: JSON.stringify(payload) }),
  seedSubjects: () => request("/console/setup/subjects/seed", { method: "POST" }),
  saveAdmissionForm: (payload: Record<string, unknown>) =>
    request("/console/setup/admission-form", { method: "POST", body: JSON.stringify(payload) }),
  importStudents: (payload: Record<string, unknown>) =>
    request<{ count: number }>("/console/setup/import-students", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  saveFees: (payload: Record<string, unknown>) =>
    request("/console/setup/fees", { method: "POST", body: JSON.stringify(payload) }),
  seedFees: () => request("/console/setup/fees/seed", { method: "POST" }),
  addCampusRole: (payload: Record<string, unknown>) =>
    request("/console/setup/roles", { method: "POST", body: JSON.stringify(payload) }),
  completeSetup: () => request("/console/setup/complete", { method: "POST" }),
  skipSetup: (step: number) => request(`/console/setup/skip?step=${step}`, { method: "POST" }),
  uploadMedia: (payload: { kind: "LOGO" | "COVER"; filename?: string; dataUrl: string }) =>
    request<{ url: string }>("/console/setup/media", { method: "POST", body: JSON.stringify(payload) }),
  staff: (query: { status?: string; q?: string; page?: string; pageSize?: string } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    const qs = params.toString();
    return request<StaffPage>(`/console/staff${qs ? `?${qs}` : ""}`);
  },
  /** Everyone, unpaged, for pickers such as the timetable's teacher list. */
  staffRoster: () => request<Staff[]>("/console/staff/roster"),
  staffMember: (id: string) => request<StaffDetail>(`/console/staff/${id}`),
  staffTimetable: (id: string) => request<StaffWeek>(`/console/staff/${id}/timetable`),
  createStaff: (payload: Record<string, unknown>) =>
    request<StaffDetail>("/console/staff", { method: "POST", body: JSON.stringify(payload) }),
  updateStaff: (id: string, payload: Record<string, unknown>) =>
    request<StaffDetail>(`/console/staff/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  changeStaffStatus: (id: string, payload: { status: StaffStatus; effectiveOn: string; reason?: string }) =>
    request<StaffDetail & { freedLessons: number }>(`/console/staff/${id}/status`, { method: "POST", body: JSON.stringify(payload) }),
  addStaffContract: (id: string, payload: Record<string, unknown>) =>
    request<StaffDetail>(`/console/staff/${id}/contracts`, { method: "POST", body: JSON.stringify(payload) }),
  saveStaffAccount: (id: string, payload: { email: string; password?: string; role: StaffLoginRole }) =>
    request<StaffDetail>(`/console/staff/${id}/account`, { method: "PUT", body: JSON.stringify(payload) }),
  assignStaff: (id: string, payload: { classId: string; subject?: string }) =>
    request(`/console/staff/${id}/assign`, { method: "POST", body: JSON.stringify(payload) }),
  unassignStaff: (id: string, assignmentId: string) =>
    request(`/console/staff/${id}/assign/${assignmentId}`, { method: "DELETE" }),
  payroll: (period: string) => request<PayrollMonth>(`/console/payroll?period=${period}`),
  generatePayroll: (period: string) =>
    request<{ created: number; withoutContract: string[] }>("/console/payroll/generate", { method: "POST", body: JSON.stringify({ period }) }),
  finalizePayroll: (period: string) =>
    request<{ finalized: number }>("/console/payroll/finalize", { method: "POST", body: JSON.stringify({ period }) }),
  payslip: (id: string) => request<PayslipDetail>(`/console/payroll/payslips/${id}`),
  updatePayslip: (id: string, payload: { basicPkr?: number; allowances?: PayLine[]; deductions?: PayLine[]; notes?: string }) =>
    request<PayslipDetail>(`/console/payroll/payslips/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  finalizePayslip: (id: string) => request<PayslipDetail>(`/console/payroll/payslips/${id}/finalize`, { method: "POST", body: "{}" }),
  payPayslip: (id: string, payload: { paidOn: string; method: string; reference?: string }) =>
    request<PayslipDetail>(`/console/payroll/payslips/${id}/pay`, { method: "POST", body: JSON.stringify(payload) }),
  cancelPayslip: (id: string) => request<PayslipDetail>(`/console/payroll/payslips/${id}/cancel`, { method: "POST", body: "{}" }),
  portal: () => request<Portal>("/console/me"),
  myPayslip: (id: string) => request<PayslipDetail>(`/console/me/payslips/${id}`),
  invites: () => request<Invite[]>("/console/invites"),
  invite: (payload: Record<string, unknown>) =>
    request<Invite & { acceptUrl: string }>("/console/invites", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProfile: (payload: Record<string, unknown>) =>
    request("/schools/me/profile", { method: "PATCH", body: JSON.stringify(payload) }),
  timetable: (classId?: string) =>
    request<Timetable>(`/console/timetable${classId ? `?classId=${classId}` : ""}`),
  savePeriod: (payload: Record<string, unknown>) =>
    request("/console/timetable/periods", { method: "POST", body: JSON.stringify(payload) }),
  updatePeriod: (id: string, payload: Record<string, unknown>) =>
    request(`/console/timetable/periods/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  removePeriod: (id: string) => request(`/console/timetable/periods/${id}`, { method: "DELETE" }),
  saveLesson: (payload: Record<string, unknown>) =>
    request("/console/timetable/lessons", { method: "POST", body: JSON.stringify(payload) }),
  removeLesson: (id: string) => request(`/console/timetable/lessons/${id}`, { method: "DELETE" }),
  generateTimetable: (payload: GenerateTimetablePayload) =>
    request<GenerateTimetableResult>("/console/timetable/generate", { method: "POST", body: JSON.stringify(payload) }),
  adminSchools: () => request<AdminSchool[]>("/admin/schools"),
  adminClaims: () => request<AdminClaim[]>("/admin/claims"),
  approveClaim: (id: string) => request(`/admin/claims/${id}/approve`, { method: "POST" }),
  rejectClaim: (id: string, reason: string) =>
    request(`/admin/claims/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }),
  createSchool: (payload: Record<string, unknown>) =>
    request("/admin/schools", { method: "POST", body: JSON.stringify(payload) }),
};

export type Guardian = {
  id: string;
  name: string;
  phone: string;
  cnic?: string | null;
  email?: string | null;
  relation: string;
  occupation?: string;
  extra?: Record<string, unknown>;
  students?: { id: string; firstName: string; lastName: string }[];
  _count?: { students: number };
};

export type AdmissionSiblingFees = {
  siblings: {
    id: string;
    firstName: string;
    lastName: string;
    rollNo: string;
    class: { name: string; section: string } | null;
    fees: { name: string; amountPkr: number; catalogAmountPkr: number }[];
  }[];
};

export type AttendanceMark = "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "EXCUSED";

export type StudentRow = {
  id: string;
  rollNo: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  status: string;
  guardianName: string;
  phone: string;
  address: string;
  campus?: { id: string; name: string } | null;
  class: { id: string; name: string; section: string } | null;
  attendancePct: number;
  attendanceMarked: boolean;
  todayAttendance: AttendanceMark | null;
  pendingFees: { status: "pending" | "paid" | "none"; amountPkr: number };
};

export type StudentList = {
  items: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  canMutate?: boolean;
};

export type Student = {
  id: string;
  admissionNo: string;
  rollNo?: string;
  firstName: string;
  lastName: string;
  gender: string;
  status: string;
  dateOfBirth?: string | null;
  admissionDate?: string;
  firstAdmissionDate?: string;
  extra?: Record<string, unknown>;
  enrollments: { class: { id: string; name: string; section: string } }[];
  invoices: { id: string; amountPkr: number; status: string; dueOn: string }[];
  guardians: { guardian: Guardian }[];
};

export type StudentProfile = {
  id: string;
  admissionNo: string;
  rollNo: string;
  firstName: string;
  lastName: string;
  gender: string;
  status: string;
  dateOfBirth?: string | null;
  admissionDate?: string;
  firstAdmissionDate?: string;
  extra: Record<string, string>;
  photo: string;
  phone: string;
  address: string;
  campus: { id: string; name: string } | null;
  class: { id: string; name: string; section: string; yearId: string } | null;
  todayAttendance: AttendanceMark | null;
  guardians: { guardian: Guardian }[];
  siblings?: {
    id: string;
    firstName: string;
    lastName: string;
    rollNo: string;
    photo: string;
    class: { name: string; section: string } | null;
  }[];
  details: { label: string; value: string }[];
  metrics: {
    attendancePct: number | null;
    attendanceMarked: boolean;
    feesDue: number;
    latestExamPct: number | null;
    latestGrade?: string | null;
    latestRank?: number | null;
    enrollmentYears: number;
  };
  years?: { id: string; name: string; current: boolean; startsOn: string; endsOn: string }[];
  classes?: { id: string; name: string; section: string; yearId: string; yearName: string; campusName?: string }[];
  canMutate?: boolean;
};

export type SchoolClass = {
  id: string;
  name: string;
  section: string;
  yearId?: string;
  enrollments: { student: Student }[];
};

export type AdmissionStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ASSESSMENT_PENDING"
  | "INTERVIEW_PENDING"
  | "ACCEPTED"
  | "WAITLISTED"
  | "REJECTED"
  | "FEE_PENDING"
  | "DOCUMENTS_PENDING"
  | "ADMISSION_CONFIRMED"
  | "WITHDRAWN";

export type AdmissionFeeQuote = {
  feeItemId: string;
  name: string;
  catalogAmountPkr: number;
  amountPkr: number;
};

export type AdmissionRow = {
  id: string;
  applicationNo: string;
  status: AdmissionStatus;
  firstName: string;
  lastName: string;
  className: string;
  section: string;
  campus: string;
  guardianName: string;
  guardianPhone: string;
  createdAt: string;
  wizardStep: number;
  addedBy: string;
  nextAction: string;
};

export type AdmissionList = {
  items: AdmissionRow[];
  total: number;
  page: number;
  pageSize: number;
  summary: AdmissionSummary;
};

export type AdmissionSummary = {
  total: number;
  open: number;
  draft: number;
  submitted: number;
  underReview: number;
  assessmentPending: number;
  interviewPending: number;
  accepted: number;
  feePending: number;
  documentsPending: number;
  waitlisted: number;
  rejected: number;
  confirmed: number;
  withdrawn: number;
};

export type AdmissionDetail = {
  id: string;
  applicationNo: string;
  status: AdmissionStatus;
  firstName: string;
  lastName: string;
  middleName: string;
  gender: string;
  dateOfBirth?: string | null;
  cnic: string;
  bloodGroup: string;
  nationality: string;
  address: string;
  photoUrl: string;
  extra: Record<string, string>;
  yearId: string | null;
  campusId: string | null;
  className: string;
  section: string;
  targetClassId: string | null;
  studentType: string;
  previousSchool: string;
  previousClass: string;
  previousYear: string;
  previousResult: string;
  previousPct: string;
  transferNotes: string;
  guardianId: string | null;
  studentId: string | null;
  family: Record<string, string>;
  feeQuotes: AdmissionFeeQuote[];
  wizardStep: number;
  createdBy: { id: string; name: string } | null;
  assessmentMode: "NONE" | "TEST" | "INTERVIEW" | "BOTH";
  interviewAt?: string | null;
  interviewer: string;
  interviewNotes: string;
  recommendation: string;
  decisionNote: string;
  submittedAt?: string | null;
  guardian: Guardian | null;
  campus: { id: string; name: string } | null;
  year: { id: string; name: string } | null;
  targetClass: { id: string; name: string; section: string } | null;
  student: { id: string; admissionNo: string } | null;
  scores: { id: string; subject: string; maxMarks: number; obtainedMarks: number; pct: number }[];
  assessmentPct: number | null;
  documents: { id: string; kind: string; label: string; required: boolean; url: string }[];
  invoices: { id: string; name: string; amountPkr: number; paidPkr: number; status: string; dueOn: string; receiptId: string | null }[];
  blockers: string[];
  nextAction: string;
  feeItems: { id: string; name: string; amountPkr: number }[];
  classes?: { id: string; name: string; section: string; yearId: string; campusId: string | null; yearName?: string; campusName?: string }[];
  campuses?: { id: string; name: string }[];
  years?: { id: string; name: string; current: boolean }[];
};

export type DuplicateMatch = {
  kind: string;
  reason: string;
  student?: { id: string; admissionNo: string; firstName: string; lastName: string };
  application?: { id: string; applicationNo: string; firstName: string; lastName: string; status: string };
};

export type FeeStudentSummary = { id: string; name: string; admissionNo: string; className: string; section: string };

export type FeeInvoiceView = {
  id: string;
  invoiceNumber: string;
  title: string;
  billingPeriod: string;
  periodLabel: string;
  kind: "monthly" | "other";
  issueDate: string;
  dueOn: string;
  status: string;
  lines: { description: string; amountPkr: number }[];
  subtotalPkr: number;
  discountPkr: number;
  lateFeePkr: number;
  totalPkr: number;
  creditAppliedPkr: number;
  paidPkr: number;
  balancePkr: number;
  student: FeeStudentSummary | null;
  payments: {
    id: string;
    paymentNumber: string;
    appliedPkr: number;
    amountPkr: number;
    method: string;
    status: string;
    paymentDate: string;
    referenceNumber: string;
    receiptId: string | null;
    receiptNumber: string | null;
  }[];
};

export type SchoolLetterhead = {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  registrationNo: string;
  primaryColor: string;
  logoUrl: string;
};

export type FeeGuardian = { name: string; relation: string; phone: string } | null;

export type FeeInvoiceDetail = FeeInvoiceView & { school: SchoolLetterhead; guardian: FeeGuardian };

export type FeeInvoiceRow = {
  id: string;
  invoiceNumber: string;
  title: string;
  periodLabel: string;
  dueOn: string;
  status: string;
  totalPkr: number;
  paidPkr: number;
  balancePkr: number;
  /** Academic year the invoice belongs to; shown when listing more than one year. */
  yearName: string | null;
  student: FeeStudentSummary | null;
};

export type FeeInvoiceQuery = {
  status?: string;
  q?: string;
  studentId?: string;
  billingPeriod?: string;
  className?: string;
  section?: string;
  years?: "this" | "previous" | "all";
  page?: string;
  pageSize?: string;
};

export type StudentFees = {
  outstandingPkr: number;
  overduePkr: number;
  /** Part of outstandingPkr carried over from earlier academic years. */
  previousYearsPkr?: number;
  creditPkr: number;
  currentInvoice: FeeInvoiceView | null;
  invoices: FeeInvoiceView[];
  payments: {
    id: string;
    paymentNumber: string;
    paymentDate: string;
    amountPkr: number;
    method: string;
    referenceNumber: string;
    status: string;
    receiptId: string | null;
    receiptNumber: string | null;
  }[];
  credits: { id: string; amountPkr: number; remainingAmountPkr: number; reason: string; createdAt: string }[];
  assignment: { academicYearId: string; structureName: string; hasCustomFees: boolean } | null;
};

export type GenerateFeesPayload = {
  billingPeriod: string;
  academicYearId: string;
  campusId?: string;
  className?: string;
  section?: string;
};

export type FeePreview = {
  billingPeriod: string;
  dueOn: string;
  eligible: number;
  create: number;
  skippedAlreadyBilled: number;
  skippedZeroTotal: number;
  missingAssignment: number;
  totalPkr: number;
};

export type FeeGenerateResult = Omit<FeePreview, "eligible" | "create" | "dueOn"> & { created: number; invoices: FeeInvoiceView[] };

export type CollectPaymentPayload = {
  studentId: string;
  invoiceId?: string;
  invoiceIds?: string[];
  amountPkr: number;
  useCreditPkr?: number;
  requestId?: string;
  method: string;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
};

export type PaymentResult =
  | { creditOnly: true; creditAppliedPkr: number }
  | {
      creditOnly: false;
      id: string;
      paymentNumber: string;
      receiptId: string;
      receiptNumber: string;
      amountPkr: number;
      creditPkr: number;
      creditAppliedPkr: number;
    };

export type FeePaymentRow = {
  id: string;
  paymentNumber: string;
  paymentDate: string;
  amountPkr: number;
  method: string;
  referenceNumber: string;
  status: string;
  student: { id: string; firstName: string; lastName: string; admissionNo: string } | null;
  receipt: { id: string; receiptNumber: string } | null;
  invoices: { id: string; invoiceNumber: string; periodLabel: string; appliedPkr: number }[];
};

export type FeeReceipt = {
  id: string;
  paymentId: string;
  receiptNumber: string;
  paymentNumber: string;
  receiptDate: string;
  status: string;
  school: SchoolLetterhead;
  header: string;
  footer: string;
  student: FeeStudentSummary | null;
  guardian: FeeGuardian;
  invoices: { id: string; invoiceNumber: string; title: string; appliedPkr: number }[];
  lines: { description: string; amountPkr: number }[];
  discountPkr: number;
  lateFeePkr: number;
  totalPkr: number;
  amountPaidPkr: number;
  method: string;
  referenceNumber: string;
  notes: string;
  previousBalancePkr: number;
  remainingBalancePkr: number;
  creditPkr: number;
};

export type FeesDashboard = {
  todayPkr: number;
  monthPkr: number;
  outstandingPkr: number;
  overduePkr: number;
  /** Unpaid balance from earlier academic years (still collectable). */
  previousYears: { pkr: number; invoices: number };
  counts: { unpaid: number; partial: number; paid: number; overdue: number };
  recentPayments: { id: string; amountPkr: number; method: string; paymentDate: string; student: { firstName: string; lastName: string } | null }[];
  overdueInvoices: { id: string; name: string; amountPkr: number; dueOn: string; student: { firstName: string; lastName: string } | null }[];
  recentReceipts: { id: string; receiptNumber: string; amountPkr: number; receiptDate: string; student: { firstName: string; lastName: string } | null }[];
};

export type FeeHead = {
  id: string;
  name: string;
  code: string;
  category: string;
  frequency: string;
  recurring: boolean;
  taxable: boolean;
  description: string;
  active: boolean;
  amountPkr: number;
  sortOrder: number;
};

export type FeeStructureRow = {
  id: string;
  name: string;
  className: string;
  section: string;
  frequency: string;
  status: string;
  academicYearId: string;
  campusId: string | null;
  subtotalPkr: number;
  notes?: string;
  year?: { id: string; name: string };
  items: { id?: string; feeHeadId: string; amountPkr: number; isOptional: boolean; taxable: boolean; sortOrder: number; feeHead?: { name: string; code: string; frequency?: string } }[];
};

export type FeeDiscount = {
  id: string;
  name: string;
  type: "FIXED" | "PERCENT";
  value: number;
  active: boolean;
  _count?: { students: number };
};

export type FeeReportRow = { id: string; paymentNumber: string; paymentDate: string; method: string; amountPkr: number; student: { firstName: string; lastName: string } | null };

/** Totals cover the whole date range; `items` is the requested page of payments. */
export type FeeReportResult = Paged<FeeReportRow> & {
  from: string;
  to: string;
  totalPkr: number;
  count: number;
};

export type FeeSettings = {
  defaultDueDay: number;
  graceDays: number;
  autoGenerateEnabled: boolean;
  lateFeeMode: string;
  lateFeeAmountPkr: number;
  lateFeePercent: number;
  lateFeeCapPkr: number;
  invoicePrefix: string;
  paymentPrefix: string;
  receiptPrefix: string;
  receiptHeader: string;
  receiptFooter: string;
  showTaxOnReceipt: boolean;
  taxNumber: string;
  ntn: string;
  strn: string;
  primaryColor: string;
  fbrEnabled: boolean;
  fbrEnvironment: string;
  fbrCredentialsSet: boolean;
};

export type AbsentRow = {
  id: string;
  status: string;
  student: Student;
  class: { name: string; section: string };
};

export type StaffStatus = "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "RESIGNED" | "TERMINATED";
export type ContractType = "PERMANENT" | "CONTRACT" | "PROBATION" | "PART_TIME" | "VISITING";
export type PayslipStatus = "DRAFT" | "FINALIZED" | "PAID" | "CANCELLED";
export type StaffLoginRole = "TEACHER" | "SCHOOL_ADMIN";
export type PayLine = { label: string; amountPkr: number };

export type StaffAssignment = { id: string; subject: string; class: { id: string; name: string; section: string } };

export type Staff = {
  id: string;
  employeeNo: string;
  name: string;
  cnic: string;
  title: string;
  department: string;
  status: StaffStatus;
  email: string | null;
  phone: string;
  joinDate: string | null;
  campus: { id: string; name: string } | null;
  login: { role: string; disabled: boolean } | null;
  contract: { type: ContractType; basicSalaryPkr: number; endDate: string | null } | null;
  assignments: StaffAssignment[];
};

export type StaffPage = Paged<Staff> & {
  /** Headline numbers for current staff; null while a search is active. */
  summary: { current: number; monthlyPkr: number; noLogin: number; noContract: number } | null;
};

export type StaffContract = {
  id: string;
  type: ContractType;
  startDate: string;
  endDate: string | null;
  basicSalaryPkr: number;
  allowances: PayLine[];
  notes: string;
};

export type StaffDetail = {
  id: string;
  employeeNo: string;
  name: string;
  cnic: string;
  gender: string;
  dateOfBirth: string | null;
  address: string;
  title: string;
  department: string;
  joinDate: string | null;
  status: StaffStatus;
  email: string | null;
  phone: string;
  bankName: string;
  bankAccountTitle: string;
  bankAccountNo: string;
  subjects: string[];
  campusId: string | null;
  campus: { id: string; name: string } | null;
  login: { email: string; role: string; disabled: boolean } | null;
  contracts: StaffContract[];
  currentContractId: string | null;
  statusChanges: { id: string; fromStatus: StaffStatus; toStatus: StaffStatus; reason: string; effectiveOn: string; createdAt: string; actorName: string }[];
  assignments: StaffAssignment[];
  payslips: { id: string; period: string; payslipNo: string; netPkr: number; status: PayslipStatus; paidOn: string | null }[];
};

export type StaffWeek = {
  periods: TimetablePeriod[];
  lessons: { id: string; weekday: number; periodId: string; subject: string; class: { id: string; name: string; section: string } }[];
};

export type PayslipRow = {
  id: string;
  period: string;
  payslipNo: string;
  basicPkr: number;
  grossPkr: number;
  deductionPkr: number;
  netPkr: number;
  status: PayslipStatus;
  paidOn: string | null;
  staff: { id: string; employeeNo: string; name: string; title: string; department: string };
};

export type PayrollMonth = {
  period: string;
  label: string;
  payslips: PayslipRow[];
  summary: {
    staff: number;
    grossPkr: number;
    deductionPkr: number;
    netPkr: number;
    paidPkr: number;
    drafts: number;
    finalized: number;
    paid: number;
    missing: number;
  };
};

export type PayslipDetail = {
  id: string;
  period: string;
  label: string;
  payslipNo: string;
  basicPkr: number;
  allowances: PayLine[];
  deductions: PayLine[];
  grossPkr: number;
  deductionPkr: number;
  netPkr: number;
  status: PayslipStatus;
  paidOn: string | null;
  method: string;
  reference: string;
  notes: string;
  staff: {
    id: string;
    employeeNo: string;
    name: string;
    cnic: string;
    title: string;
    department: string;
    joinDate: string | null;
    bankName: string;
    bankAccountTitle: string;
    bankAccountNo: string;
    campus: { name: string } | null;
  };
  school: SchoolLetterhead;
};

export type Portal =
  | { staff: null }
  | {
      staff: {
        id: string;
        employeeNo: string;
        name: string;
        cnic: string;
        title: string;
        department: string;
        status: StaffStatus;
        joinDate: string | null;
        phone: string;
        email: string | null;
        campus: { name: string } | null;
        contract: { type: ContractType; startDate: string; endDate: string | null; basicSalaryPkr: number; allowances: PayLine[] } | null;
      };
      today: { date: string; weekday: number };
      timetable: StaffWeek;
      firstPeriod: {
        period: { id: string; label: string; startTime: string; endTime: string };
        /** Why attendance can't be taken today (holiday, closed day), or null. */
        locked: string | null;
        classes: { id: string; name: string; section: string; marked: boolean }[];
      } | null;
      payslips: { id: string; period: string; payslipNo: string; grossPkr: number; deductionPkr: number; netPkr: number; status: PayslipStatus; paidOn: string | null }[];
    };

export type Invite = {
  id: string;
  email: string;
  role: string;
  acceptedAt: string | null;
  expiresAt: string;
  acceptUrl?: string;
};

export type AdmissionField = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  locked?: boolean;
  group?: "guardian" | "student";
};

export type Setup = {
  school: {
    name: string;
    city: string;
    area: string;
    type: string;
    whatsapp: string;
    phone: string;
    website: string;
    address: string;
    email: string;
    province: string;
    country: string;
    registrationNo: string;
    educationLevel: string;
    feeBand: string;
    setupCompleted: boolean;
    setupStep: number;
    profile: Record<string, unknown> | null;
    media: { kind: string; url: string }[];
  } | null;
  campus: { id: string; name: string; address: string; phone: string; notes: string; principal: string; code: string; isMain: boolean } | null;
  campuses: { id: string; name: string; address: string; phone: string; principal: string; code: string; isMain: boolean }[];
  years: { id: string; name: string; startsOn: string; endsOn: string; current: boolean }[];
  classes: { id: string; name: string; section: string; yearId: string; campusId?: string | null; year: { name: string } }[];
  subjects: { id: string; name: string; enabled: boolean; classes: { class: { id: string; name: string; section: string } }[] }[];
  admissionForms: { id: string; name: string; fields: AdmissionField[] }[];
  feeItems: { id: string; name: string; amountPkr: number; enabled: boolean }[];
  memberships: { id: string; role: string; user: { name: string; email: string }; campus: { name: string } }[];
  templates: {
    admissionFields: AdmissionField[];
    feeItems: string[];
    subjectLibrary: string[];
    subjectTemplates?: Record<string, string[]>;
    subjectsByGrade?: Record<string, string[]>;
  };
};

export type TimetablePeriod = { id: string; label: string; startTime: string; endTime: string; isBreak: boolean; sortOrder: number };

export type Timetable = {
  classId: string | null;
  periods: TimetablePeriod[];
  lessons: {
    id: string;
    weekday: number;
    subject: string;
    periodId: string;
    staffId: string | null;
    staff: { name: string } | null;
  }[];
  /** Subjects offered to this class: its own list, else grade defaults, else every enabled subject. */
  subjects: string[];
};

export type BellSchedule = {
  startTime: string;
  periodMinutes: number;
  periodsPerDay: number;
  breakAfter: number;
  breakMinutes: number;
};

export type GenerateTimetablePayload = {
  classIds: string[];
  weekdays: number[];
  mode: "fill_empty" | "replace";
  schedule?: BellSchedule;
};

export type GenerateTimetableResult = {
  classes: number;
  skipped: number;
  lessons: number;
  withoutTeacher: number;
  periodsCreated: number;
  noSubjects: string[];
  /** Classes with more subjects than periods a day; the least-core subjects were left out. */
  tooManySubjects: string[];
};

export type AcademicClass = {
  id: string;
  name: string;
  section: string;
  yearId: string;
  campusId: string | null;
  students: number;
  lessons: number;
  subjectIds: string[];
  timetableSubjects: string[];
  teachers: { id: string; name: string }[];
};

export type AcademicSubject = { id: string; name: string; enabled: boolean; classes: number };

export type Academics = {
  years: Setup["years"];
  classes: AcademicClass[];
  subjects: AcademicSubject[];
};

export type AdminSchool = {
  id: string;
  name: string;
  slug: string;
  city: string;
  area: string;
  published: boolean;
  claimStatus: string;
  l2Active: boolean;
  deletedAt: string | null;
};

export type AdminClaim = {
  id: string;
  status: string;
  roleAtSchool: string;
  whatsapp: string;
  rejectReason: string | null;
  school: { name: string; slug: string; city: string };
  user: { name: string; email: string };
};

/** Fetches an authenticated file (PDF) and returns an object URL for opening or downloading. */
export async function authedFileUrl(path: string, errorMessage = "Could not download this file") {
  const headers: Record<string, string> = {};
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const campusId = readCampusId();
  if (campusId) headers["X-Campus-Id"] = campusId;
  const yearId = readYearId();
  if (yearId) headers["X-Year-Id"] = yearId;
  const res = await fetch(`${API}${path}`, { headers, credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(body.message ?? errorMessage, res.status);
  }
  return URL.createObjectURL(await res.blob());
}
