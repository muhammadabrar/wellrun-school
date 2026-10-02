import { z } from "zod";
import { addDays } from "./attendance";

export const DIARY_KINDS = ["HOMEWORK", "CLASSWORK", "NOTE"] as const;
export type DiaryKind = (typeof DIARY_KINDS)[number];

export const DIARY_KIND_LABEL: Record<DiaryKind, string> = {
  HOMEWORK: "Homework",
  CLASSWORK: "Classwork",
  NOTE: "Note",
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");

const diaryFields = {
  subjectId: z.string().min(1).nullable().optional(),
  date: isoDate,
  kind: z.enum(DIARY_KINDS).default("HOMEWORK"),
  title: z.string().trim().max(120, "Keep the title under 120 characters").default(""),
  body: z.string().trim().min(1, "Write what the class needs to know").max(4000, "Keep it under 4000 characters"),
  dueOn: isoDate.nullable().optional(),
  /** A photo of the board or worksheet, as a data URL. */
  image: z.string().max(8_000_000, "Image is too large").optional(),
};

const dueAfterDate = (value: { date?: string; dueOn?: string | null }) => !value.dueOn || !value.date || value.dueOn >= value.date;
const dueMessage = { message: "Due date can't be before the diary date", path: ["dueOn"] };

export const diaryCreateSchema = z.object({ classId: z.string().min(1), ...diaryFields }).refine(dueAfterDate, dueMessage);

export const diaryUpdateSchema = z
  .object(diaryFields)
  .partial()
  .extend({ removeImage: z.boolean().optional() })
  .refine(dueAfterDate, dueMessage);

export const diaryCopySchema = z.object({ classIds: z.array(z.string().min(1)).min(1, "Pick at least one class").max(20) });

export const noticeSchema = z.object({
  title: z.string().trim().min(1, "Give the notice a title").max(120, "Keep the title under 120 characters"),
  body: z.string().trim().min(1, "Write the notice").max(4000, "Keep it under 4000 characters"),
  audience: z.enum(["ALL", "CLASSES"]).default("ALL"),
  classIds: z.array(z.string().min(1)).max(200).default([]),
  pinned: z.boolean().default(false),
});

export const noticeUpdateSchema = noticeSchema.partial();

export type DiaryCreateInput = z.input<typeof diaryCreateSchema>;
export type DiaryUpdateInput = z.input<typeof diaryUpdateSchema>;
export type NoticeInput = z.input<typeof noticeSchema>;

/** A diary can be written from yesterday (a late-night catch-up) up to a month ahead. */
export function diaryWindow(today: string) {
  return { from: addDays(today, -1), to: addDays(today, 30) };
}

/** Entries stay editable until their day is a day behind us; after that they are the record of what was set. */
export function isDiaryDateOpen(date: string, today: string) {
  return date >= addDays(today, -1);
}

export function diaryDateError(date: string, today: string) {
  const { from, to } = diaryWindow(today);
  if (date < from) return "Diary entries can be written from yesterday onwards";
  if (date > to) return "That date is too far ahead";
  return null;
}

/** Can this teacher post this entry? Class teachers post anything; subject teachers post for their own subject, or a general note. */
export type DiaryScope = { classIds: ReadonlySet<string>; wholeClassIds: ReadonlySet<string>; pairs: ReadonlySet<string> } | null;

export function canPostDiary(scope: DiaryScope, entry: { classId: string; subjectId: string | null; kind: DiaryKind }) {
  if (!scope) return false;
  if (scope.wholeClassIds.has(entry.classId)) return true;
  if (!scope.classIds.has(entry.classId)) return false;
  if (!entry.subjectId) return entry.kind === "NOTE";
  return scope.pairs.has(`${entry.classId}:${entry.subjectId}`);
}

export type DiaryEntryView = {
  id: string;
  classId: string;
  className: string;
  subjectId: string | null;
  subject: string | null;
  date: string;
  kind: DiaryKind;
  title: string;
  body: string;
  dueOn: string | null;
  imageUrl: string;
  author: string | null;
  mine: boolean;
  canEdit: boolean;
  /** Admins can take down any entry; teachers only their own recent ones. */
  canDelete: boolean;
};

export type DiaryList = { items: DiaryEntryView[]; total: number; page: number; pageSize: number };

export type DiaryChoices = {
  /** Classes the signed-in teacher may post to, with the subjects allowed in each. Empty for admins. */
  classes: { id: string; label: string; gradeName: string; subjects: { id: string; name: string }[]; canNote: boolean }[];
};

export type DiaryToday = {
  date: string;
  working: boolean;
  holiday: string | null;
  lessons: { classId: string; label: string; subject: string; posted: boolean }[];
};

export type DiaryOverview = {
  date: string;
  working: boolean;
  holiday: string | null;
  classes: { id: string; label: string; entries: number; subjects: number }[];
  posted: number;
  total: number;
};

export type NoticeView = {
  id: string;
  title: string;
  body: string;
  audience: "ALL" | "CLASSES";
  classIds: string[];
  classLabels: string[];
  pinned: boolean;
  publishedAt: string;
  author: string | null;
};
