import { ForbiddenException } from "@nestjs/common";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolId } from "../common/roles";
import type { PrismaService } from "../prisma/prisma.service";
import type { TeacherScope } from "../exams/access";

export const SYLLABUS_ACTIONS = ["syllabus.view", "syllabus.edit", "syllabus.manage"] as const;
export type SyllabusAction = (typeof SYLLABUS_ACTIONS)[number];

/** Teachers view and edit the syllabus of their own class + subject; admins also copy years and manage everything. */
const TEACHER_ACTIONS = new Set<SyllabusAction>(["syllabus.view", "syllabus.edit"]);

export function assertSyllabusAccess(user: CurrentUser, action: SyllabusAction) {
  const schoolId = requireSchoolId(user);
  if (user.role === "SCHOOL_ADMIN") return schoolId;
  if (user.role === "TEACHER" && TEACHER_ACTIONS.has(action)) return schoolId;
  throw new ForbiddenException("You do not have permission for this syllabus action");
}

/**
 * What a teacher may see and edit, by grade name (a syllabus is shared by every section of a grade).
 * null = admin. `viewGrades` are grades the teacher has any class in; `editable` is the exact (grade, subject) pairs.
 */
export type SyllabusScope = {
  viewGrades: Set<string>;
  wholeGrades: Set<string>;
  pairs: Set<string>;
} | null;

export const gradeKey = (gradeName: string, subjectId: string) => `${gradeName}::${subjectId}`;

export async function syllabusScope(prisma: PrismaService, schoolId: string, yearId: string, teacher: TeacherScope): Promise<SyllabusScope> {
  if (!teacher) return null;
  const classes = teacher.classIds.size
    ? await prisma.class.findMany({ where: { schoolId, yearId, id: { in: [...teacher.classIds] } }, select: { id: true, name: true } })
    : [];
  const scope = { viewGrades: new Set<string>(), wholeGrades: new Set<string>(), pairs: new Set<string>() };
  for (const cls of classes) {
    scope.viewGrades.add(cls.name);
    if (teacher.wholeClassIds.has(cls.id)) scope.wholeGrades.add(cls.name);
  }
  // Exam-scope pairs are "classId:subjectId"; fold them into grade + subject.
  const gradeById = new Map(classes.map((c) => [c.id, c.name]));
  for (const pair of teacher.pairs) {
    const [classId, subjectId] = pair.split(":");
    const grade = gradeById.get(classId);
    if (grade) scope.pairs.add(gradeKey(grade, subjectId));
  }
  return scope;
}

export function canViewGrade(scope: SyllabusScope, gradeName: string) {
  return !scope || scope.viewGrades.has(gradeName);
}

export function canEditSyllabus(scope: SyllabusScope, gradeName: string, subjectId: string) {
  if (!scope) return true;
  return scope.wholeGrades.has(gradeName) || scope.pairs.has(gradeKey(gradeName, subjectId));
}

export function assertCanEditSyllabus(scope: SyllabusScope, gradeName: string, subjectId: string) {
  if (!canEditSyllabus(scope, gradeName, subjectId)) throw new ForbiddenException("You don't teach this subject in this class");
}
