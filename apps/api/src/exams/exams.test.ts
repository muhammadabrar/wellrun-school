import { DEFAULT_GRADE_BANDS, gradingScaleSchema, marksReviewSchema } from "@wellrun/shared";
import { describe, expect, it } from "vitest";
import { canMarkPaper, pairKey } from "./access";
import { bandFor, combineSubject, combineTerms, normalizeBands, outcome, paperLine, rankRows, weightedPct } from "./results.engine";
import { autoSchedule, examDays, findClashes, slotTimes } from "./schedule.engine";

const bands = normalizeBands(DEFAULT_GRADE_BANDS);
const rules = {
  overallPassPct: 33,
  subjectPassRequired: true,
  maxFailSubjects: 0,
  graceMarks: 0,
  decimals: 1,
  absentCountsAsZero: true,
  assessmentWeight: 0,
  rankMethod: "DENSE",
  rankOnlyPassed: false,
};
const line = (marks: number | null, attendance: "PRESENT" | "ABSENT" | "MEDICAL" | "EXEMPT" = "PRESENT", r = rules) =>
  paperLine({ subjectId: "s", name: "Maths", marks, attendance, maxMarks: 100, passMarks: 33 }, r, bands);

describe("grading", () => {
  it("maps percentages to bands", () => {
    expect(bandFor(95, bands)?.grade).toBe("A+");
    expect(bandFor(90, bands)?.grade).toBe("A+");
    expect(bandFor(89.9, bands)?.grade).toBe("A");
    expect(bandFor(10, bands)?.grade).toBe("F");
  });

  it("rejects scales without a 0% floor or with duplicate starts", () => {
    expect(() => gradingScaleSchema.parse({ name: "x", bands: [{ grade: "A", minPct: 50 }, { grade: "B", minPct: 40 }] })).toThrow();
    expect(() => gradingScaleSchema.parse({ name: "x", bands: [{ grade: "A", minPct: 0 }, { grade: "B", minPct: 0 }] })).toThrow();
    const ok = gradingScaleSchema.parse({ name: "x", bands: [{ grade: "F", minPct: 0 }, { grade: "A", minPct: 50 }] });
    expect(ok.bands[0].grade).toBe("A");
  });
});

describe("paperLine", () => {
  it("scores present students", () => {
    expect(line(72)).toMatchObject({ obtained: 72, pct: 72, grade: "B", passed: true });
    expect(line(20)).toMatchObject({ passed: false, grade: "F" });
  });

  it("counts absent as zero only when the school says so", () => {
    expect(line(null, "ABSENT")).toMatchObject({ obtained: 0, max: 100, passed: false });
    expect(line(null, "ABSENT", { ...rules, absentCountsAsZero: false })).toMatchObject({ pct: null, max: 0, passed: true });
  });

  it("drops exempt and medical papers from totals", () => {
    expect(line(null, "EXEMPT")).toMatchObject({ pct: null, max: 0 });
    expect(line(50, "MEDICAL")).toMatchObject({ pct: null, max: 0 });
  });

  it("applies grace marks up to the pass line", () => {
    const graced = line(30, "PRESENT", { ...rules, graceMarks: 3 });
    expect(graced).toMatchObject({ obtained: 33, passed: true, grace: 3 });
    expect(line(29, "PRESENT", { ...rules, graceMarks: 3 }).passed).toBe(false);
  });
});

describe("outcome", () => {
  it("fails the student when a required subject fails", () => {
    const result = outcome([line(90), line(20)], rules, bands);
    expect(result).toMatchObject({ totalObtained: 110, totalMax: 200, percentage: 55, failedSubjects: 1, passed: false });
    expect(outcome([line(90), line(20)], { ...rules, maxFailSubjects: 1 }, bands).passed).toBe(true);
    expect(outcome([line(90), line(20)], { ...rules, subjectPassRequired: false }, bands).passed).toBe(true);
  });

  it("has no grade when nothing was counted", () => {
    expect(outcome([line(null, "EXEMPT")], rules, bands)).toMatchObject({ grade: "", passed: false, totalMax: 0 });
  });
});

describe("weighted aggregation", () => {
  it("re-normalises weights over available values", () => {
    expect(weightedPct([{ pct: 80, weight: 40 }, { pct: 60, weight: 60 }])).toBe(68);
    expect(weightedPct([{ pct: 80, weight: 40 }, { pct: null, weight: 60 }])).toBe(80);
    expect(weightedPct([{ pct: null, weight: 40 }])).toBeNull();
  });

  it("mixes exams and assessments by the assessment weight", () => {
    const lines = [
      { label: "Mid", kind: "EXAM" as const, weight: 40, pct: 60, passPct: 33 },
      { label: "Final", kind: "EXAM" as const, weight: 60, pct: 80, passPct: 33 },
      { label: "Quiz", kind: "ASSESSMENT" as const, weight: 100, pct: 100, passPct: 40 },
    ];
    expect(combineSubject({ subjectId: "s", name: "Maths" }, lines, { ...rules, assessmentWeight: 20 }, bands).pct).toBe(77.6);
    // Assessments only count when the school gives them weight — otherwise exams carry 100%.
    expect(combineSubject({ subjectId: "s", name: "Maths" }, lines, { ...rules, assessmentWeight: 0 }, bands).pct).toBe(72);
    expect(combineSubject({ subjectId: "s", name: "Maths" }, lines.slice(2), { ...rules, assessmentWeight: 20 }, bands).pct).toBe(100);
  });

  it("builds the annual line from term weights", () => {
    const t1 = combineSubject({ subjectId: "s", name: "M" }, [{ label: "Mid", kind: "EXAM", weight: 100, pct: 50, passPct: 33 }], rules, bands);
    const t2 = combineSubject({ subjectId: "s", name: "M" }, [{ label: "Final", kind: "EXAM", weight: 100, pct: 100, passPct: 33 }], rules, bands);
    const annual = combineTerms({ subjectId: "s", name: "M" }, [{ label: "T1", weight: 40, line: t1 }, { label: "T2", weight: 60, line: t2 }], rules, bands);
    expect(annual).toMatchObject({ pct: 80, passed: true, grade: "A" });
    expect(annual.parts).toHaveLength(2);
  });
});

describe("ranking", () => {
  const rows = [
    { id: "a", percentage: 90, totalObtained: 450, passed: true },
    { id: "b", percentage: 90, totalObtained: 450, passed: true },
    { id: "c", percentage: 80, totalObtained: 400, passed: true },
    { id: "d", percentage: 20, totalObtained: 100, passed: false },
  ];

  it("dense ranks share and continue", () => {
    const ranks = rankRows(rows, "DENSE", false);
    expect([...ranks.values()]).toEqual([1, 1, 2, 3]);
  });

  it("standard ranks skip after ties", () => {
    const ranks = rankRows(rows, "STANDARD", false);
    expect(ranks.get("c")).toBe(3);
    expect(ranks.get("d")).toBe(4);
  });

  it("can leave failed students unranked", () => {
    expect(rankRows(rows, "DENSE", true).get("d")).toBeNull();
    expect(rankRows(rows, "NONE", false).get("a")).toBeNull();
  });

  it("breaks percentage ties by total obtained", () => {
    const ranks = rankRows([{ id: "x", percentage: 75, totalObtained: 300, passed: true }, { id: "y", percentage: 75, totalObtained: 450, passed: true }], "DENSE", false);
    expect(ranks.get("y")).toBe(1);
    expect(ranks.get("x")).toBe(2);
  });
});

describe("schedule", () => {
  it("skips weekends and holidays", () => {
    // 2026-10-02 is a Friday; skip Sunday (0) and a holiday on Monday.
    expect(examDays("2026-10-02", 3, [0], ["2026-10-05"])).toEqual(["2026-10-02", "2026-10-03", "2026-10-06"]);
  });

  it("puts every section of a grade on the same subject each day", () => {
    const papers = [
      { id: "5a-m", classId: "5a", grade: "Grade 5", subjectId: "m", subjectName: "Maths" },
      { id: "5b-m", classId: "5b", grade: "Grade 5", subjectId: "m", subjectName: "Maths" },
      { id: "5a-e", classId: "5a", grade: "Grade 5", subjectId: "e", subjectName: "English" },
      { id: "5b-e", classId: "5b", grade: "Grade 5", subjectId: "e", subjectName: "English" },
    ];
    const { slots, lastDay } = autoSchedule(papers, { startsOn: "2026-10-05", skipWeekdays: [0], holidays: [], papersPerDay: 1, startTime: "09:00", endTime: "12:00" });
    expect(slots.get("5a-e")?.date).toBe("2026-10-05");
    expect(slots.get("5b-e")?.date).toBe("2026-10-05");
    expect(slots.get("5a-m")?.date).toBe("2026-10-06");
    expect(lastDay).toBe("2026-10-06");
  });

  it("stacks papers in one day with a break between", () => {
    expect(slotTimes("09:00", "11:00", 1)).toEqual({ startTime: "11:30", endTime: "13:30" });
  });

  it("finds class and invigilator clashes", () => {
    const base = { className: "5A", subjectName: "Maths", date: "2026-10-05", startTime: "09:00", endTime: "11:00", invigilatorId: null };
    expect(findClashes([{ ...base, id: "1", classId: "a" }, { ...base, id: "2", classId: "a", subjectName: "English" }])).toHaveLength(1);
    expect(findClashes([{ ...base, id: "1", classId: "a" }, { ...base, id: "2", classId: "a", startTime: "11:00", endTime: "12:00" }])).toHaveLength(0);
    expect(findClashes([{ ...base, id: "1", classId: "a", invigilatorId: "t" }, { ...base, id: "2", classId: "b", invigilatorId: "t" }])).toHaveLength(1);
  });
});

describe("access", () => {
  const scope = { staffId: "t", classIds: new Set(["5a", "6a"]), wholeClassIds: new Set(["6a"]), pairs: new Set([pairKey("5a", "eng")]) };

  it("lets admins mark anything and teachers only their subjects", () => {
    expect(canMarkPaper(null, { classId: "x", subjectId: "y" })).toBe(true);
    expect(canMarkPaper(scope, { classId: "5a", subjectId: "eng" })).toBe(true);
    expect(canMarkPaper(scope, { classId: "5a", subjectId: "math" })).toBe(false);
    expect(canMarkPaper(scope, { classId: "6a", subjectId: "math" })).toBe(true);
    expect(canMarkPaper(scope, { classId: "7a", subjectId: "eng" })).toBe(false);
  });

  it("requires a note when returning marks", () => {
    expect(() => marksReviewSchema.parse({ paperIds: ["p"], action: "RETURN" })).toThrow();
    expect(marksReviewSchema.parse({ paperIds: ["p"], action: "APPROVE" }).note).toBe("");
  });
});
