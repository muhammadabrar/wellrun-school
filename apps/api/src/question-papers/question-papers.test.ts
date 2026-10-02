import { paperMarks, questionPaperPrintSchema, questionPaperReviewSchema, questionsCreateSchema, sectionMarks, seededOrder, suggestedCopies, validatePaper, type PaperSection } from "@wellrun/shared";
import { describe, expect, it } from "vitest";

const mcq = (marks = 1, answer = "1", options: unknown = ["a", "b", "c", "d"]) => ({ text: "Q", marks, options, answer });
const section = (over: Partial<PaperSection>): PaperSection => ({ title: "Section A", type: "SHORT", attemptCount: null, questions: [{ text: "Q", marks: 5 }], ...over });

describe("marks", () => {
  it("adds every question when students answer all of them", () => {
    expect(sectionMarks({ attemptCount: null, questions: [{ marks: 3 }, { marks: 3 }, { marks: 2 }] })).toBe(8);
  });

  it("counts only the best-paying N when students attempt any N", () => {
    expect(sectionMarks({ attemptCount: 2, questions: [{ marks: 3 }, { marks: 5 }, { marks: 4 }] })).toBe(9);
    expect(paperMarks([{ attemptCount: 6, questions: Array.from({ length: 8 }, () => ({ marks: 3 })) }, { attemptCount: null, questions: [{ marks: 10 }] }])).toBe(28);
  });
});

describe("validatePaper", () => {
  const good = [
    section({ type: "MCQ", title: "MCQs", questions: Array.from({ length: 10 }, () => mcq()) }),
    section({ type: "SHORT", title: "Short", attemptCount: 6, questions: Array.from({ length: 8 }, () => ({ text: "Q", marks: 3 })) }),
    section({ type: "LONG", title: "Long", questions: [{ text: "Q", marks: 72 }] }),
  ];

  it("accepts a paper that adds up to the exam's marks", () => {
    expect(validatePaper(good, 100)).toEqual({ total: 100, issues: [] });
  });

  it("flags a total that doesn't match the exam", () => {
    const { total, issues } = validatePaper(good, 50);
    expect(total).toBe(100);
    expect(issues.map((i) => i.message)).toContain("The paper adds up to 100 marks but the exam is out of 50");
  });

  it("needs sections and questions", () => {
    expect(validatePaper([], 25).issues[0].message).toMatch(/at least one section/);
    expect(validatePaper([section({ questions: [] })], null).issues[0].message).toMatch(/no questions/);
  });

  it("needs MCQs to have options and a correct answer", () => {
    const messages = (q: ReturnType<typeof mcq>) => validatePaper([section({ type: "MCQ", questions: [q] })], null).issues.map((i) => i.message).join("|");
    expect(messages(mcq(1, "1", ["only one"]))).toMatch(/at least two options/);
    expect(messages(mcq(1, "", ["a", "b"]))).toMatch(/mark the correct option/);
    expect(messages(mcq(1, "5", ["a", "b"]))).toMatch(/mark the correct option/);
    expect(messages(mcq(1, "0", ["a", "b"]))).toBe("");
  });

  it("needs true/false answers, match pairs, comprehension passages and a sensible attempt count", () => {
    expect(validatePaper([section({ type: "TRUE_FALSE", questions: [{ text: "S", marks: 1, answer: "" }] })], null).issues[0].message).toMatch(/True or False/);
    expect(validatePaper([section({ type: "TRUE_FALSE", questions: [{ text: "S", marks: 1, answer: "TRUE" }] })], null).issues).toHaveLength(0);
    expect(validatePaper([section({ type: "MATCH", questions: [{ text: "Match", marks: 1, options: [{ left: "a", right: "" }] }] })], null).issues[0].message).toMatch(/two matching pairs/);
    expect(validatePaper([section({ type: "COMPREHENSION", passage: "  " })], null).issues[0].message).toMatch(/reading passage/);
    expect(validatePaper([section({ attemptCount: 5, questions: [{ text: "Q", marks: 2 }] })], null).issues[0].message).toMatch(/attempt 5 but only 1/);
  });
});

describe("printing helpers", () => {
  it("suggests the class size plus a few spares", () => {
    expect(suggestedCopies(11)).toBe(13);
    expect(suggestedCopies(30)).toBe(33);
    expect(suggestedCopies(0)).toBe(2);
  });

  it("shuffles column B the same way every time", () => {
    const a = seededOrder(6, "question-1");
    expect(seededOrder(6, "question-1")).toEqual(a);
    expect([...a].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(seededOrder(6, "question-2")).not.toEqual(seededOrder(6, "question-3"));
  });

  it("lets an admin print more copies than students, within a sane limit", () => {
    expect(questionPaperPrintSchema.parse({ copies: [{ classId: "c", copies: 16 }] }).answerKey).toBe(false);
    expect(() => questionPaperPrintSchema.parse({ copies: [{ classId: "c", copies: 0 }] })).toThrow();
    expect(() => questionPaperPrintSchema.parse({ copies: [{ classId: "c", copies: 5000 }] })).toThrow();
    expect(() => questionPaperPrintSchema.parse({ copies: [] })).toThrow();
  });
});

describe("schemas", () => {
  it("needs a note when returning a paper", () => {
    expect(() => questionPaperReviewSchema.parse({ action: "RETURN" })).toThrow();
    expect(questionPaperReviewSchema.parse({ action: "APPROVE" }).note).toBe("");
  });

  it("limits and validates pasted questions", () => {
    expect(() => questionsCreateSchema.parse({ questions: [] })).toThrow();
    expect(() => questionsCreateSchema.parse({ questions: [{ text: "Q", marks: 0 }] })).toThrow();
    expect(questionsCreateSchema.parse({ questions: [{ text: "Q", marks: 2 }] }).questions[0].options).toEqual([]);
  });
});
