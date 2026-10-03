import { BANK_TYPES, bankQuestionProblem, bankQuestionSchema, bankQuestionUpdateSchema, normalizeQuestionText, questionKey, saveToBankSchema, useFromBankSchema } from "@wellrun/shared";
import { describe, expect, it } from "vitest";

describe("normalizeQuestionText", () => {
  it("treats wording that differs only in case, spacing or punctuation as the same", () => {
    const forms = ["What is 2 + 2?", "what is 2+2", "  WHAT   IS 2 + 2 ?? ", "What is 2 + 2"];
    expect(new Set(forms.map(normalizeQuestionText)).size).toBe(1);
  });

  it("keeps words that matter apart", () => {
    expect(normalizeQuestionText("Capital of Pakistan")).not.toBe(normalizeQuestionText("Capital of India"));
  });

  it("works for Urdu text and ignores Urdu punctuation", () => {
    expect(normalizeQuestionText("پاکستان کا دارالحکومت کیا ہے؟")).toBe(normalizeQuestionText("پاکستان کا دارالحکومت کیا ہے"));
    expect(normalizeQuestionText("پاکستان کا دارالحکومت کیا ہے؟")).not.toBe("");
  });

  it("makes a fill-in-the-blank the same however long the blank is drawn", () => {
    expect(normalizeQuestionText("The capital of Pakistan is ____.")).toBe(normalizeQuestionText("The capital of Pakistan is ______"));
  });
});

describe("questionKey", () => {
  it("is the same for the same multiple choice question with options in a different order", () => {
    const a = questionKey("MCQ", "Largest planet?", ["Mars", "Jupiter", "Venus"]);
    const b = questionKey("MCQ", "largest planet", ["Venus", "Mars", "jupiter"]);
    expect(a).toBe(b);
  });

  it("tells apart the same stem with different options", () => {
    expect(questionKey("MCQ", "Largest planet?", ["Mars", "Jupiter"])).not.toBe(questionKey("MCQ", "Largest planet?", ["Mars", "Saturn"]));
  });

  it("tells apart the same words asked as different kinds of question", () => {
    expect(questionKey("SHORT", "Define a noun.", [])).not.toBe(questionKey("LONG", "Define a noun.", []));
  });

  it("uses both sides of a matching pair", () => {
    const a = questionKey("MATCH", "Match", [{ left: "Dog", right: "Bark" }, { left: "Cat", right: "Meow" }]);
    const b = questionKey("MATCH", "Match", [{ left: "Cat", right: "Meow" }, { left: "Dog", right: "Bark" }]);
    const c = questionKey("MATCH", "Match", [{ left: "Dog", right: "Meow" }, { left: "Cat", right: "Bark" }]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it("copes with a missing or odd options value", () => {
    expect(questionKey("SHORT", "Why?", undefined)).toBe("SHORT#why#");
    expect(questionKey("SHORT", "Why?", null)).toBe("SHORT#why#");
  });
});

describe("bankQuestionProblem", () => {
  it("accepts a complete multiple choice question", () => {
    expect(bankQuestionProblem("MCQ", { text: "Largest planet?", marks: 1, options: ["Mars", "Jupiter"], answer: "1" })).toBeNull();
  });

  it("asks for what a multiple choice question is missing", () => {
    expect(bankQuestionProblem("MCQ", { text: "  ", marks: 1, options: ["a", "b"], answer: "0" })).toBe("Write the question");
    expect(bankQuestionProblem("MCQ", { text: "Q", marks: 1, options: ["a", ""], answer: "0" })).toBe("Give at least two options");
    expect(bankQuestionProblem("MCQ", { text: "Q", marks: 1, options: ["a", "b"], answer: "" })).toBe("Mark the correct option");
    expect(bankQuestionProblem("MCQ", { text: "Q", marks: 1, options: ["a", "b", ""], answer: "2" })).toBe("Mark the correct option");
    expect(bankQuestionProblem("MCQ", { text: "Q", marks: 1, options: ["a", "b"], answer: "5" })).toBe("Mark the correct option");
  });

  it("needs True or False to be chosen for a true or false question", () => {
    expect(bankQuestionProblem("TRUE_FALSE", { text: "The sky is blue.", marks: 1, answer: "TRUE" })).toBeNull();
    expect(bankQuestionProblem("TRUE_FALSE", { text: "The sky is blue.", marks: 1, answer: "" })).toBe("Choose True or False as the answer");
  });

  it("needs two complete pairs for matching", () => {
    expect(bankQuestionProblem("MATCH", { text: "Match", marks: 2, options: [{ left: "a", right: "1" }, { left: "b", right: "2" }] })).toBeNull();
    expect(bankQuestionProblem("MATCH", { text: "Match", marks: 2, options: [{ left: "a", right: "1" }, { left: "b", right: "" }] })).toBe("Add at least two complete pairs");
  });

  it("needs only wording and marks for written questions, and marks above zero", () => {
    expect(bankQuestionProblem("SHORT", { text: "Define a noun.", marks: 2 })).toBeNull();
    expect(bankQuestionProblem("LONG", { text: "Describe your day.", marks: 0 })).toBe("Marks must be above zero");
  });
});

describe("bankQuestionSchema", () => {
  const base = { subjectId: "s1", gradeName: "Grade 5", type: "SHORT", text: " Define a noun. ", marks: 2 };

  it("trims the text and fills in the defaults", () => {
    const q = bankQuestionSchema.parse(base);
    expect(q.text).toBe("Define a noun.");
    expect(q.difficulty).toBe("MEDIUM");
    expect(q.tags).toEqual([]);
    expect(q.rtl).toBe(false);
  });

  it("lower-cases tags and drops repeats", () => {
    expect(bankQuestionSchema.parse({ ...base, tags: ["Grammar", "grammar ", "NOUNS"] }).tags).toEqual(["grammar", "nouns"]);
  });

  it("refuses comprehension questions, too many tags and unknown difficulty", () => {
    expect(bankQuestionSchema.safeParse({ ...base, type: "COMPREHENSION" }).success).toBe(false);
    expect(bankQuestionSchema.safeParse({ ...base, tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }).success).toBe(false);
    expect(bankQuestionSchema.safeParse({ ...base, difficulty: "IMPOSSIBLE" }).success).toBe(false);
  });

  it("lists every question type except comprehension", () => {
    expect(BANK_TYPES).not.toContain("COMPREHENSION");
    expect(BANK_TYPES).toContain("MCQ");
    expect(BANK_TYPES.length).toBe(9);
  });
});

describe("other schemas", () => {
  it("lets an update change some fields and leaves the rest alone", () => {
    expect(bankQuestionUpdateSchema.parse({ difficulty: "HARD" })).toEqual({ difficulty: "HARD" });
    expect(bankQuestionUpdateSchema.parse({ tags: ["a", "A"] })).toEqual({ tags: ["a"] });
  });

  it("saves a paper question with a default difficulty", () => {
    expect(saveToBankSchema.parse({ questionId: "q1" })).toMatchObject({ questionId: "q1", difficulty: "MEDIUM", tags: [] });
  });

  it("limits how many questions can be added from the bank at once", () => {
    expect(useFromBankSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(useFromBankSchema.safeParse({ ids: Array.from({ length: 41 }, (_, i) => `q${i}`) }).success).toBe(false);
    expect(useFromBankSchema.safeParse({ ids: ["a", "b"] }).success).toBe(true);
  });
});
