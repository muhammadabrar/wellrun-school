/** The reports hub: what exists, what a result looks like, and the ratios admins watch. Server and console share it. */

export type ReportGroup = "students" | "attendance" | "fees" | "exams" | "staff";

export const REPORT_GROUP_LABEL: Record<ReportGroup, string> = {
  students: "Students",
  attendance: "Attendance",
  fees: "Fees",
  exams: "Exams",
  staff: "Staff and payroll",
};

export type ReportFilterKey = "range" | "class" | "month" | "threshold" | "scope";

export type ReportRangeStart = "month" | "year" | "months6";

export type ReportDef = {
  id: string;
  group: ReportGroup;
  title: string;
  /** One plain sentence: the question this report answers. */
  description: string;
  filters: ReportFilterKey[];
  /** Where the date range starts when nobody picks one. Defaults to the first of this month. */
  range?: ReportRangeStart;
  /** When set, the report can be grouped; the first option is the default. */
  groupBy?: { value: string; label: string }[];
};

export const REPORTS: ReportDef[] = [
  { id: "students.strength", group: "students", title: "Strength by class", description: "How many boys and girls are in each class right now.", filters: [] },
  { id: "students.admissions", group: "students", title: "New admissions", description: "Students who joined in a period, with their class and guardian phone.", filters: ["range"], range: "year" },
  { id: "students.directory", group: "students", title: "Guardian directory", description: "Every student with their guardian's name, phone and CNIC, for calling or printing.", filters: ["class"] },
  { id: "attendance.classes", group: "attendance", title: "Attendance by class", description: "Which classes attend well and which do not, over a period.", filters: ["range"] },
  { id: "attendance.below", group: "attendance", title: "Students below the attendance line", description: "Students whose attendance is under the limit, lowest first.", filters: ["range", "class", "threshold"] },
  {
    id: "fees.collection",
    group: "fees",
    title: "Fee collection",
    description: "How much money came in, by day, month, payment method or class.",
    filters: ["range"],
    groupBy: [
      { value: "month", label: "By month" },
      { value: "day", label: "By day" },
      { value: "method", label: "By payment method" },
      { value: "class", label: "By class" },
    ],
  },
  { id: "fees.billing-heads", group: "fees", title: "Billed by fee head", description: "What was billed in a period, split by fee head (tuition, transport and so on).", filters: ["range"] },
  { id: "fees.aging", group: "fees", title: "Outstanding fees by age", description: "Unpaid fees grouped by how long they have been overdue.", filters: [] },
  { id: "fees.defaulters", group: "fees", title: "Defaulters", description: "Students with overdue fees, biggest balance first, with the guardian's phone.", filters: ["class"] },
  { id: "fees.discounts", group: "fees", title: "Discounts given", description: "Discounts against what was billed, month by month.", filters: ["range"], range: "months6" },
  { id: "fees.reversals", group: "fees", title: "Voided and refunded payments", description: "Payments that were reversed in a period, so nothing disappears quietly.", filters: ["range"] },
  { id: "exams.classes", group: "exams", title: "Class results", description: "Average, pass rate and topper for every class in an exam.", filters: ["scope"] },
  { id: "exams.subjects", group: "exams", title: "Subject results", description: "Which subjects are strongest and weakest across the school.", filters: ["scope"] },
  { id: "staff.attendance", group: "staff", title: "Staff attendance", description: "How often each staff member turned up, late or was absent, with approved leave shown separately.", filters: ["range"] },
  { id: "staff.payroll", group: "staff", title: "Payroll cost by month", description: "What the school paid or owes in salaries each month.", filters: ["range"], range: "months6" },
  { id: "staff.departments", group: "staff", title: "Payroll by department", description: "Salaries for one month, split by department.", filters: ["month"] },
];

export const reportById = (id: string) => REPORTS.find((report) => report.id === id);

/** The first day of a report's default range, so the page and the server start in the same place. */
export function defaultRangeStart(kind: ReportRangeStart | undefined, today: string) {
  if (kind === "year") return `${today.slice(0, 4)}-01-01`;
  if (kind === "months6") {
    const [year, month] = today.split("-").map(Number) as [number, number];
    const d = new Date(Date.UTC(year, month - 1 - 5, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
  }
  return `${today.slice(0, 7)}-01`;
}

export type ReportFormat = "text" | "int" | "decimal" | "pkr" | "pct" | "date";

export type ReportColumn = { key: string; label: string; format?: ReportFormat; align?: "start" | "end" };

export type ReportCell = string | number | null;
export type ReportRow = Record<string, ReportCell>;

export type ReportResult = {
  id: string;
  title: string;
  /** What the numbers cover, in words: the period, class or exam they were run for. */
  subtitle: string;
  columns: ReportColumn[];
  rows: ReportRow[];
  /** A summary row shown under the table and included in exports. */
  totals: ReportRow | null;
  /** Draws a bar for each row from one column. */
  chart: { labelKey: string; valueKey: string; format: ReportFormat } | null;
  total: number;
  page: number;
  pageSize: number;
  /** True when more rows matched than the safety limit, so exports are cut short. */
  truncated: boolean;
  generatedAt: string;
};

export const HUB_REPORT_PAGE_SIZE = 50;
export const HUB_EXPORT_ROW_LIMIT = 20_000;

export type ReportParams = {
  from?: string;
  to?: string;
  classId?: string;
  month?: string;
  groupBy?: string;
  threshold?: string;
  scope?: string;
  scopeId?: string;
  page?: string;
  pageSize?: string;
  export?: string;
};

export type ReportScopeOption = { scope: "EXAM" | "TERM" | "ANNUAL"; scopeId: string; label: string };

// Ratios --------------------------------------------------------------------------------------------------------

export type RatioKey =
  | "studentTeacher"
  | "studentStaff"
  | "classSize"
  | "collection"
  | "defaulters"
  | "discount"
  | "attendance"
  | "staffAttendance"
  | "pass"
  | "girls";

export type RatioStatus = "good" | "watch" | "bad" | "na";

export type RatioGroup = "Staffing" | "Fees" | "Learning" | "Students";

export type RatioDef = {
  key: RatioKey;
  group: RatioGroup;
  label: string;
  /** What this ratio tells a principal, in one sentence. */
  question: string;
  unit: "ratio" | "pct";
  numeratorLabel: string;
  denominatorLabel: string;
  /** Null when there is no right answer to judge against. */
  threshold: { good: number; watch: number; higherIsBetter: boolean } | null;
  targetText: string;
};

export const RATIO_DEFS: RatioDef[] = [
  { key: "studentTeacher", group: "Staffing", label: "Students per teacher", question: "Does each teacher have a workload that lets them know their students?", unit: "ratio", numeratorLabel: "Students", denominatorLabel: "Teachers", threshold: { good: 30, watch: 40, higherIsBetter: false }, targetText: "30 or fewer is good" },
  { key: "studentStaff", group: "Staffing", label: "Students per staff member", question: "How many students does each member of staff, teaching or not, support?", unit: "ratio", numeratorLabel: "Students", denominatorLabel: "Staff", threshold: { good: 20, watch: 30, higherIsBetter: false }, targetText: "20 or fewer is good" },
  { key: "classSize", group: "Staffing", label: "Students per class", question: "Are classes a manageable size?", unit: "ratio", numeratorLabel: "Students", denominatorLabel: "Classes", threshold: { good: 35, watch: 45, higherIsBetter: false }, targetText: "35 or fewer is good" },
  { key: "collection", group: "Fees", label: "Fee collection", question: "Of what was billed in this period, how much has been paid so far?", unit: "pct", numeratorLabel: "Collected (Rs.)", denominatorLabel: "Billed (Rs.)", threshold: { good: 85, watch: 70, higherIsBetter: true }, targetText: "85% or more is good" },
  { key: "defaulters", group: "Fees", label: "Students with overdue fees", question: "How many families are behind on fees?", unit: "pct", numeratorLabel: "Students overdue", denominatorLabel: "Students", threshold: { good: 10, watch: 20, higherIsBetter: false }, targetText: "10% or fewer is good" },
  { key: "discount", group: "Fees", label: "Discounts given", question: "How much of the billed fees was given away as discounts?", unit: "pct", numeratorLabel: "Discounts (Rs.)", denominatorLabel: "Fees before discount (Rs.)", threshold: { good: 10, watch: 20, higherIsBetter: false }, targetText: "10% or less is good" },
  { key: "attendance", group: "Learning", label: "Student attendance", question: "How often are students in school?", unit: "pct", numeratorLabel: "Days attended", denominatorLabel: "Days counted", threshold: { good: 90, watch: 80, higherIsBetter: true }, targetText: "90% or more is good" },
  { key: "staffAttendance", group: "Staffing", label: "Staff attendance", question: "How often are staff at work on school days? Approved leave is not counted against anyone.", unit: "pct", numeratorLabel: "Days present", denominatorLabel: "Days counted", threshold: { good: 95, watch: 90, higherIsBetter: true }, targetText: "95% or more is good" },
  { key: "pass", group: "Learning", label: "Pass rate", question: "How many students passed the latest exam results?", unit: "pct", numeratorLabel: "Passed", denominatorLabel: "Students with results", threshold: { good: 85, watch: 70, higherIsBetter: true }, targetText: "85% or more is good" },
  { key: "girls", group: "Students", label: "Girls among students", question: "What share of students are girls?", unit: "pct", numeratorLabel: "Girls", denominatorLabel: "Students", threshold: null, targetText: "No target: shown for information" },
];

export type RatioView = {
  key: RatioKey;
  group: RatioGroup;
  label: string;
  question: string;
  unit: "ratio" | "pct";
  value: number | null;
  display: string;
  numerator: { label: string; value: number | null };
  denominator: { label: string; value: number | null };
  status: RatioStatus;
  targetText: string;
  /** Oldest to newest; only some ratios have a history. */
  trend: { label: string; value: number | null }[];
  note: string;
};

export type RatioReport = {
  from: string;
  to: string;
  yearName: string;
  ratios: RatioView[];
  generatedAt: string;
};

// Pure helpers --------------------------------------------------------------------------------------------------

export function roundTo(value: number, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** a ÷ b, or null when b is zero or missing so a report never shows Infinity or NaN. */
export function safeDivide(numerator: number | null | undefined, denominator: number | null | undefined) {
  if (numerator == null || denominator == null || denominator === 0) return null;
  return numerator / denominator;
}

export function ratioStatus(def: Pick<RatioDef, "threshold">, value: number | null): RatioStatus {
  if (value == null) return "na";
  const t = def.threshold;
  if (!t) return "na";
  if (t.higherIsBetter) return value >= t.good ? "good" : value >= t.watch ? "watch" : "bad";
  return value <= t.good ? "good" : value <= t.watch ? "watch" : "bad";
}

export function formatRatio(def: Pick<RatioDef, "unit">, value: number | null) {
  if (value == null) return "—";
  return def.unit === "pct" ? `${roundTo(value, 1)}%` : `${roundTo(value, 1)} : 1`;
}

/** How overdue an unpaid fee is, in the buckets a bursar thinks in. */
export const AGING_BUCKETS = [
  { key: "current", label: "Not yet due" },
  { key: "d1_30", label: "1–30 days overdue" },
  { key: "d31_60", label: "31–60 days overdue" },
  { key: "d61_90", label: "61–90 days overdue" },
  { key: "d90", label: "Over 90 days overdue" },
] as const;

export type AgingBucketKey = (typeof AGING_BUCKETS)[number]["key"];

export function agingBucket(dueOn: string, today: string): AgingBucketKey {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000);
  if (days <= 0) return "current";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90";
}

export function daysOverdue(dueOn: string, today: string) {
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dueOn}T00:00:00Z`)) / 86_400_000));
}
