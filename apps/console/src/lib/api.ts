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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
  dashboard: () =>
    request<{
      schoolName: string;
      absentToday: number;
      collected: number;
      outstanding: number;
      invoiceCount: number;
    }>("/console/dashboard"),
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
  exams: () => request<ExamRow[]>("/console/exams"),
  createExam: (payload: Record<string, unknown>) =>
    request<ExamRow>("/console/exams", { method: "POST", body: JSON.stringify(payload) }),
  writeExamResult: (examId: string, payload: Record<string, unknown>) =>
    request(`/console/exams/${examId}/results`, { method: "POST", body: JSON.stringify(payload) }),
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
  attendance: (classId: string, date: string) =>
    request<{
      records: { studentId: string; status: string }[];
      students: { id: string; firstName: string; lastName: string; admissionNo: string }[];
    }>(`/console/attendance?classId=${classId}&date=${date}`),
  saveAttendance: (payload: {
    classId: string;
    date: string;
    records: { studentId: string; status: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "EXCUSED" }[];
  }) => request("/console/attendance", { method: "POST", body: JSON.stringify(payload) }),
  absent: (date: string) => request<AbsentRow[]>(`/console/attendance/absent?date=${date}`),
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
  applyFeeCatalog: (payload: { academicYearId: string; campusId?: string | null; classNames: string[] }) =>
    request<{ created: number; updated: number }>("/console/fees/structures/apply-catalog", { method: "POST", body: JSON.stringify(payload) }),
  previewFees: (payload: GenerateFeesPayload) =>
    request<FeePreview>("/console/fees/generate/preview", { method: "POST", body: JSON.stringify(payload) }),
  generateFees: (payload: GenerateFeesPayload & { confirm: true }) =>
    request<FeeGenerateResult>("/console/fees/generate", { method: "POST", body: JSON.stringify(payload) }),
  generateRemainingForStudent: (studentId: string, academicYearId: string) =>
    request<{ createdInvoiceIds: string[]; totalPkr: number }>(`/console/fees/students/${studentId}/generate-remaining`, {
      method: "POST",
      body: JSON.stringify({ academicYearId }),
    }),
  generateCurrentForStudent: (studentId: string, academicYearId: string) =>
    request<{ created: boolean; reason?: string; invoiceId?: string; totalPkr?: number }>(`/console/fees/students/${studentId}/generate-current`, {
      method: "POST",
      body: JSON.stringify({ academicYearId }),
    }),
  feeInvoices: (query: FeeInvoiceQuery = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    const qs = params.toString();
    return request<FeeInvoiceRow[]>(`/console/fees/invoices${qs ? `?${qs}` : ""}`);
  },
  feeInvoice: (id: string) => request<FeeInvoiceDetail>(`/console/fees/invoices/${id}`),
  cancelFeeInvoice: (id: string, notes?: string) =>
    request(`/console/fees/invoices/${id}/cancel`, { method: "POST", body: JSON.stringify({ notes }) }),
  studentFees: (studentId: string) => request<StudentFees>(`/console/students/${studentId}/fees`),
  feePayments: (query: { studentId?: string; q?: string } = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value) params.set(key, value);
    const qs = params.toString();
    return request<FeePaymentRow[]>(`/console/fees/payments${qs ? `?${qs}` : ""}`);
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
  academics: () =>
    request<{
      years: Setup["years"];
      classes: { id: string; name: string; section: string; yearId: string }[];
      subjects: { id: string; name: string; enabled: boolean }[];
    }>("/console/setup/academics"),
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
  staff: () => request<Staff[]>("/console/staff"),
  createStaff: (payload: Record<string, unknown>) =>
    request<Staff>("/console/staff", { method: "POST", body: JSON.stringify(payload) }),
  assignStaff: (id: string, payload: { classId: string; subject?: string }) =>
    request(`/console/staff/${id}/assign`, { method: "POST", body: JSON.stringify(payload) }),
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
  saveLesson: (payload: Record<string, unknown>) =>
    request("/console/timetable/lessons", { method: "POST", body: JSON.stringify(payload) }),
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
  cnic?: string;
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

export type ExamRow = {
  id: string;
  name: string;
  heldOn: string;
  yearId?: string | null;
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
  student: FeeStudentSummary | null;
};

export type FeeInvoiceQuery = {
  status?: string;
  q?: string;
  studentId?: string;
  billingPeriod?: string;
  className?: string;
  section?: string;
};

export type StudentFees = {
  outstandingPkr: number;
  overduePkr: number;
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
  assignment: { academicYearId: string; structureName: string } | null;
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
  method: string;
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
};

export type PaymentResult = { id: string; paymentNumber: string; receiptId: string; receiptNumber: string; amountPkr: number; creditPkr: number };

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
  items: { id?: string; feeHeadId: string; amountPkr: number; isOptional: boolean; taxable: boolean; sortOrder: number; feeHead?: { name: string; code: string } }[];
};

export type FeeDiscount = {
  id: string;
  name: string;
  type: "FIXED" | "PERCENT";
  value: number;
  active: boolean;
  _count?: { students: number };
};

export type FeeReportResult = {
  from: string;
  to: string;
  totalPkr: number;
  count: number;
  rows: { id: string; paymentNumber: string; paymentDate: string; method: string; amountPkr: number; student: { firstName: string; lastName: string } | null }[];
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

export type Staff = {
  id: string;
  name: string;
  title: string;
  email: string | null;
  phone: string;
  assignments: { id: string; subject: string; class: { name: string; section: string } }[];
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

export type Timetable = {
  classId: string | null;
  periods: { id: string; label: string; startTime: string; endTime: string; isBreak: boolean; sortOrder: number }[];
  lessons: {
    id: string;
    weekday: number;
    subject: string;
    periodId: string;
    staffId: string | null;
    staff: { name: string } | null;
  }[];
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
