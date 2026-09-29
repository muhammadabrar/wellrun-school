import type {
  AssessmentKind,
  ExamKind,
  ExamStatus,
  GradeBand,
  MarkAttendance,
  PaperStatus,
  ReportCardOptions,
  ResultScope,
} from "@wellrun/shared";
import { authedFileUrl, request } from "./api";
import { readYearId } from "./school-context";

export type { AssessmentKind, ExamKind, ExamStatus, GradeBand, MarkAttendance, PaperStatus, ResultScope };

type Params = Record<string, string | undefined>;

function qs(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const out = search.toString();
  return out ? `?${out}` : "";
}

const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload) });

// Types ----------------------------------------------------------------------

export type ExamContext = {
  year: { id: string; name: string; startsOn: string; endsOn: string } | null;
  terms: { id: string; name: string; startsOn: string; endsOn: string; weight: number }[];
  gradingScales: { id: string; name: string; isDefault: boolean }[];
  subjects: { id: string; name: string; code: string }[];
  staff: { id: string; name: string }[];
  classes: { id: string; name: string; section: string; label: string; campusId: string | null; students: number; subjectIds: string[] }[];
};

export type PaperStatusCounts = Record<PaperStatus, number>;

export type ExamListRow = {
  id: string;
  name: string;
  code: string;
  kind: ExamKind;
  status: ExamStatus;
  startsOn: string;
  endsOn: string;
  weight: number;
  publishedAt: string | null;
  term: { id: string; name: string } | null;
  classCount: number;
  classes: string[];
  paperCount: number;
  paperStatus: PaperStatusCounts;
  singlePaper: { id: string; subject: string; className: string; maxMarks: number; canMark: boolean } | null;
};

export type ExamPaperRow = {
  id: string;
  classId: string;
  className: string;
  grade: string;
  subjectId: string;
  subjectName: string;
  date: string | null;
  startTime: string;
  endTime: string;
  room: string;
  invigilatorId: string | null;
  invigilatorName: string;
  maxMarks: number;
  passMarks: number;
  status: PaperStatus;
  reviewNote: string;
  marksEntered: number;
  students: number;
  canMark: boolean;
};

export type ExamDetail = {
  id: string;
  name: string;
  code: string;
  kind: ExamKind;
  status: ExamStatus;
  startsOn: string;
  endsOn: string;
  weight: number;
  includeInReportCard: boolean;
  instructions: string;
  publishedAt: string | null;
  yearId: string;
  term: { id: string; name: string } | null;
  gradingScale: { id: string; name: string } | null;
  papers: ExamPaperRow[];
  clashes: { paperIds: [string, string]; message: string }[];
};

export type ExamDashboard = {
  examCount: number;
  upcoming: { id: string; date: string; startTime: string; className: string; subject: string; exam: { id: string; name: string; kind: ExamKind } }[];
  papers: { notStarted: number; draft: number; submitted: number; returned: number; approved: number };
  pendingCorrections: number;
  myPapers: { toMark: number } | null;
  activeExams: { id: string; name: string; status: ExamStatus; startsOn: string; endsOn: string; total: number; approved: number; submitted: number }[];
  published: { id: string; name: string; kind: ExamKind; publishedAt: string }[];
};

export type CalendarPaper = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  room: string;
  status: PaperStatus;
  className: string;
  subject: string;
  examId: string;
  examName: string;
  kind: ExamKind;
};

export type MarkingPaper = {
  id: string;
  examId: string;
  examName: string;
  kind: ExamKind;
  className: string;
  classId: string;
  subject: string;
  date: string | null;
  maxMarks: number;
  passMarks: number;
  status: PaperStatus;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string;
  entered: number;
  students: number;
  stats: { count: number; avg: number | null; high: number | null; low: number | null; median: number | null; fails: number; absent: number };
};

export type MarksSheetRow = {
  id: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  photo: string | null;
  enrolled: boolean;
  marks: number | null;
  attendance: MarkAttendance;
  remark: string;
  saved: boolean;
  correctionPending: boolean;
};

export type MarksSheet = {
  paper: {
    id: string;
    examId: string;
    examName: string;
    kind: ExamKind;
    className: string;
    subject: string;
    date: string | null;
    maxMarks: number;
    passMarks: number;
    status: PaperStatus;
    reviewNote: string;
    submittedAt: string | null;
    reviewedAt: string | null;
  };
  bands: GradeBand[];
  permissions: { canEdit: boolean; canSubmit: boolean; canReview: boolean; canRequestCorrection: boolean; canReopen: boolean };
  rows: MarksSheetRow[];
};

export type Correction = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
  reviewNote: string;
  createdAt: string;
  reviewedAt: string | null;
  requestedBy: string;
  oldMarks: number | null;
  newMarks: number | null;
  oldAttendance: MarkAttendance;
  newAttendance: MarkAttendance;
  student: { id: string; name: string; admissionNo: string };
  paper: { id: string; maxMarks: number; className: string; subject: string; examId: string; examName: string };
};

export type SubjectLine = {
  subjectId: string;
  name: string;
  obtained: number | null;
  max: number;
  pct: number | null;
  passPct: number;
  grade: string;
  passed: boolean;
  attendance: MarkAttendance | "MIXED";
  grace?: number;
  parts?: { label: string; pct: number | null; weight: number }[];
};

export type ClassResults = {
  class: { id: string; label: string };
  scope: ResultScope;
  scopeKey: string;
  pendingPapers: number;
  showRank: boolean;
  published: boolean;
  computedAt: string | null;
  subjects: { id: string; name: string }[];
  summary: { count: number; avg: number | null; high: number | null; low: number | null; median: number | null; passed: number; failed: number; passPct: number | null; grades: Record<string, number> };
  rows: {
    id: string;
    studentId: string;
    name: string;
    admissionNo: string;
    rollNo: string;
    totalObtained: number;
    totalMax: number;
    percentage: number;
    grade: string;
    gpa: number | null;
    rank: number | null;
    passed: boolean;
    failedSubjects: number;
    attendancePct: number | null;
    teacherRemark: string;
    principalRemark: string;
    published: boolean;
    subjects: SubjectLine[];
  }[];
};

export type StudentResults = {
  student: { id: string; name: string; admissionNo: string };
  years: { id: string; name: string }[];
  yearId: string | null;
  className: string;
  rollNo: string;
  results: {
    id: string;
    scope: ResultScope;
    scopeKey: string;
    label: string;
    date: string | null;
    kind: ExamKind | null;
    className: string;
    percentage: number;
    totalObtained: number;
    totalMax: number;
    grade: string;
    gpa: number | null;
    rank: number | null;
    passed: boolean;
    failedSubjects: number;
    subjects: SubjectLine[];
    attendancePct: number | null;
    teacherRemark: string;
    principalRemark: string;
    published: boolean;
  }[];
  marks: {
    paperId: string;
    examId: string;
    examName: string;
    kind: ExamKind;
    date: string;
    subject: string;
    marks: number | null;
    maxMarks: number;
    passMarks: number;
    pct: number | null;
    attendance: MarkAttendance;
    remark: string;
    approved: boolean;
  }[];
};

export type ResultScopeOption = { scope: ResultScope; scopeId: string; label: string };

export type ClassPerformance = {
  overall: { students: number; count: number; avg: number | null; high: number | null; low: number | null; median: number | null; passPct: number | null };
  gradeLabels: string[];
  classes: {
    classId: string;
    label: string;
    grade: string;
    students: number;
    avg: number | null;
    high: number | null;
    low: number | null;
    median: number | null;
    passPct: number;
    failed: number;
    grades: Record<string, number>;
    topper: { studentId: string; name: string; percentage: number } | null;
  }[];
};

export type SubjectPerformance = {
  subjects: { subjectId: string; name: string; avg: number | null; high: number | null; low: number | null; median: number | null; count: number; passPct: number; failed: number }[];
  matrix: { classId: string; label: string; cells: Record<string, { avg: number | null; teacher: string }> }[];
};

export type AtRiskStudent = {
  studentId: string;
  name: string;
  admissionNo: string;
  className: string;
  latestExam: string;
  percentage: number;
  previous: number | null;
  grade: string;
  reasons: string[];
  weakSubjects: string[];
};

export type StudentTrend = {
  trend: { examId: string; exam: string; date: string; percentage: number; grade: string; rank: number | null; passed: boolean }[];
  subjects: { subjectId: string; name: string; points: (number | null)[] }[];
};

export type ExamRules = {
  overallPassPct: number;
  subjectPassRequired: boolean;
  maxFailSubjects: number;
  graceMarks: number;
  decimals: number;
  absentCountsAsZero: boolean;
  assessmentWeight: number;
  rankMethod: "DENSE" | "STANDARD" | "NONE";
  rankScope: "SECTION" | "GRADE";
  rankOnlyPassed: boolean;
  showRank: boolean;
  atRiskPct: number;
};

export type Term = { id: string; name: string; startsOn: string; endsOn: string; weight: number; sortOrder: number; _count: { exams: number } };
export type GradingScale = { id: string; name: string; isDefault: boolean; bands: GradeBand[] };
export type ReportTemplate = { id: string; name: string; layout: "CLASSIC" | "MODERN" | "COMPACT"; isDefault: boolean; options: ReportCardOptions };

// Query keys (scoped to the selected academic year) ------------------------------

const y = () => readYearId();

export const examKeys = {
  root: ["exams"] as const,
  dashboard: () => ["exams", y(), "dashboard"] as const,
  context: () => ["exams", y(), "context"] as const,
  list: (query: Params) => ["exams", y(), "list", query] as const,
  detail: (id: string) => ["exams", "detail", id] as const,
  calendar: (query: Params) => ["exams", y(), "calendar", query] as const,
  papers: (query: Params) => ["exams", y(), "papers", query] as const,
  sheet: (paperId: string) => ["exams", "sheet", paperId] as const,
  corrections: (status?: string) => ["exams", y(), "corrections", status ?? ""] as const,
  classResults: (query: Params) => ["exams", y(), "class-results", query] as const,
  studentResults: (studentId: string, yearId?: string) => ["exams", "student-results", studentId, yearId ?? y()] as const,
  scopes: () => ["exams", y(), "scopes"] as const,
  analytics: (kind: string, query: Params) => ["exams", y(), "analytics", kind, query] as const,
  rules: ["exams", "settings", "rules"] as const,
  terms: () => ["exams", y(), "settings", "terms"] as const,
  scales: ["exams", "settings", "scales"] as const,
  templates: ["exams", "settings", "templates"] as const,
};

// API ------------------------------------------------------------------------

export const examsApi = {
  dashboard: () => request<ExamDashboard>("/console/exams/dashboard"),
  context: () => request<ExamContext>("/console/exams/context"),
  list: (query: Params) => request<ExamListRow[]>(`/console/exams${qs(query)}`),
  detail: (id: string) => request<ExamDetail>(`/console/exams/${id}`),
  create: (payload: unknown) => request<{ id: string; name: string }>("/console/exams", json("POST", payload)),
  quickAssessment: (payload: unknown) => request<{ id: string; name: string; paperId: string }>("/console/exams/assessments", json("POST", payload)),
  update: (id: string, payload: unknown) => request(`/console/exams/${id}`, json("PATCH", payload)),
  remove: (id: string) => request(`/console/exams/${id}`, { method: "DELETE" }),
  duplicate: (id: string, payload: unknown) => request<{ id: string; name: string }>(`/console/exams/${id}/duplicate`, json("POST", payload)),
  addPapers: (id: string, payload: unknown) => request<{ added: number }>(`/console/exams/${id}/papers`, json("POST", payload)),
  schedule: (id: string, payload: unknown) => request<{ scheduled: number; endsOn: string }>(`/console/exams/${id}/schedule`, json("POST", payload)),
  updatePaper: (paperId: string, payload: unknown) => request(`/console/exams/papers/${paperId}`, json("PATCH", payload)),
  removePaper: (paperId: string) => request(`/console/exams/papers/${paperId}`, { method: "DELETE" }),
  calendar: (query: Params) => request<CalendarPaper[]>(`/console/exams/calendar${qs(query)}`),

  papers: (query: Params) => request<MarkingPaper[]>(`/console/exam-marks/papers${qs(query)}`),
  sheet: (paperId: string) => request<MarksSheet>(`/console/exam-marks/papers/${paperId}`),
  saveMarks: (paperId: string, payload: unknown) => request<{ saved: number; status: PaperStatus }>(`/console/exam-marks/papers/${paperId}`, json("PUT", payload)),
  review: (payload: { paperIds: string[]; action: "APPROVE" | "RETURN"; note?: string }) =>
    request<{ updated: number; skipped: number }>("/console/exam-marks/review", json("POST", payload)),
  reopen: (paperId: string, reason: string) => request(`/console/exam-marks/papers/${paperId}/reopen`, json("POST", { reason })),
  corrections: (status?: string) => request<Correction[]>(`/console/exam-marks/corrections${qs({ status })}`),
  requestCorrection: (payload: unknown) => request("/console/exam-marks/corrections", json("POST", payload)),
  reviewCorrection: (id: string, payload: { action: "APPROVE" | "REJECT"; note?: string }) =>
    request(`/console/exam-marks/corrections/${id}/review`, json("POST", payload)),

  classResults: (query: Params) => request<ClassResults>(`/console/exam-results/class${qs(query)}`),
  studentResults: (studentId: string, yearId?: string) => request<StudentResults>(`/console/exam-results/students/${studentId}${qs({ yearId })}`),
  compute: (payload: { scope: ResultScope; scopeId?: string; classIds?: string[] }) =>
    request<{ students: number; classes: number }>("/console/exam-results/compute", json("POST", payload)),
  publish: (payload: { scope: ResultScope; scopeId?: string; classIds?: string[]; publish: boolean }) =>
    request<{ updated: number }>("/console/exam-results/publish", json("POST", payload)),
  saveRemarks: (rows: { resultId: string; teacherRemark?: string; principalRemark?: string }[]) =>
    request<{ saved: number }>("/console/exam-results/remarks", json("PATCH", { rows })),
  reportCardUrl: (query: Params) => authedFileUrl(`/console/exam-results/report-cards${qs(query)}`, "Could not create report cards"),

  scopes: () => request<ResultScopeOption[]>("/console/exam-analytics/scopes"),
  classPerformance: (query: Params) => request<ClassPerformance>(`/console/exam-analytics/classes${qs(query)}`),
  subjectPerformance: (query: Params) => request<SubjectPerformance>(`/console/exam-analytics/subjects${qs(query)}`),
  atRisk: (query: Params) => request<{ threshold: number; atRisk: AtRiskStudent[] }>(`/console/exam-analytics/students${qs(query)}`),
  studentTrend: (studentId: string) => request<StudentTrend>(`/console/exam-analytics/students${qs({ studentId })}`),

  rules: () => request<ExamRules>("/console/exam-settings/rules"),
  saveRules: (payload: ExamRules) => request<ExamRules>("/console/exam-settings/rules", json("PATCH", payload)),
  terms: () => request<Term[]>("/console/exam-settings/terms"),
  saveTerm: (id: string | null, payload: unknown) =>
    request(id ? `/console/exam-settings/terms/${id}` : "/console/exam-settings/terms", json(id ? "PATCH" : "POST", payload)),
  deleteTerm: (id: string) => request(`/console/exam-settings/terms/${id}`, { method: "DELETE" }),
  scales: () => request<GradingScale[]>("/console/exam-settings/grading-scales"),
  saveScale: (id: string | null, payload: unknown) =>
    request(id ? `/console/exam-settings/grading-scales/${id}` : "/console/exam-settings/grading-scales", json(id ? "PATCH" : "POST", payload)),
  deleteScale: (id: string) => request(`/console/exam-settings/grading-scales/${id}`, { method: "DELETE" }),
  templates: () => request<ReportTemplate[]>("/console/exam-settings/report-templates"),
  saveTemplate: (id: string | null, payload: unknown) =>
    request(id ? `/console/exam-settings/report-templates/${id}` : "/console/exam-settings/report-templates", json(id ? "PATCH" : "POST", payload)),
  deleteTemplate: (id: string) => request(`/console/exam-settings/report-templates/${id}`, { method: "DELETE" }),
};
