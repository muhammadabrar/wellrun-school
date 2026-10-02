import { paperCoverageSchema, syllabusTopicsCreateSchema, syllabusUnitSchema, topicProgressSchema } from "@wellrun/shared";
import { describe, expect, it } from "vitest";
import { canEditSyllabus, canViewGrade, gradeKey } from "./access";
import { coverageFrozen, lockMessage, mapTermByPosition, parseTopicList, shiftDate, syllabusStats, validOrder, yearShiftMs } from "./syllabus.rules";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const topic = (unitId: string, progress: "PLANNED" | "IN_PROGRESS" | "COMPLETED", extra: Partial<{ plannedPeriods: number; locked: boolean }> = {}) => ({
  unitId,
  progress,
  plannedPeriods: 2,
  locked: false,
  ...extra,
});

describe("syllabusStats", () => {
  const units = [
    { id: "u1", plannedTo: d("2026-06-30") },
    { id: "u2", plannedTo: d("2026-10-31") },
    { id: "u3", plannedTo: null },
  ];
  const today = d("2026-09-15");

  it("has no status for an empty syllabus", () => {
    expect(syllabusStats([], [], today)).toMatchObject({ status: "EMPTY", topics: 0, percent: 0 });
  });

  it("is behind when a past-due unit still has untaught topics", () => {
    const stats = syllabusStats(units, [topic("u1", "COMPLETED"), topic("u1", "IN_PROGRESS"), topic("u2", "PLANNED")], today);
    expect(stats).toMatchObject({ status: "BEHIND", behind: 1, completed: 1, inProgress: 1, percent: 33 });
  });

  it("is on track when nothing due is outstanding", () => {
    const stats = syllabusStats(units, [topic("u1", "COMPLETED"), topic("u2", "IN_PROGRESS"), topic("u3", "PLANNED")], today);
    expect(stats.status).toBe("ON_TRACK");
    expect(stats.behind).toBe(0);
  });

  it("is not started until something is taught, and complete when everything is", () => {
    expect(syllabusStats(units, [topic("u2", "PLANNED")], today).status).toBe("NOT_STARTED");
    expect(syllabusStats(units, [topic("u1", "COMPLETED"), topic("u2", "COMPLETED")], today).status).toBe("COMPLETE");
  });

  it("does not count a unit as due on its last day", () => {
    const stats = syllabusStats([{ id: "u", plannedTo: d("2026-09-15") }], [topic("u", "PLANNED")], today);
    expect(stats.behind).toBe(0);
  });

  it("counts locked topics and periods", () => {
    const stats = syllabusStats(units, [topic("u1", "COMPLETED", { locked: true }), topic("u2", "PLANNED", { plannedPeriods: 5 })], today);
    expect(stats).toMatchObject({ locked: 1, periods: 7, periodsTaught: 2 });
  });
});

describe("locking", () => {
  it("names the exams that lock a topic", () => {
    expect(lockMessage([{ examName: "Mid Term" }], "edited")).toContain("Mid Term");
    expect(lockMessage([{ examName: "Mid Term" }, { examName: "Mid Term" }])).not.toContain("and 1 more");
    expect(lockMessage([{ examName: "A" }, { examName: "B" }, { examName: "C" }, { examName: "D" }], "deleted")).toContain("A, B and 2 more");
  });

  it("freezes coverage once marks are in review or approved, or results are published", () => {
    expect(coverageFrozen("NOT_STARTED", "SCHEDULED")).toBe(false);
    expect(coverageFrozen("DRAFT", "MARKING")).toBe(false);
    expect(coverageFrozen("RETURNED", "MARKING")).toBe(false);
    expect(coverageFrozen("SUBMITTED", "MARKING")).toBe(true);
    expect(coverageFrozen("APPROVED", "COMPLETED")).toBe(true);
    expect(coverageFrozen("NOT_STARTED", "PUBLISHED")).toBe(true);
  });
});

describe("ordering", () => {
  it("accepts only a permutation of the existing ids", () => {
    expect(validOrder(["b", "a", "c"], ["a", "b", "c"])).toBe(true);
    expect(validOrder(["a", "b"], ["a", "b", "c"])).toBe(false);
    expect(validOrder(["a", "a", "b"], ["a", "b", "c"])).toBe(false);
    expect(validOrder(["a", "b", "x"], ["a", "b", "c"])).toBe(false);
  });
});

describe("carrying a syllabus into a new year", () => {
  it("moves planned dates by the gap between the years", () => {
    const shift = yearShiftMs(d("2026-04-01"), d("2027-04-01"));
    expect(shiftDate(d("2026-08-17"), shift)?.toISOString().slice(0, 10)).toBe("2027-08-17");
    expect(shiftDate(null, shift)).toBeNull();
  });

  it("maps a term to the one in the same position", () => {
    const oldTerms = [{ id: "o1" }, { id: "o2" }];
    const newTerms = [{ id: "n1" }, { id: "n2" }];
    expect(mapTermByPosition("o2", oldTerms, newTerms)).toBe("n2");
    expect(mapTermByPosition(null, oldTerms, newTerms)).toBeNull();
    expect(mapTermByPosition("o2", oldTerms, [{ id: "n1" }])).toBeNull();
    expect(mapTermByPosition("gone", oldTerms, newTerms)).toBeNull();
  });
});

describe("parseTopicList", () => {
  it("strips bullets and numbering and drops blanks and repeats", () => {
    expect(parseTopicList("1. Nouns\n- Verbs\n  • Adjectives \n\nnouns\n2) Tenses")).toEqual(["Nouns", "Verbs", "Adjectives", "Tenses"]);
  });
});

describe("syllabus access", () => {
  const scope = {
    viewGrades: new Set(["Grade 5", "Grade 6"]),
    wholeGrades: new Set(["Grade 6"]),
    pairs: new Set([gradeKey("Grade 5", "eng")]),
  };

  it("lets admins edit anything and teachers only their own subjects", () => {
    expect(canEditSyllabus(null, "Grade 9", "x")).toBe(true);
    expect(canEditSyllabus(scope, "Grade 5", "eng")).toBe(true);
    expect(canEditSyllabus(scope, "Grade 5", "math")).toBe(false);
    expect(canEditSyllabus(scope, "Grade 6", "math")).toBe(true);
    expect(canEditSyllabus(scope, "Grade 7", "eng")).toBe(false);
  });

  it("lets a teacher view every subject of their grades", () => {
    expect(canViewGrade(scope, "Grade 5")).toBe(true);
    expect(canViewGrade(scope, "Grade 7")).toBe(false);
    expect(canViewGrade(null, "Grade 7")).toBe(true);
  });
});

describe("syllabus schemas", () => {
  it("rejects a unit that ends before it starts", () => {
    expect(() => syllabusUnitSchema.parse({ title: "Unit 1", plannedFrom: "2026-09-10", plannedTo: "2026-09-01" })).toThrow();
    expect(syllabusUnitSchema.parse({ title: "Unit 1", plannedFrom: "2026-09-01", plannedTo: "2026-09-10" }).title).toBe("Unit 1");
    expect(() => syllabusUnitSchema.parse({ title: "  " })).toThrow();
  });

  it("limits how many topics can be pasted at once", () => {
    expect(() => syllabusTopicsCreateSchema.parse({ titles: [] })).toThrow();
    expect(() => syllabusTopicsCreateSchema.parse({ titles: Array.from({ length: 101 }, (_, i) => `T${i}`) })).toThrow();
    expect(syllabusTopicsCreateSchema.parse({ titles: ["Nouns", "Verbs"] }).titles).toHaveLength(2);
  });

  it("defaults coverage to one paper and validates progress", () => {
    expect(paperCoverageSchema.parse({ topicIds: ["a"] }).allSections).toBe(false);
    expect(() => topicProgressSchema.parse({ progress: "DONE" })).toThrow();
    expect(topicProgressSchema.parse({ progress: "COMPLETED" }).progress).toBe("COMPLETED");
  });
});
