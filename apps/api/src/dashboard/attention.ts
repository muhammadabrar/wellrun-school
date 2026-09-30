import type { DashboardAttention, SchoolDashboard } from "@wellrun/shared";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type AttentionInput = Pick<SchoolDashboard, "attendance" | "fees" | "admissions" | "exams" | "payroll"> & {
  date: string;
  dayInfo: { working: boolean };
};

/** What needs the admin's attention right now, most urgent first. */
export function dashboardAttention(s: AttentionInput): DashboardAttention[] {
  const items: DashboardAttention[] = [];
  if (s.fees.overdueInvoices > 0) {
    items.push({
      key: "overdue",
      tone: "critical",
      title: `Rs. ${s.fees.overduePkr.toLocaleString("en-PK")} overdue`,
      detail: `${plural(s.fees.overdueInvoices, "invoice")} past the due date`,
      href: "/fees/invoices?status=OVERDUE",
    });
  }
  const open = s.attendance.classes - s.attendance.classesMarked;
  if (s.dayInfo.working && open > 0) {
    items.push({
      key: "unmarked",
      tone: "warning",
      title: `${plural(open, "class", "classes")} not marked today`,
      detail: `${s.attendance.classesMarked} of ${s.attendance.classes} registers are done`,
      href: "/attendance",
    });
  }
  if (s.dayInfo.working && s.attendance.pct != null && s.attendance.pct < s.attendance.thresholdPct) {
    items.push({
      key: "low-attendance",
      tone: "warning",
      title: `Attendance is ${s.attendance.pct}% today`,
      detail: `Below your ${s.attendance.thresholdPct}% threshold`,
      href: "/attendance/absent",
    });
  }
  if (s.admissions.needsReview > 0) {
    items.push({
      key: "admissions",
      tone: "warning",
      title: `${plural(s.admissions.needsReview, "application")} to review`,
      detail: "Submitted and waiting for a decision",
      href: "/admissions",
    });
  }
  if (s.exams.papersToVerify > 0) {
    items.push({
      key: "verify",
      tone: "warning",
      title: `${plural(s.exams.papersToVerify, "paper")} to verify`,
      detail: "Marks submitted by teachers",
      href: "/exams/marks/pending",
    });
  }
  if (s.exams.pendingCorrections > 0) {
    items.push({
      key: "corrections",
      tone: "warning",
      title: `${plural(s.exams.pendingCorrections, "mark correction")} pending`,
      detail: "Waiting for your approval",
      href: "/exams/marks/corrections",
    });
  }
  const dayOfMonth = Number(s.date.slice(8, 10));
  if (s.payroll.drafts > 0) {
    items.push({
      key: "payroll-drafts",
      tone: "info",
      title: `${plural(s.payroll.drafts, "payslip")} still in draft`,
      detail: `Finalise ${s.payroll.period} payroll`,
      href: `/payroll?period=${s.payroll.period}`,
    });
  } else if (s.payroll.generated === 0 && s.payroll.activeStaff > 0 && dayOfMonth >= 25) {
    items.push({
      key: "payroll-missing",
      tone: "info",
      title: "This month's payroll isn't generated",
      detail: `${plural(s.payroll.activeStaff, "staff member")} to pay`,
      href: `/payroll?period=${s.payroll.period}`,
    });
  }
  return items;
}
