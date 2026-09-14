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

export function setSession(next: { token: string; user: SessionUser } | null) {
  if (!next) {
    localStorage.removeItem("wellrun-token");
    localStorage.removeItem("wellrun-user");
    return;
  }
  localStorage.setItem("wellrun-token", next.token);
  localStorage.setItem("wellrun-user", JSON.stringify(next.user));
}

export function currentUser() {
  const raw = localStorage.getItem("wellrun-user");
  return raw ? (JSON.parse(raw) as SessionUser) : null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const res = await fetch(`${API}${path}`, { ...init, headers, credentials: "include" });
  if (res.status === 401) {
    setSession(null);
    throw new Error("unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    throw new Error(message ?? `Request failed: ${path}`);
  }
  return res.json();
}

export const api = {
  login: (email: string, password: string) =>
    request<{ token: string; user: SessionUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  registerSchool: (payload: { name: string; email: string; password: string; confirm: string; schoolName: string }) =>
    request<{ token: string; user: SessionUser }>("/auth/register-school", {
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
    request<{ token: string; user: SessionUser }>("/auth/invite/accept", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
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
  student: (id: string) => request<Student>(`/console/students/${id}`),
  createStudent: (payload: Record<string, unknown>) =>
    request<Student>("/console/students", { method: "POST", body: JSON.stringify(payload) }),
  admitStudent: (payload: Record<string, unknown>) =>
    request<Student>("/console/students/admit", { method: "POST", body: JSON.stringify(payload) }),
  updateStudent: (id: string, payload: Record<string, unknown>) =>
    request<Student>(`/console/students/${id}`, { method: "PATCH", body: JSON.stringify(payload) }),
  addGuardian: (id: string, payload: Record<string, unknown>) =>
    request<Student>(`/console/students/${id}/guardians`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  classes: () => request<SchoolClass[]>("/console/attendance/classes"),
  attendance: (classId: string, date: string) =>
    request<{ studentId: string; status: string }[]>(
      `/console/attendance?classId=${classId}&date=${date}`,
    ),
  saveAttendance: (payload: {
    classId: string;
    date: string;
    records: { studentId: string; status: "PRESENT" | "ABSENT" | "LATE" | "LEAVE" | "EXCUSED" }[];
  }) => request("/console/attendance", { method: "POST", body: JSON.stringify(payload) }),
  absent: (date: string) => request<AbsentRow[]>(`/console/attendance/absent?date=${date}`),
  invoices: () => request<Invoice[]>("/console/invoices"),
  pay: (payload: { invoiceId: string; amountPkr: number; method: string }) =>
    request<Payment>("/console/payments", { method: "POST", body: JSON.stringify(payload) }),
  receipt: (id: string) => request<Payment>(`/console/payments/${id}`),
  setup: () => request<Setup>("/console/setup"),
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
  extra?: Record<string, unknown>;
  _count?: { students: number };
};

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
  class: { id: string; name: string; section: string } | null;
  attendancePct: number;
  attendanceMarked: boolean;
  pendingFees: { status: "pending" | "paid" | "none"; amountPkr: number };
};

export type StudentList = {
  items: StudentRow[];
  total: number;
  page: number;
  pageSize: number;
  defaultClassId: string;
  campus: { id: string; name: string } | null;
  classes: { id: string; name: string; section: string; campusId?: string | null }[];
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
  invoices: Invoice[];
  guardians: { guardian: Guardian }[];
};

export type SchoolClass = {
  id: string;
  name: string;
  section: string;
  yearId?: string;
  enrollments: { student: Student }[];
};

export type Invoice = {
  id: string;
  amountPkr: number;
  status: string;
  dueOn: string;
  student: { id: string; firstName: string; lastName: string; admissionNo: string };
  feePlan: { name: string };
  payments: { id: string; amountPkr: number }[];
};

export type Payment = {
  id: string;
  amountPkr: number;
  receiptNo: string;
  method: string;
  paidAt: string;
  school?: { name: string };
  invoice: Invoice;
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
  };
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
  classes: { id: string; name: string; section: string }[];
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
