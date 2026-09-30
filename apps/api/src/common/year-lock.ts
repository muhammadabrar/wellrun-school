import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

type YearLike = { name: string; status: string };

export function yearLockMessage(year: YearLike) {
  return `${year.name} is closed. Re-open it from Academic years to make changes.`;
}

/** Throws when the year is CLOSED. Payments and receipts deliberately skip this so old dues stay collectable. */
export function assertYearOpen(year: YearLike | null | undefined) {
  if (year?.status === "CLOSED") throw new ForbiddenException(yearLockMessage(year));
}

export async function assertYearWritable(prisma: PrismaService, schoolId: string, yearId: string | null | undefined) {
  if (!yearId) return;
  const year = await prisma.academicYear.findFirst({ where: { id: yearId, schoolId }, select: { name: true, status: true } });
  assertYearOpen(year);
}

/** Same check, reached through a class (attendance, enrollments, timetable, class subjects). */
export async function assertClassWritable(prisma: PrismaService, schoolId: string, classId: string | null | undefined) {
  if (!classId) return;
  const cls = await prisma.class.findFirst({ where: { id: classId, schoolId }, select: { year: { select: { name: true, status: true } } } });
  if (!cls) throw new NotFoundException("Class not found");
  assertYearOpen(cls.year);
}

/** Several classes at once — one query. */
export async function assertClassesWritable(prisma: PrismaService, schoolId: string, classIds: string[]) {
  const ids = [...new Set(classIds.filter(Boolean))];
  if (!ids.length) return;
  const closed = await prisma.class.findFirst({
    where: { id: { in: ids }, schoolId, year: { status: "CLOSED" } },
    select: { year: { select: { name: true, status: true } } },
  });
  assertYearOpen(closed?.year);
}

/** Exam-side lock: pass whichever reference the route has (year, exam, paper, term, correction or result ids). */
export async function assertExamYearOpen(
  prisma: PrismaService,
  schoolId: string,
  ref: { yearId?: string; examId?: string; paperIds?: string[]; termId?: string; correctionId?: string; resultIds?: string[] },
) {
  const or: Prisma.AcademicYearWhereInput[] = [];
  if (ref.yearId) or.push({ id: ref.yearId });
  if (ref.examId) or.push({ exams: { some: { id: ref.examId } } });
  if (ref.paperIds?.length) or.push({ exams: { some: { papers: { some: { id: { in: ref.paperIds } } } } } });
  if (ref.termId) or.push({ terms: { some: { id: ref.termId } } });
  if (ref.correctionId) or.push({ exams: { some: { papers: { some: { corrections: { some: { id: ref.correctionId } } } } } } });
  if (ref.resultIds?.length) or.push({ studentResults: { some: { id: { in: ref.resultIds } } } });
  if (!or.length) return;
  const closed = await prisma.academicYear.findFirst({ where: { schoolId, status: "CLOSED", OR: or }, select: { name: true, status: true } });
  assertYearOpen(closed);
}
