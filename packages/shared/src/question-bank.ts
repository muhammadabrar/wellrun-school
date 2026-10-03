import { z } from "zod";
import { QUESTION_TYPES, normalizeQuestion, questionInputSchema, type QuestionType } from "./question-papers";

/**
 * The question bank: questions kept for reuse, per grade and subject. A paper copies a question out of the bank,
 * so changing the bank later never changes a paper that has already been approved.
 */

/** Questions about a reading passage depend on the passage, so they can't stand alone in the bank. */
export const BANK_TYPES = QUESTION_TYPES.filter((t) => t !== "COMPREHENSION") as Exclude<QuestionType, "COMPREHENSION">[];

export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };

export const MAX_BANK_USE = 40;

const tags = z
  .array(z.string().trim().min(1).max(30))
  .max(8, "Use at most 8 tags")
  .default([])
  .transform((list) => [...new Set(list.map((t) => t.toLowerCase()))]);

export const bankQuestionSchema = questionInputSchema.extend({
  subjectId: z.string().min(1, "Choose a subject"),
  gradeName: z.string().trim().min(1, "Choose a grade"),
  type: z.enum(BANK_TYPES as [string, ...string[]]),
  difficulty: z.enum(DIFFICULTIES).default("MEDIUM"),
  tags,
  topicId: z.string().min(1).nullable().optional(),
  rtl: z.boolean().default(false),
});

/** The subject, grade and type of a bank question are fixed once saved: it would be a different question. */
export const bankQuestionUpdateSchema = questionInputSchema.partial().extend({
  difficulty: z.enum(DIFFICULTIES).optional(),
  tags: tags.optional(),
  topicId: z.string().min(1).nullable().optional(),
  rtl: z.boolean().optional(),
});

export const saveToBankSchema = z.object({
  questionId: z.string().min(1),
  difficulty: z.enum(DIFFICULTIES).default("MEDIUM"),
  tags,
  topicId: z.string().min(1).nullable().optional(),
});

export const useFromBankSchema = z.object({ ids: z.array(z.string().min(1)).min(1, "Pick at least one question").max(MAX_BANK_USE, `Add at most ${MAX_BANK_USE} at a time`) });

export type BankQuestionInput = z.input<typeof bankQuestionSchema>;
export type BankQuestionUpdate = z.input<typeof bankQuestionUpdateSchema>;
export type SaveToBankInput = z.input<typeof saveToBankSchema>;

/** Makes "What is 2 + 2?" and "what is 2+2" the same: lower case, no punctuation, one space between words. */
export function normalizeQuestionText(text: string) {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * What makes a question "the same question": its kind, its wording and its choices (in any order).
 * Two multiple choice questions with the same stem but different options are different questions.
 */
export function questionKey(type: QuestionType, text: string, options: unknown) {
  const choices = Array.isArray(options)
    ? options
        .map((o) => {
          if (typeof o === "string") return normalizeQuestionText(o);
          if (o && typeof o === "object") return `${normalizeQuestionText(String((o as { left?: unknown }).left ?? ""))}=${normalizeQuestionText(String((o as { right?: unknown }).right ?? ""))}`;
          return "";
        })
        .filter(Boolean)
        .sort()
        .join("|")
    : "";
  return `${type}#${normalizeQuestionText(text)}#${choices}`;
}

/** What is missing from a question before it is fit to keep, in plain words, or null when it is complete. */
export function bankQuestionProblem(type: QuestionType, q: { text: string; marks: number; options?: unknown; answer?: string }): string | null {
  const n = normalizeQuestion(type, q);
  if (!n.text) return "Write the question";
  if (!(n.marks > 0)) return "Marks must be above zero";
  if (type === "MCQ") {
    const filled = (n.options as string[]).filter((o) => o.trim());
    if (filled.length < 2) return "Give at least two options";
    const index = Number(n.answer);
    if (n.answer === "" || !Number.isInteger(index) || !(n.options as string[])[index]?.trim()) return "Mark the correct option";
  }
  if (type === "TRUE_FALSE" && n.answer !== "TRUE" && n.answer !== "FALSE") return "Choose True or False as the answer";
  if (type === "MATCH") {
    const pairs = (n.options as { left: string; right: string }[]).filter((p) => p.left && p.right);
    if (pairs.length < 2) return "Add at least two complete pairs";
  }
  return null;
}

// Views -----------------------------------------------------------------------------------------------------------

export type BankQuestionView = {
  id: string;
  subjectId: string;
  subject: string;
  gradeName: string;
  topicId: string | null;
  topic: string | null;
  type: QuestionType;
  text: string;
  marks: number;
  options: unknown;
  answer: string;
  answerLines: number;
  difficulty: Difficulty;
  tags: string[];
  rtl: boolean;
  active: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  mine: boolean;
  canEdit: boolean;
};

export type BankList = { items: BankQuestionView[]; total: number; page: number; pageSize: number };

/** The grades and subjects this person can keep questions for. */
export type BankChoices = { grades: { gradeName: string; subjects: { id: string; name: string }[] }[] };

export type BankTopic = { id: string; title: string; unit: string };

export type SavedToBank = { id: string; existed: boolean; archived: boolean };

export type UsedFromBank = { added: number; skipped: number };
