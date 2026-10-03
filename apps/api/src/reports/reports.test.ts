import { AGING_BUCKETS, RATIO_DEFS, REPORTS, agingBucket, defaultRangeStart, attendancePct, daysOverdue, formatRatio, ratioStatus, reportById, safeDivide, type AttendanceCounts } from "@wellrun/shared";
import { describe, expect, it } from "vitest";
import { attendanceTally, buildRatios, type RatioInputs } from "./ratios";

const inputs = (over: Partial<RatioInputs> = {}): RatioInputs => ({
  students: 840,
  boys: 440,
  girls: 400,
  classes: 24,
  teachers: 20,
  staff: 30,
  billedPkr: 1_000_000,
  collectedPkr: 900_000,
  grossBilledPkr: 1_100_000,
  discountPkr: 100_000,
  overdueStudents: 63,
  attendedDays: 9_000,
  countedDays: 10_000,
  staffAttendedDays: 570,
  staffCountedDays: 600,
  incomePkr: 1_000_000,
  expensePkr: 850_000,
  salariesPkr: 600_000,
  passed: 700,
  resulted: 800,
  collectionTrend: [
    { label: "Aug", billedPkr: 100, collectedPkr: 80 },
    { label: "Sep", billedPkr: 0, collectedPkr: 0 },
  ],
  attendanceTrend: [{ label: "Aug", attendedDays: 90, countedDays: 100 }],
  ...over,
});

const byKey = (views: ReturnType<typeof buildRatios>, key: string) => views.find((v) => v.key === key)!;

describe("safeDivide", () => {
  it("never produces Infinity or NaN", () => {
    expect(safeDivide(10, 0)).toBeNull();
    expect(safeDivide(null, 5)).toBeNull();
    expect(safeDivide(5, undefined)).toBeNull();
    expect(safeDivide(0, 5)).toBe(0);
    expect(safeDivide(10, 4)).toBe(2.5);
  });
});

describe("buildRatios", () => {
  const views = buildRatios(inputs());

  it("shows the working behind each ratio so a principal can check it", () => {
    const st = byKey(views, "studentTeacher");
    expect(st.value).toBe(42);
    expect(st.display).toBe("42 : 1");
    expect(st.numerator).toEqual({ label: "Students", value: 840 });
    expect(st.denominator).toEqual({ label: "Teachers", value: 20 });
  });

  it("judges each ratio against its own target, in the right direction", () => {
    expect(byKey(views, "studentTeacher").status).toBe("bad"); // 42 : 1 is over 40
    expect(byKey(views, "studentStaff").status).toBe("watch"); // 28 : 1 is between 20 and 30
    expect(byKey(views, "classSize").status).toBe("good"); // 35 : 1 is on the line
    expect(byKey(views, "collection").status).toBe("good"); // 90% is above 85%
    expect(byKey(views, "defaulters").status).toBe("good"); // 7.5% is under 10%
    expect(byKey(views, "attendance").status).toBe("good"); // 90% is on the line
    expect(byKey(views, "pass").status).toBe("good"); // 87.5% is above 85%
    expect(byKey(views, "staffAttendance").status).toBe("good"); // 95% is on the line
    expect(byKey(views, "salaryIncome").status).toBe("good"); // 60% is on the line
    expect(byKey(views, "expenseIncome").status).toBe("good"); // 85% is on the line
    expect(byKey(views, "surplus").status).toBe("good"); // 15% is above 10%
  });

  it("gives percentages to one decimal place", () => {
    expect(byKey(views, "collection").display).toBe("90%");
    expect(byKey(views, "defaulters").display).toBe("7.5%");
    expect(byKey(views, "discount").display).toBe("9.1%");
    expect(byKey(views, "attendance").display).toBe("90%");
    expect(byKey(views, "pass").display).toBe("87.5%");
    expect(byKey(views, "staffAttendance").display).toBe("95%");
    expect(byKey(views, "salaryIncome").display).toBe("60%");
    expect(byKey(views, "expenseIncome").display).toBe("85%");
    expect(byKey(views, "surplus").display).toBe("15%");
    expect(byKey(views, "girls").display).toBe("47.6%");
  });

  it("has no judgement for the girls share", () => {
    expect(byKey(views, "girls").status).toBe("na");
  });

  it("turns each month's figures into a trend and leaves months with nothing billed empty", () => {
    expect(byKey(views, "collection").trend).toEqual([
      { label: "Aug", value: 80 },
      { label: "Sep", value: null },
    ]);
    expect(byKey(views, "attendance").trend).toEqual([{ label: "Aug", value: 90 }]);
  });

  it("returns a value of null, not a crash, for a brand-new school", () => {
    const empty = buildRatios(
      inputs({ students: 0, boys: 0, girls: 0, classes: 0, teachers: 0, staff: 0, billedPkr: 0, collectedPkr: 0, grossBilledPkr: 0, discountPkr: 0, overdueStudents: 0, attendedDays: 0, countedDays: 0, staffAttendedDays: 0, staffCountedDays: 0, incomePkr: 0, expensePkr: 0, salariesPkr: 0, passed: 0, resulted: 0, collectionTrend: [], attendanceTrend: [] }),
    );
    expect(empty).toHaveLength(RATIO_DEFS.length);
    for (const view of empty) {
      expect(view.value).toBeNull();
      expect(view.display).toBe("—");
      expect(view.status).toBe("na");
    }
  });

  it("covers every ratio definition exactly once", () => {
    expect(views.map((v) => v.key)).toEqual(RATIO_DEFS.map((d) => d.key));
  });
});

describe("finance ratios when the school spends more than it receives", () => {
  it("shows a loss as a negative surplus and flags it", () => {
    const views = buildRatios(inputs({ incomePkr: 500_000, expensePkr: 650_000, salariesPkr: 450_000 }));
    expect(byKey(views, "surplus").value).toBe(-30);
    expect(byKey(views, "surplus").display).toBe("-30%");
    expect(byKey(views, "surplus").status).toBe("bad");
    expect(byKey(views, "expenseIncome").value).toBe(130);
    expect(byKey(views, "expenseIncome").status).toBe("bad");
    expect(byKey(views, "salaryIncome").status).toBe("bad"); // 90% of income
  });

  it("has nothing to judge when no money was received", () => {
    const views = buildRatios(inputs({ incomePkr: 0, expensePkr: 1000, salariesPkr: 500 }));
    for (const key of ["salaryIncome", "expenseIncome", "surplus"]) expect(byKey(views, key).value).toBeNull();
  });
});

describe("ratioStatus", () => {
  const lowerIsBetter = { threshold: { good: 30, watch: 40, higherIsBetter: false } };
  const higherIsBetter = { threshold: { good: 85, watch: 70, higherIsBetter: true } };

  it("treats the edges as the better band", () => {
    expect(ratioStatus(lowerIsBetter, 30)).toBe("good");
    expect(ratioStatus(lowerIsBetter, 30.1)).toBe("watch");
    expect(ratioStatus(lowerIsBetter, 40)).toBe("watch");
    expect(ratioStatus(lowerIsBetter, 40.1)).toBe("bad");
    expect(ratioStatus(higherIsBetter, 85)).toBe("good");
    expect(ratioStatus(higherIsBetter, 84.9)).toBe("watch");
    expect(ratioStatus(higherIsBetter, 70)).toBe("watch");
    expect(ratioStatus(higherIsBetter, 69.9)).toBe("bad");
  });

  it("has nothing to say without a value or a target", () => {
    expect(ratioStatus(lowerIsBetter, null)).toBe("na");
    expect(ratioStatus({ threshold: null }, 50)).toBe("na");
  });
});

describe("formatRatio", () => {
  it("writes ratios as x : 1 and percentages with a sign", () => {
    expect(formatRatio({ unit: "ratio" }, 33.333)).toBe("33.3 : 1");
    expect(formatRatio({ unit: "pct" }, 33.333)).toBe("33.3%");
    expect(formatRatio({ unit: "pct" }, null)).toBe("—");
  });
});

describe("attendanceTally", () => {
  const counts = (over: Partial<AttendanceCounts>): AttendanceCounts => ({ PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, EXCUSED: 0, ...over });

  it("agrees with the attendance percentage the rest of the app shows", () => {
    const cases: [AttendanceCounts, { lateCountsPresent: boolean; leaveCountsPresent: boolean }][] = [
      [counts({ PRESENT: 80, ABSENT: 10, LATE: 5, LEAVE: 3, EXCUSED: 2 }), { lateCountsPresent: true, leaveCountsPresent: false }],
      [counts({ PRESENT: 80, ABSENT: 10, LATE: 5, LEAVE: 3, EXCUSED: 2 }), { lateCountsPresent: false, leaveCountsPresent: true }],
      [counts({ PRESENT: 80, ABSENT: 10, LATE: 5, LEAVE: 3, EXCUSED: 2 }), { lateCountsPresent: true, leaveCountsPresent: true }],
    ];
    for (const [c, rules] of cases) {
      const { attended, counted } = attendanceTally(c, rules);
      expect(Math.round((attended / counted) * 1000) / 10).toBe(attendancePct(c, rules));
    }
  });

  it("is zero when nothing was marked", () => {
    expect(attendanceTally(counts({}), { lateCountsPresent: true, leaveCountsPresent: false })).toEqual({ attended: 0, counted: 0 });
  });
});

describe("agingBucket", () => {
  const today = "2026-10-15";

  it("puts a fee in the bucket for how overdue it is", () => {
    expect(agingBucket("2026-10-20", today)).toBe("current");
    expect(agingBucket("2026-10-15", today)).toBe("current");
    expect(agingBucket("2026-10-14", today)).toBe("d1_30");
    expect(agingBucket("2026-09-15", today)).toBe("d1_30");
    expect(agingBucket("2026-09-14", today)).toBe("d31_60");
    expect(agingBucket("2026-08-16", today)).toBe("d31_60");
    expect(agingBucket("2026-08-15", today)).toBe("d61_90");
    expect(agingBucket("2026-07-17", today)).toBe("d61_90");
    expect(agingBucket("2026-07-16", today)).toBe("d90");
    expect(agingBucket("2025-01-01", today)).toBe("d90");
  });

  it("covers every bucket the report lists", () => {
    expect(AGING_BUCKETS.map((b) => b.key)).toEqual(["current", "d1_30", "d31_60", "d61_90", "d90"]);
  });

  it("counts overdue days and never goes negative", () => {
    expect(daysOverdue("2026-10-05", today)).toBe(10);
    expect(daysOverdue("2026-10-25", today)).toBe(0);
  });
});

describe("report catalog", () => {
  it("has unique ids and finds each by id", () => {
    const ids = REPORTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(reportById(id)?.id).toBe(id);
    expect(reportById("nope")).toBeUndefined();
  });

  it("describes every report in a sentence and puts it in a group", () => {
    for (const report of REPORTS) {
      expect(report.title.length).toBeGreaterThan(3);
      expect(report.description.endsWith(".")).toBe(true);
      expect(report.id.startsWith(`${report.group}.`)).toBe(true);
    }
  });

  it("gives every group-by report a default first", () => {
    for (const report of REPORTS.filter((r) => r.groupBy)) expect(report.groupBy!.length).toBeGreaterThan(1);
  });
});

describe("defaultRangeStart", () => {
  it("starts where each report's default says", () => {
    expect(defaultRangeStart(undefined, "2026-10-15")).toBe("2026-10-01");
    expect(defaultRangeStart("month", "2026-10-15")).toBe("2026-10-01");
    expect(defaultRangeStart("year", "2026-10-15")).toBe("2026-01-01");
    expect(defaultRangeStart("months6", "2026-10-15")).toBe("2026-05-01");
  });

  it("reaches back across a year end", () => {
    expect(defaultRangeStart("months6", "2027-02-10")).toBe("2026-09-01");
  });

  it("is declared on exactly the reports that need it", () => {
    expect(REPORTS.filter((r) => r.range).map((r) => r.id).sort()).toEqual(["fees.discounts", "finance.income-expense", "staff.payroll", "students.admissions"]);
  });
});
