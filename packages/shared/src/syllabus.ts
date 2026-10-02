import { z } from "zod";

export const TOPIC_PROGRESS = ["PLANNED", "IN_PROGRESS", "COMPLETED"] as const;
export type TopicProgress = (typeof TOPIC_PROGRESS)[number];

export const TOPIC_PROGRESS_LABEL: Record<TopicProgress, string> = {
  PLANNED: "Planned",
  IN_PROGRESS: "In progress",
  COMPLETED: "Taught",
};

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Pick a date");
const optionalDate = dateString.nullable().optional();
const text = (max: number) => z.string().trim().max(max).default("");

export const syllabusCreateSchema = z.object({
  gradeName: z.string().trim().min(1, "Pick a class"),
  subjectId: z.string().min(1, "Pick a subject"),
  /** Start from this syllabus (e.g. last year's): units and topics are copied, progress and exam links are not. */
  copyFromId: z.string().optional(),
});

export const syllabusUpdateSchema = z.object({
  overview: text(4000).optional(),
  assessmentNotes: text(2000).optional(),
  resources: text(2000).optional(),
});

const dateOrder = (u: { plannedFrom?: string | null; plannedTo?: string | null }) => !u.plannedFrom || !u.plannedTo || u.plannedTo >= u.plannedFrom;

export const syllabusUnitSchema = z
  .object({
    title: z.string().trim().min(1, "Name the unit").max(200),
    description: text(2000),
    termId: z.string().nullable().optional(),
    plannedFrom: optionalDate,
    plannedTo: optionalDate,
  })
  .refine(dateOrder, { message: "End date must be after start", path: ["plannedTo"] });

export const syllabusUnitUpdateSchema = z
  .object({
    title: z.string().trim().min(1, "Name the unit").max(200).optional(),
    description: text(2000).optional(),
    termId: z.string().nullable().optional(),
    plannedFrom: optionalDate,
    plannedTo: optionalDate,
  })
  .refine(dateOrder, { message: "End date must be after start", path: ["plannedTo"] });

/** One topic, or many at once (paste a list — one title per line). */
export const syllabusTopicsCreateSchema = z.object({
  titles: z.array(z.string().trim().min(1).max(250)).min(1, "Add at least one topic").max(100),
  plannedPeriods: z.coerce.number().int().min(0).max(60).optional(),
});

export const syllabusTopicUpdateSchema = z.object({
  title: z.string().trim().min(1, "Name the topic").max(250).optional(),
  objectives: text(3000).optional(),
  resources: text(2000).optional(),
  plannedPeriods: z.coerce.number().int().min(0).max(60).optional(),
  /** Moving to another unit is refused while the topic is locked. */
  unitId: z.string().optional(),
});

export const topicProgressSchema = z.object({
  progress: z.enum(TOPIC_PROGRESS),
  completedOn: optionalDate,
});

/** Bulk progress: mark several topics at once (e.g. "Unit 1 is done"). */
export const topicProgressBulkSchema = z.object({
  topicIds: z.array(z.string().min(1)).min(1).max(300),
  progress: z.enum(TOPIC_PROGRESS),
  completedOn: optionalDate,
});

export const syllabusOrderSchema = z.object({ ids: z.array(z.string().min(1)).min(1).max(500) });

export const paperCoverageSchema = z.object({
  topicIds: z.array(z.string().min(1)).max(500),
  /** Apply the same coverage to the other sections of this grade in the same exam (frozen papers are skipped). */
  allSections: z.boolean().default(false),
});

export const syllabusCopyYearSchema = z.object({
  fromYearId: z.string().min(1, "Pick the year to copy from"),
});

export type SyllabusCreateInput = z.infer<typeof syllabusCreateSchema>;
export type SyllabusUnitInput = z.infer<typeof syllabusUnitSchema>;
export type SyllabusTopicUpdateInput = z.infer<typeof syllabusTopicUpdateSchema>;

/** Pasted text → topic titles: one per line, bullets and numbering stripped, blanks and repeats dropped. */
export function parseTopicList(raw: string) {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const title = line.replace(/^\s*(?:[-*•–]|\d+[.)])\s*/, "").trim();
    const key = title.toLowerCase();
    if (!title || seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}
