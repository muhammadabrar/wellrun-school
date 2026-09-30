import { z } from "zod";

export const academicYearStatuses = ["PLANNING", "ACTIVE", "CLOSED"] as const;
export type AcademicYearStatus = (typeof academicYearStatuses)[number];

export const ACADEMIC_YEAR_STATUS_LABEL: Record<AcademicYearStatus, string> = {
  PLANNING: "Upcoming",
  ACTIVE: "Current",
  CLOSED: "Closed",
};

const DAY_MS = 86_400_000;
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, "Pick a date")
  .transform((s) => s.slice(0, 10));

export const academicYearSchema = z
  .object({
    name: z.string().trim().min(1, "Name the year, e.g. 2027-28").max(40),
    startsOn: dateString,
    endsOn: dateString,
  })
  .refine((y) => y.endsOn > y.startsOn, { message: "End date must be after start", path: ["endsOn"] })
  .refine((y) => (Date.parse(y.endsOn) - Date.parse(y.startsOn)) / DAY_MS <= 400, { message: "A year can run at most ~13 months", path: ["endsOn"] });

export type AcademicYearInput = z.infer<typeof academicYearSchema>;

export const activateYearSchema = z.object({
  /** Close the year that is currently active in the same step (new-year go-live). */
  closePrevious: z.boolean().default(false),
});

export type AcademicYearSummary = {
  id: string;
  name: string;
  startsOn: string;
  endsOn: string;
  status: AcademicYearStatus;
  current: boolean;
  closedAt: string | null;
  counts: { classes: number; students: number; exams: number; invoices: number };
};

export type YearCloseCheckItem = {
  key: "unpublishedExams" | "draftInvoices" | "pendingAdmissions" | "noAnnualResults" | "notRolledOver" | "outstanding";
  label: string;
  count: number;
  /** Amount in PKR, only for money items. */
  amountPkr?: number;
};

export type YearCloseCheck = {
  yearId: string;
  name: string;
  /** Warnings only — closing is still allowed. */
  items: YearCloseCheckItem[];
};

/** Suggested next year from the one before: starts the day after it ends and runs 12 months. */
export function nextYearDraft(prev: { name: string; endsOn: string } | null | undefined, today = new Date()): AcademicYearInput {
  const start = prev ? new Date(Date.parse(prev.endsOn.slice(0, 10)) + DAY_MS) : new Date(Date.UTC(today.getUTCFullYear(), 3, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate()) - DAY_MS);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const y1 = start.getUTCFullYear();
  const y2 = end.getUTCFullYear();
  return { name: y1 === y2 ? String(y1) : `${y1}-${String(y2).slice(-2)}`, startsOn: iso(start), endsOn: iso(end) };
}

/* ---------- New-year rollover ---------- */

export const copySetupSchema = z.object({
  fromYearId: z.string().min(1, "Pick the year to copy from"),
  /** Classes & sections, with their subjects. Everything else below needs these. */
  classes: z.boolean().default(true),
  teachers: z.boolean().default(false),
  timetable: z.boolean().default(false),
  fees: z.boolean().default(true),
  /** Raise every copied fee amount by this %, rounded to the nearest 10 PKR. */
  feeIncreasePct: z.coerce.number().min(0).max(100).default(0),
  terms: z.boolean().default(true),
});

export type CopySetupInput = z.input<typeof copySetupSchema>;

export type CopySetupResult = {
  classes: number;
  subjects: number;
  teachers: number;
  lessons: number;
  feeStructures: number;
  terms: number;
};

export const promotionActions = ["PROMOTE", "REPEAT", "LEAVE", "GRADUATE"] as const;
export type PromotionAction = (typeof promotionActions)[number];

export const PROMOTION_ACTION_LABEL: Record<PromotionAction, string> = {
  PROMOTE: "Promote",
  REPEAT: "Repeat",
  LEAVE: "Leaving",
  GRADUATE: "Graduate",
};

export type PromotionPreviewStudent = {
  id: string;
  name: string;
  admissionNo: string;
  rollNo: string;
  result: { passed: boolean; percentage: number; grade: string } | null;
  suggested: PromotionAction;
  /** Already has a class in the new year (safe to re-run; these are skipped). */
  alreadyMoved: boolean;
};

export type PromotionPreviewClass = {
  id: string;
  label: string;
  name: string;
  section: string;
  campusId: string | null;
  /** New-year class the students move up to; null when none matches or this is the final class. */
  suggestedTargetId: string | null;
  /** Same class name in the new year, for students who repeat. */
  repeatTargetId: string | null;
  isFinal: boolean;
  students: PromotionPreviewStudent[];
};

export type PromotionPreview = {
  fromYear: { id: string; name: string };
  toYear: { id: string; name: string };
  targets: { id: string; label: string; campusId: string | null }[];
  classes: PromotionPreviewClass[];
};

export const promotionSchema = z.object({
  fromYearId: z.string().min(1),
  decisions: z
    .array(
      z
        .object({
          studentId: z.string().min(1),
          action: z.enum(promotionActions),
          toClassId: z.string().optional(),
        })
        .refine((d) => (d.action === "PROMOTE" || d.action === "REPEAT" ? Boolean(d.toClassId) : true), {
          message: "Pick the new class",
          path: ["toClassId"],
        }),
    )
    .min(1, "Nothing to save")
    .max(5000),
});

export type PromotionInput = z.input<typeof promotionSchema>;

export type PromotionResult = {
  promoted: number;
  repeated: number;
  left: number;
  graduated: number;
  skipped: number;
  /** Students moved into a class with no fee structure in the new year. */
  withoutFees: number;
};

/** Class ladders the school may follow — used to suggest the next class. */
const CLASS_LADDERS: readonly (readonly string[])[] = [
  ["Playgroup", "Pre-Nursery", "Nursery", "Prep", "KG", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Grade 11", "Grade 12"],
  ["Early Years", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "AS Level", "A Level"],
  ["First Year", "Second Year"],
  ["ICS Year 1", "ICS Year 2"],
  ["ICom Year 1", "ICom Year 2"],
];

/**
 * The class a student moves up to, by name. null = final class (graduates) or unknown.
 * Falls back to bumping a trailing number: "Class 3" → "Class 4".
 */
export function nextClassName(name: string, known: string[] = []): string | null {
  const lower = name.trim().toLowerCase();
  for (const ladder of CLASS_LADDERS) {
    const i = ladder.findIndex((step) => step.toLowerCase() === lower);
    if (i === -1) continue;
    // Skip rungs the school doesn't use (e.g. no "Prep"), but stop at the end of the ladder.
    const knownSet = new Set(known.map((k) => k.toLowerCase()));
    for (let j = i + 1; j < ladder.length; j++) {
      if (!known.length || knownSet.has(ladder[j]!.toLowerCase())) return ladder[j]!;
    }
    return null;
  }
  const match = name.trim().match(/^(.*?)(\d+)$/);
  if (!match) return null;
  const next = `${match[1]}${Number(match[2]) + 1}`;
  return !known.length || known.some((k) => k.toLowerCase() === next.toLowerCase()) ? next : null;
}

/** True when the class sits on a known ladder and nothing the school runs comes after it (e.g. Grade 10 in a school that stops there). */
export function isFinalClass(name: string, known: string[] = []) {
  const lower = name.trim().toLowerCase();
  return CLASS_LADDERS.some((ladder) => ladder.some((step) => step.toLowerCase() === lower)) && nextClassName(name, known) === null;
}
