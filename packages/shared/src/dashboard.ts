/** Everything the school admin dashboard renders, in one slim payload. */
export type DashboardAttentionTone = "critical" | "warning" | "info";

export type DashboardAttention = {
  key: string;
  tone: DashboardAttentionTone;
  title: string;
  detail: string;
  href: string;
};

export type DashboardActivityType = "payment" | "admission" | "student" | "exam" | "staff";

export type DashboardActivity = {
  id: string;
  type: DashboardActivityType;
  title: string;
  detail: string;
  at: string;
  href: string;
};

export type SchoolDashboard = {
  schoolName: string;
  /** School-local calendar date (YYYY-MM-DD) the figures are for. */
  date: string;
  /** False on closed weekdays and holidays, so "not marked" is not a problem. */
  working: boolean;
  holiday: string | null;
  students: { total: number; newThisMonth: number };
  staff: { active: number; onLeave: number };
  attendance: {
    marked: number;
    present: number;
    absent: number;
    late: number;
    leave: number;
    pct: number | null;
    classes: number;
    classesMarked: number;
    unmarkedClasses: { id: string; label: string; students: number }[];
    trend: { date: string; pct: number | null }[];
    thresholdPct: number;
  };
  fees: {
    todayPkr: number;
    monthPkr: number;
    previousMonthPkr: number;
    outstandingPkr: number;
    overduePkr: number;
    overdueInvoices: number;
    unpaidInvoices: number;
    /** Oldest first, ending with the current month. */
    monthly: { month: string; pkr: number }[];
  };
  admissions: {
    open: number;
    needsReview: number;
    awaitingAssessment: number;
    awaitingConfirmation: number;
    confirmedThisMonth: number;
  };
  exams: {
    activeExams: number;
    papersToVerify: number;
    pendingCorrections: number;
    upcoming: { id: string; date: string; startTime: string; className: string; subject: string; exam: string }[];
  };
  payroll: {
    period: string;
    activeStaff: number;
    generated: number;
    drafts: number;
    paid: number;
  };
  attention: DashboardAttention[];
  activity: DashboardActivity[];
};
