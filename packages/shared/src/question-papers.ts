import { z } from "zod";

export const QUESTION_TYPES = ["MCQ", "TRUE_FALSE", "FILL_BLANK", "SHORT", "LONG", "TRANSLATION", "WRITING", "COMPREHENSION", "MATCH", "CUSTOM"] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const QUESTION_PAPER_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "RETURNED"] as const;
export type QuestionPaperStatus = (typeof QUESTION_PAPER_STATUSES)[number];

export const QUESTION_PAPER_STATUS_LABEL: Record<QuestionPaperStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting approval",
  APPROVED: "Approved",
  RETURNED: "Returned",
};

export type QuestionTypeInfo = {
  label: string;
  /** What the section is called when the teacher picks this type. */
  defaultTitle: string;
  defaultInstructions: string;
  defaultMarks: number;
  /** Ruled answer lines suggested per question. */
  defaultLines: number;
  hint: string;
};

export const QUESTION_TYPE_INFO: Record<QuestionType, QuestionTypeInfo> = {
  MCQ: { label: "Multiple choice (MCQs)", defaultTitle: "Multiple choice questions", defaultInstructions: "Choose the correct answer.", defaultMarks: 1, defaultLines: 0, hint: "A question with 2–6 options and one correct answer." },
  TRUE_FALSE: { label: "True / False", defaultTitle: "True or false", defaultInstructions: "Write True or False against each statement.", defaultMarks: 1, defaultLines: 0, hint: "A statement the student marks true or false." },
  FILL_BLANK: { label: "Fill in the blanks", defaultTitle: "Fill in the blanks", defaultInstructions: "Fill in the blanks with suitable words.", defaultMarks: 1, defaultLines: 0, hint: "Type ____ where the blank goes." },
  SHORT: { label: "Short questions", defaultTitle: "Short questions", defaultInstructions: "Answer the following questions briefly.", defaultMarks: 3, defaultLines: 3, hint: "One- or two-line answers." },
  LONG: { label: "Long questions", defaultTitle: "Long questions", defaultInstructions: "Answer the following questions in detail.", defaultMarks: 8, defaultLines: 12, hint: "Detailed answers." },
  TRANSLATION: { label: "Translation", defaultTitle: "Translation", defaultInstructions: "Translate the following.", defaultMarks: 4, defaultLines: 4, hint: "Text to translate (e.g. English → Urdu)." },
  WRITING: { label: "Story / essay / letter writing", defaultTitle: "Writing", defaultInstructions: "Write on the given topic.", defaultMarks: 10, defaultLines: 18, hint: "A story, essay, letter or application." },
  COMPREHENSION: { label: "Comprehension passage", defaultTitle: "Comprehension", defaultInstructions: "Read the passage and answer the questions below.", defaultMarks: 3, defaultLines: 3, hint: "A reading passage followed by questions." },
  MATCH: { label: "Match the columns", defaultTitle: "Match the columns", defaultInstructions: "Match the items in Column A with Column B.", defaultMarks: 1, defaultLines: 0, hint: "Pairs the student matches up." },
  CUSTOM: { label: "Other (free-form)", defaultTitle: "Questions", defaultInstructions: "", defaultMarks: 5, defaultLines: 5, hint: "Anything else — diagrams to label, practical tasks, drawing." },
};

const text = (max: number) => z.string().trim().max(max).default("");

export const questionPaperCreateSchema = z.object({
  /** An exam paper (class + subject) of the exam. The question paper is shared by every section of the grade. */
  examPaperId: z.string().min(1),
  /** Start from an earlier question paper (e.g. last month's test). Questions are copied. */
  copyFromId: z.string().optional(),
});

export const questionPaperUpdateSchema = z.object({
  title: text(200).optional(),
  instructions: text(3000).optional(),
  durationMinutes: z.coerce.number().int().min(5, "At least 5 minutes").max(600).optional(),
});

const sectionFields = {
  title: z.string().trim().min(1, "Name the section").max(200),
  type: z.enum(QUESTION_TYPES),
  instructions: text(2000),
  passage: text(12000),
  rtl: z.boolean().default(false),
  attemptCount: z.coerce.number().int().min(1).max(100).nullable().default(null),
};

export const questionSectionSchema = z.object(sectionFields);
export const questionSectionUpdateSchema = z.object({
  title: sectionFields.title.optional(),
  instructions: text(2000).optional(),
  passage: text(12000).optional(),
  rtl: z.boolean().optional(),
  attemptCount: z.coerce.number().int().min(1).max(100).nullable().optional(),
});

const optionSchema = z.union([z.string().max(500), z.object({ left: z.string().max(500), right: z.string().max(500) })]);

export const questionInputSchema = z.object({
  text: z.string().trim().min(1, "Write the question").max(6000),
  marks: z.coerce.number().min(0.5, "Marks must be above 0").max(200),
  options: z.array(optionSchema).max(12).default([]),
  answer: text(4000),
  answerLines: z.coerce.number().int().min(0).max(40).default(0),
});

export const questionsCreateSchema = z.object({ questions: z.array(questionInputSchema).min(1, "Add at least one question").max(60) });
export const questionUpdateSchema = questionInputSchema.partial();

export const questionOrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });

export const questionPaperReviewSchema = z
  .object({ action: z.enum(["APPROVE", "RETURN"]), note: z.string().trim().default("") })
  .refine((r) => r.action === "APPROVE" || r.note.length > 0, { message: "Tell the teacher what to change", path: ["note"] });

export const questionPaperReopenSchema = z.object({ reason: z.string().trim().min(5, "Give a reason") });

export const questionPaperPrintSchema = z.object({
  copies: z
    .array(z.object({ classId: z.string().min(1), copies: z.coerce.number().int().min(1, "At least 1 copy").max(1000) }))
    .min(1, "Pick at least one class")
    .max(40),
  answerKey: z.boolean().default(false),
});

// Marks and validation — used by the server and by the builder so both agree --------------------------------

export type PaperQuestion = { id?: string; text: string; marks: number; options?: unknown; answer?: string };
export type PaperSection = { id?: string; title: string; type: QuestionType; passage?: string; attemptCount: number | null; questions: PaperQuestion[] };

/** What a student can score in a section: with "attempt any N" only the N best-paying questions count. */
type Markable = { attemptCount: number | null; questions: { marks: number }[] };

export function sectionMarks(section: Markable) {
  const marks = section.questions.map((q) => q.marks).sort((a, b) => b - a);
  const counted = section.attemptCount ? marks.slice(0, section.attemptCount) : marks;
  return Math.round(counted.reduce((s, m) => s + m, 0) * 100) / 100;
}

export function paperMarks(sections: Markable[]) {
  return Math.round(sections.reduce((s, sec) => s + sectionMarks(sec), 0) * 100) / 100;
}

export type PaperIssue = { sectionId?: string; questionId?: string; message: string };

/** What must be fixed before a paper can be submitted. `expectedMarks` is the exam paper's max marks (null when slots disagree). */
export function validatePaper(sections: PaperSection[], expectedMarks: number | null): { total: number; issues: PaperIssue[] } {
  const issues: PaperIssue[] = [];
  if (!sections.length) issues.push({ message: "Add at least one section" });
  for (const section of sections) {
    const where = { sectionId: section.id };
    if (!section.questions.length) issues.push({ ...where, message: `“${section.title}” has no questions` });
    if (section.attemptCount && section.attemptCount > section.questions.length) {
      issues.push({ ...where, message: `“${section.title}”: attempt ${section.attemptCount} but only ${section.questions.length} questions` });
    }
    if (section.type === "COMPREHENSION" && !section.passage?.trim()) issues.push({ ...where, message: `“${section.title}” needs a reading passage` });
    section.questions.forEach((q, index) => {
      const at = { ...where, questionId: q.id };
      const label = `“${section.title}” question ${index + 1}`;
      if (!(q.marks > 0)) issues.push({ ...at, message: `${label} needs marks` });
      if (section.type === "MCQ") {
        const options = ((q.options as unknown[]) ?? []).filter((o): o is string => typeof o === "string" && o.trim().length > 0);
        const answer = Number(q.answer);
        if (options.length < 2) issues.push({ ...at, message: `${label} needs at least two options` });
        else if (q.answer === undefined || q.answer === "" || !Number.isInteger(answer) || answer < 0 || answer >= ((q.options as unknown[]) ?? []).length) {
          issues.push({ ...at, message: `${label}: mark the correct option` });
        }
      }
      if (section.type === "TRUE_FALSE" && q.answer !== "TRUE" && q.answer !== "FALSE") issues.push({ ...at, message: `${label}: choose True or False as the answer` });
      if (section.type === "MATCH") {
        const pairs = ((q.options as { left?: string; right?: string }[]) ?? []).filter((p) => p && typeof p === "object" && p.left?.trim() && p.right?.trim());
        if (pairs.length < 2) issues.push({ ...at, message: `${label} needs at least two matching pairs` });
      }
    });
  }
  const total = paperMarks(sections);
  if (expectedMarks != null && sections.length && total !== expectedMarks) {
    issues.push({ message: `The paper adds up to ${total} marks but the exam is out of ${expectedMarks}` });
  }
  return { total, issues };
}

/** Deterministic shuffle so column B prints in the same scrambled order on every copy. */
export function seededOrder(length: number, seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  const next = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const order = Array.from({ length }, (_, i) => i);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** Copies to print by default: every student plus a few spares (11 students → 13). */
export function suggestedCopies(students: number) {
  return students + Math.max(2, Math.ceil(students * 0.1));
}

export type QuestionPaperCreateInput = z.infer<typeof questionPaperCreateSchema>;
export type QuestionInput = z.infer<typeof questionInputSchema>;
