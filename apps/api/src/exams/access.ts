import { BadRequestException, ForbiddenException } from "@nestjs/common";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolId } from "../common/roles";
import { staffForUser } from "../common/school";
import type { SchoolScope } from "../common/school-scope";
import type { PrismaService } from "../prisma/prisma.service";

export const EXAM_ACTIONS = [
  "exams.view",
  "exams.manage",
  "exams.assessment.create",
  "marks.enter",
  "marks.review",
  "marks.correction.request",
  "marks.correction.review",
  "results.view",
  "results.manage",
  "analytics.view",
  "settings.manage",
] as const;

export type ExamAction = (typeof EXAM_ACTIONS)[number];

/** Teachers work only inside their own classes and subjects (checked again per paper with {@link TeacherScope}). */
const TEACHER_ACTIONS = new Set<ExamAction>([
  "exams.view",
  "exams.assessment.create",
  "marks.enter",
  "marks.correction.request",
  "results.view",
  "analytics.view",
]);

export function assertExamAccess(user: CurrentUser, action: ExamAction) {
  const schoolId = requireSchoolId(user);
  if (user.role === "SCHOOL_ADMIN") return schoolId;
  if (user.role === "TEACHER" && TEACHER_ACTIONS.has(action)) return schoolId;
  throw new ForbiddenException("You do not have permission for this exam action");
}

/** null = admin (everything). Otherwise the classes and class+subject pairs this teacher teaches. */
export type TeacherScope = {
  staffId: string | null;
  classIds: Set<string>;
  /** Classes where the teacher is assigned without a subject (class teacher) — every subject is allowed. */
  wholeClassIds: Set<string>;
  pairs: Set<string>;
} | null;

export const pairKey = (classId: string, subjectId: string) => `${classId}:${subjectId}`;

export async function teacherScope(prisma: PrismaService, user: CurrentUser): Promise<TeacherScope> {
  if (user.role !== "TEACHER") return null;
  const schoolId = requireSchoolId(user);
  const staff = await staffForUser(prisma, user);
  const empty = { staffId: staff?.id ?? null, classIds: new Set<string>(), wholeClassIds: new Set<string>(), pairs: new Set<string>() };
  if (!staff) return empty;
  const [assigned, lessons, subjects] = await Promise.all([
    prisma.teacherAssignment.findMany({ where: { schoolId, staffId: staff.id }, select: { classId: true, subject: true } }),
    prisma.timetableLesson.findMany({ where: { schoolId, staffId: staff.id }, select: { classId: true, subject: true }, distinct: ["classId", "subject"] }),
    prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true, code: true } }),
  ]);
  const byName = new Map<string, string>();
  for (const s of subjects) {
    byName.set(s.name.trim().toLowerCase(), s.id);
    if (s.code) byName.set(s.code.trim().toLowerCase(), s.id);
  }
  for (const row of [...assigned, ...lessons]) {
    empty.classIds.add(row.classId);
    const name = row.subject.trim().toLowerCase();
    if (!name) {
      empty.wholeClassIds.add(row.classId);
      continue;
    }
    const subjectId = byName.get(name);
    if (subjectId) empty.pairs.add(pairKey(row.classId, subjectId));
  }
  return empty;
}

export function canMarkPaper(scope: TeacherScope, paper: { classId: string; subjectId: string }) {
  if (!scope) return true;
  return scope.wholeClassIds.has(paper.classId) || scope.pairs.has(pairKey(paper.classId, paper.subjectId));
}

export function assertCanMarkPaper(scope: TeacherScope, paper: { classId: string; subjectId: string }) {
  if (!canMarkPaper(scope, paper)) throw new ForbiddenException("You don't teach this subject in this class");
}

export function assertClassInScope(scope: TeacherScope, classId: string) {
  if (scope && !scope.classIds.has(classId)) throw new ForbiddenException("This class is not assigned to you");
}

/** Year from the X-Year-Id header when it belongs to the school; else the current (or latest) year. */
export async function resolveYearId(prisma: PrismaService, schoolId: string, scope?: SchoolScope) {
  if (scope?.yearId) {
    const year = await prisma.academicYear.findFirst({ where: { id: scope.yearId, schoolId }, select: { id: true } });
    if (year) return year.id;
  }
  const year = await prisma.academicYear.findFirst({
    where: { schoolId },
    orderBy: [{ current: "desc" }, { startsOn: "desc" }],
    select: { id: true },
  });
  if (!year) throw new BadRequestException("Create an academic year first");
  return year.id;
}
