import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

type Db = PrismaService | Prisma.TransactionClient;

/**
 * Topics chosen for a paper must belong to the syllabus of that paper's grade and subject in the exam's year —
 * never another school's, year's, grade's or subject's. Returns the de-duplicated ids.
 */
export async function validateCoverage(
  db: Db,
  schoolId: string,
  ref: { yearId: string; gradeName: string; subjectId: string },
  topicIds: string[],
) {
  const ids = [...new Set(topicIds)];
  if (!ids.length) return ids;
  const found = await db.syllabusTopic.count({
    where: { id: { in: ids }, syllabus: { schoolId, yearId: ref.yearId, gradeName: ref.gradeName, subjectId: ref.subjectId } },
  });
  if (found !== ids.length) {
    throw new BadRequestException(`Some topics aren't part of the ${ref.gradeName} syllabus for this subject and academic year`);
  }
  return ids;
}

/** Replace what a paper covers. Topics it no longer covers are released (unlocked) unless another paper still uses them. */
export async function replaceCoverage(db: Prisma.TransactionClient, paperId: string, topicIds: string[]) {
  await db.examPaperTopic.deleteMany({ where: { paperId, topicId: { notIn: topicIds } } });
  if (topicIds.length) await db.examPaperTopic.createMany({ data: topicIds.map((topicId) => ({ paperId, topicId })), skipDuplicates: true });
}

/** Topics (by id) that any exam paper covers, with the exams that cover them. */
export async function topicUsage(db: Db, topicIds: string[]) {
  const usage = new Map<string, { examId: string; examName: string; kind: string; classes: string[] }[]>();
  if (!topicIds.length) return usage;
  const links = await db.examPaperTopic.findMany({
    where: { topicId: { in: topicIds } },
    select: {
      topicId: true,
      paper: { select: { class: { select: { name: true, section: true } }, exam: { select: { id: true, name: true, kind: true } } } },
    },
  });
  for (const link of links) {
    const list = usage.get(link.topicId) ?? [];
    const label = `${link.paper.class.name}${link.paper.class.section ? ` ${link.paper.class.section}` : ""}`;
    const existing = list.find((u) => u.examId === link.paper.exam.id);
    if (existing) existing.classes.push(label);
    else list.push({ examId: link.paper.exam.id, examName: link.paper.exam.name, kind: link.paper.exam.kind, classes: [label] });
    usage.set(link.topicId, list);
  }
  return usage;
}
