import { z } from "zod";

export const EXAM_KINDS = ["EXAM", "QUIZ", "ASSIGNMENT", "PRACTICAL", "VIVA"] as const;
export const ASSESSMENT_KINDS = ["QUIZ", "ASSIGNMENT", "PRACTICAL", "VIVA"] as const;
export const EXAM_STATUSES = ["DRAFT", "SCHEDULED", "IN_PROGRESS", "MARKING", "COMPLETED", "PUBLISHED"] as const;
export const PAPER_STATUSES = ["NOT_STARTED", "DRAFT", "SUBMITTED", "RETURNED", "APPROVED"] as const;
export const MARK_ATTENDANCE = ["PRESENT", "ABSENT", "MEDICAL", "EXEMPT"] as const;
export const RANK_METHODS = ["DENSE", "STANDARD", "NONE"] as const;
export const RANK_SCOPES = ["SECTION", "GRADE"] as const;
export const REPORT_CARD_LAYOUTS = ["CLASSIC", "MODERN", "COMPACT"] as const;
export const RESULT_SCOPES = ["EXAM", "TERM", "ANNUAL"] as const;

export type ExamKind = (typeof EXAM_KINDS)[number];
export type AssessmentKind = (typeof ASSESSMENT_KINDS)[number];
export type ExamStatus = (typeof EXAM_STATUSES)[number];
export type PaperStatus = (typeof PAPER_STATUSES)[number];
export type MarkAttendance = (typeof MARK_ATTENDANCE)[number];
export type ResultScope = (typeof RESULT_SCOPES)[number];

export const EXAM_KIND_LABELS: Record<ExamKind, string> = {
  EXAM: "Exam",
  QUIZ: "Quiz",
  ASSIGNMENT: "Assignment",
  PRACTICAL: "Practical",
  VIVA: "Viva",
};

/** Presets for the Create exam wizard so a school exam takes a few clicks. */
export const EXAM_TEMPLATES = [
  { id: "unit_test", name: "Unit Test", maxMarks: 25, passMarks: 10, weight: 10, days: 3 },
  { id: "monthly_test", name: "Monthly Test", maxMarks: 50, passMarks: 17, weight: 10, days: 5 },
  { id: "midterm", name: "Mid Term Exam", maxMarks: 100, passMarks: 33, weight: 40, days: 10 },
  { id: "final_term", name: "Final Term Exam", maxMarks: 100, passMarks: 33, weight: 60, days: 12 },
  { id: "pre_board", name: "Pre-Board Exam", maxMarks: 100, passMarks: 33, weight: 100, days: 12 },
] as const;

export const DEFAULT_GRADE_BANDS = [
  { grade: "A+", minPct: 90, gpa: 4, remark: "Outstanding", isFail: false },
  { grade: "A", minPct: 80, gpa: 3.7, remark: "Excellent", isFail: false },
  { grade: "B", minPct: 70, gpa: 3, remark: "Very good", isFail: false },
  { grade: "C", minPct: 60, gpa: 2.5, remark: "Good", isFail: false },
  { grade: "D", minPct: 50, gpa: 2, remark: "Satisfactory", isFail: false },
  { grade: "E", minPct: 33, gpa: 1, remark: "Needs improvement", isFail: false },
  { grade: "F", minPct: 0, gpa: 0, remark: "Fail", isFail: true },
];

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Pick a date");
const timeString = z.string().regex(/^(\d{2}:\d{2})?$/, "Use HH:MM").default("");

export const termSchema = z
  .object({
    name: z.string().trim().min(1, "Name the term"),
    startsOn: dateString,
    endsOn: dateString,
    weight: z.coerce.number().min(0).max(100).default(50),
    sortOrder: z.coerce.number().int().min(0).default(0),
  })
  .refine((t) => t.endsOn >= t.startsOn, { message: "End date must be after start", path: ["endsOn"] });

export const gradeBandSchema = z.object({
  grade: z.string().trim().min(1, "Grade label required").max(6),
  minPct: z.coerce.number().min(0).max(100),
  gpa: z.coerce.number().min(0).max(10).nullable().default(null),
  remark: z.string().trim().default(""),
  isFail: z.boolean().default(false),
});

export const gradingScaleSchema = z
  .object({
    name: z.string().trim().min(1, "Name the scale"),
    isDefault: z.boolean().default(false),
    bands: z.array(gradeBandSchema).min(2, "Add at least two grades"),
  })
  .superRefine((scale, ctx) => {
    const mins = scale.bands.map((b) => b.minPct);
    if (new Set(mins).size !== mins.length) ctx.addIssue({ code: "custom", message: "Two grades start at the same %", path: ["bands"] });
    if (!mins.includes(0)) ctx.addIssue({ code: "custom", message: "The lowest grade must start at 0%", path: ["bands"] });
    const grades = scale.bands.map((b) => b.grade.toLowerCase());
    if (new Set(grades).size !== grades.length) ctx.addIssue({ code: "custom", message: "Grade labels must be unique", path: ["bands"] });
  })
  .transform((scale) => ({ ...scale, bands: [...scale.bands].sort((a, b) => b.minPct - a.minPct) }));

export const examSettingsSchema = z.object({
  overallPassPct: z.coerce.number().min(0).max(100),
  subjectPassRequired: z.boolean(),
  maxFailSubjects: z.coerce.number().int().min(0).max(20),
  graceMarks: z.coerce.number().min(0).max(20),
  decimals: z.coerce.number().int().min(0).max(2),
  absentCountsAsZero: z.boolean(),
  assessmentWeight: z.coerce.number().min(0).max(100),
  rankMethod: z.enum(RANK_METHODS),
  rankScope: z.enum(RANK_SCOPES),
  rankOnlyPassed: z.boolean(),
  showRank: z.boolean(),
  atRiskPct: z.coerce.number().min(0).max(100),
});

export const reportCardOptionsSchema = z.object({
  showRank: z.boolean().default(true),
  showGpa: z.boolean().default(false),
  showAttendance: z.boolean().default(true),
  showRemarks: z.boolean().default(true),
  showGradeLegend: z.boolean().default(true),
  showBreakdown: z.boolean().default(true),
  headerNote: z.string().default(""),
  signatures: z.array(z.string().trim().min(1)).max(4).default(["Class teacher", "Principal", "Parent"]),
});

export const reportCardTemplateSchema = z.object({
  name: z.string().trim().min(1, "Name the template"),
  layout: z.enum(REPORT_CARD_LAYOUTS).default("CLASSIC"),
  isDefault: z.boolean().default(false),
  options: reportCardOptionsSchema,
});

export const examPaperInputSchema = z.object({
  classId: z.string().min(1),
  subjectId: z.string().min(1),
  maxMarks: z.coerce.number().positive("Max marks must be above 0").max(1000),
  passMarks: z.coerce.number().min(0),
  date: dateString.nullable().optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  room: z.string().default("").optional(),
  invigilatorId: z.string().nullable().optional(),
});

const examBasics = {
  name: z.string().trim().min(1, "Name the exam"),
  code: z.string().trim().default(""),
  kind: z.enum(EXAM_KINDS).default("EXAM"),
  termId: z.string().nullable().optional(),
  gradingScaleId: z.string().nullable().optional(),
  startsOn: dateString,
  endsOn: dateString,
  weight: z.coerce.number().min(0).max(100).default(100),
  includeInReportCard: z.boolean().default(true),
  instructions: z.string().default(""),
};

export const examCreateSchema = z
  .object({
    ...examBasics,
    papers: z.array(examPaperInputSchema).min(1, "Add at least one class and subject"),
    publishSchedule: z.boolean().default(false),
  })
  .refine((e) => e.endsOn >= e.startsOn, { message: "End date must be after start", path: ["endsOn"] })
  .superRefine((e, ctx) => {
    e.papers.forEach((p, i) => {
      if (p.passMarks > p.maxMarks) ctx.addIssue({ code: "custom", message: "Pass marks exceed max marks", path: ["papers", i, "passMarks"] });
    });
  });

export const examUpdateSchema = z.object({
  name: examBasics.name.optional(),
  code: z.string().trim().optional(),
  termId: z.string().nullable().optional(),
  gradingScaleId: z.string().nullable().optional(),
  startsOn: dateString.optional(),
  endsOn: dateString.optional(),
  weight: z.coerce.number().min(0).max(100).optional(),
  includeInReportCard: z.boolean().optional(),
  instructions: z.string().optional(),
  status: z.enum(EXAM_STATUSES).optional(),
});

export const quickAssessmentSchema = z.object({
  kind: z.enum(EXAM_KINDS),
  name: z.string().trim().min(1, "Give it a title"),
  classId: z.string().min(1, "Pick a class"),
  subjectId: z.string().min(1, "Pick a subject"),
  termId: z.string().nullable().optional(),
  date: dateString,
  maxMarks: z.coerce.number().positive("Max marks must be above 0").max(1000),
  passMarks: z.coerce.number().min(0).optional(),
  weight: z.coerce.number().min(0).max(100).default(100),
  instructions: z.string().default(""),
});

export const examPaperUpdateSchema = z.object({
  date: dateString.nullable().optional(),
  startTime: timeString.optional(),
  endTime: timeString.optional(),
  room: z.string().optional(),
  invigilatorId: z.string().nullable().optional(),
  maxMarks: z.coerce.number().positive().max(1000).optional(),
  passMarks: z.coerce.number().min(0).optional(),
});

export const scheduleGenerateSchema = z.object({
  startsOn: dateString,
  skipWeekdays: z.array(z.number().int().min(0).max(6)).default([0]),
  holidays: z.array(dateString).default([]),
  papersPerDay: z.coerce.number().int().min(1).max(4).default(1),
  startTime: timeString.default("09:00"),
  endTime: timeString.default("12:00"),
});

export const marksBulkSaveSchema = z.object({
  rows: z
    .array(
      z.object({
        studentId: z.string().min(1),
        marks: z.coerce.number().min(0).nullable(),
        attendance: z.enum(MARK_ATTENDANCE).default("PRESENT"),
        remark: z.string().max(200).default(""),
      }),
    )
    .max(500),
  submit: z.boolean().default(false),
});

export const marksReviewSchema = z.object({
  paperIds: z.array(z.string().min(1)).min(1).max(200),
  action: z.enum(["APPROVE", "RETURN"]),
  note: z.string().trim().default(""),
}).refine((r) => r.action === "APPROVE" || r.note.length > 0, { message: "Tell the teacher what to fix", path: ["note"] });

export const markCorrectionSchema = z.object({
  paperId: z.string().min(1),
  studentId: z.string().min(1),
  newMarks: z.coerce.number().min(0).nullable(),
  newAttendance: z.enum(MARK_ATTENDANCE).default("PRESENT"),
  reason: z.string().trim().min(5, "Explain why the marks must change"),
});

export const correctionReviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  note: z.string().trim().default(""),
});

export const resultComputeSchema = z.object({
  scope: z.enum(RESULT_SCOPES),
  /** examId or termId; ignored for ANNUAL (uses the year). */
  scopeId: z.string().optional(),
  classIds: z.array(z.string()).optional(),
});

export const resultPublishSchema = resultComputeSchema.extend({
  publish: z.boolean(),
});

export const resultRemarksSchema = z.object({
  rows: z
    .array(z.object({ resultId: z.string().min(1), teacherRemark: z.string().max(500).optional(), principalRemark: z.string().max(500).optional() }))
    .max(500),
});

export type TermInput = z.infer<typeof termSchema>;
export type GradeBand = z.infer<typeof gradeBandSchema>;
export type GradingScaleInput = z.infer<typeof gradingScaleSchema>;
export type ExamSettingsInput = z.infer<typeof examSettingsSchema>;
export type ReportCardOptions = z.infer<typeof reportCardOptionsSchema>;
export type ReportCardTemplateInput = z.infer<typeof reportCardTemplateSchema>;
export type ExamCreateInput = z.infer<typeof examCreateSchema>;
export type ExamPaperInput = z.infer<typeof examPaperInputSchema>;
export type QuickAssessmentInput = z.infer<typeof quickAssessmentSchema>;
export type MarksBulkSaveInput = z.infer<typeof marksBulkSaveSchema>;
