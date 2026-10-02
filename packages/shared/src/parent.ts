import { z } from "zod";
import type { AttendanceCounts, AttendanceStatus } from "./attendance";
import type { DiaryKind } from "./diary";

export const PARENT_LOCALES = ["en", "ur"] as const;
export type ParentLocale = (typeof PARENT_LOCALES)[number];

export const requestOtpSchema = z.object({ phone: z.string().trim().min(10, "Enter your mobile number").max(20, "That number is too long") });

export const verifyOtpSchema = requestOtpSchema.extend({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
  deviceLabel: z.string().trim().max(80).optional(),
});

export const parentProfileSchema = z.object({
  locale: z.enum(PARENT_LOCALES).optional(),
  name: z.string().trim().max(80).optional(),
});

export type RequestOtpInput = z.infer<typeof requestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ParentProfileInput = z.infer<typeof parentProfileSchema>;

/** One child, with the school they attend: a parent can have children in several schools. */
export type ParentChild = {
  id: string;
  name: string;
  firstName: string;
  admissionNo: string;
  gender: string;
  photoUrl: string;
  classId: string | null;
  classLabel: string;
  relation: string;
  school: { id: string; name: string; city: string; logoUrl: string; color: string };
};

export type ParentProfile = { id: string; phone: string; name: string; locale: ParentLocale };

export type ParentMe = { parent: ParentProfile; children: ParentChild[] };

export type ParentSession = ParentMe & { token: string };

export type OtpRequested = { ok: true; resendAfter: number };

export type ParentSummary = {
  child: ParentChild;
  date: string;
  attendance: { working: boolean; holiday: string | null; status: AttendanceStatus | null; monthPct: number | null; absentThisMonth: number };
  fees: { dueTotalPkr: number; openCount: number; overdueCount: number; nextDueOn: string | null };
  nextExam: { examName: string; subject: string; date: string; startTime: string } | null;
  diary: { todayCount: number; dueSoonCount: number };
  notice: { id: string; title: string; publishedAt: string } | null;
};

/** "OFF" is a weekend or holiday; null is a day that has not been marked (or is still ahead). */
export type ParentAttendanceDay = { date: string; status: AttendanceStatus | "OFF" | null; holiday: string | null };

export type ParentAttendance = { month: string; days: ParentAttendanceDay[]; counts: AttendanceCounts; pct: number | null };

export type ParentDiaryEntry = {
  id: string;
  date: string;
  kind: DiaryKind;
  subject: string | null;
  title: string;
  body: string;
  dueOn: string | null;
  imageUrl: string;
  author: string | null;
};

export type ParentDiary = { date: string; entries: ParentDiaryEntry[]; dueSoon: ParentDiaryEntry[] };

export type ParentInvoice = {
  id: string;
  number: string;
  period: string;
  issueDate: string;
  dueOn: string;
  totalPkr: number;
  paidPkr: number;
  balancePkr: number;
  status: string;
};

export type ParentPayment = { id: string; number: string; date: string; amountPkr: number; method: string; invoices: string[] };

export type ParentFees = { totalDuePkr: number; invoices: ParentInvoice[]; payments: ParentPayment[] };

export type ParentResultSubject = { name: string; obtained: number; max: number; grade: string; passed: boolean };

export type ParentResult = {
  id: string;
  title: string;
  scope: "EXAM" | "TERM" | "ANNUAL";
  yearName: string;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  rank: number | null;
  passed: boolean;
  attendancePct: number | null;
  teacherRemark: string;
  principalRemark: string;
  subjects: ParentResultSubject[];
  publishedAt: string;
};

export type ParentTimetable = {
  periods: { id: string; label: string; startTime: string; endTime: string; isBreak: boolean }[];
  lessons: { weekday: number; periodId: string; subject: string; teacher: string | null }[];
};

export type ParentNotice = { id: string; title: string; body: string; pinned: boolean; publishedAt: string };

export type ParentDevice = { id: string; label: string; lastSeenAt: string; createdAt: string; current: boolean };
