import { describe, expect, it } from "vitest";
import { dashboardAttention } from "./attention";

const quiet = {
  date: "2026-09-10",
  dayInfo: { working: true },
  attendance: { marked: 40, present: 38, absent: 2, late: 0, leave: 0, pct: 95, classes: 4, classesMarked: 4, unmarkedClasses: [], trend: [], thresholdPct: 75 },
  fees: { todayPkr: 0, monthPkr: 0, previousMonthPkr: 0, outstandingPkr: 0, overduePkr: 0, overdueInvoices: 0, unpaidInvoices: 0, monthly: [] },
  admissions: { open: 0, needsReview: 0, awaitingAssessment: 0, awaitingConfirmation: 0, confirmedThisMonth: 0 },
  exams: { activeExams: 0, papersToVerify: 0, pendingCorrections: 0, upcoming: [] },
  payroll: { period: "2026-09", activeStaff: 5, generated: 5, drafts: 0, paid: 5 },
};

describe("dashboardAttention", () => {
  it("is empty when nothing is waiting", () => {
    expect(dashboardAttention(quiet)).toEqual([]);
  });

  it("puts overdue money first and pluralises", () => {
    const items = dashboardAttention({
      ...quiet,
      fees: { ...quiet.fees, overduePkr: 125000, overdueInvoices: 1 },
      admissions: { ...quiet.admissions, needsReview: 3 },
    });
    expect(items.map((i) => i.key)).toEqual(["overdue", "admissions"]);
    expect(items[0]).toMatchObject({ tone: "critical", detail: "1 invoice past the due date" });
    expect(items[1]!.title).toBe("3 applications to review");
  });

  it("does not nag about unmarked registers on a closed day", () => {
    const attendance = { ...quiet.attendance, classesMarked: 1, marked: 0, pct: null };
    expect(dashboardAttention({ ...quiet, attendance }).map((i) => i.key)).toEqual(["unmarked"]);
    expect(dashboardAttention({ ...quiet, attendance, dayInfo: { working: false } })).toEqual([]);
  });

  it("flags attendance under the threshold", () => {
    const items = dashboardAttention({ ...quiet, attendance: { ...quiet.attendance, pct: 60 } });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ key: "low-attendance", detail: "Below your 75% threshold" });
  });

  it("reminds about payroll late in the month only when nothing is generated", () => {
    const none = { ...quiet.payroll, generated: 0, paid: 0 };
    expect(dashboardAttention({ ...quiet, payroll: none })).toEqual([]);
    expect(dashboardAttention({ ...quiet, date: "2026-09-27", payroll: none }).map((i) => i.key)).toEqual(["payroll-missing"]);
    expect(dashboardAttention({ ...quiet, payroll: { ...quiet.payroll, drafts: 2, paid: 3 } }).map((i) => i.key)).toEqual(["payroll-drafts"]);
  });
});
