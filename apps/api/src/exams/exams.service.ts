import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ExamKind, Prisma, PrismaClient } from "@prisma/client";
import {
  examCreateSchema,
  examPaperInputSchema,
  examPaperUpdateSchema,
  examUpdateSchema,
  quickAssessmentSchema,
  scheduleGenerateSchema,
} from "@wellrun/shared";
import { z } from "zod";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import { assertWritableSchool } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanMarkPaper, canMarkPaper, type TeacherScope } from "./access";
import { autoSchedule, findClashes } from "./schedule.engine";

const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
export const classLabel = (c: { name: string; section: string }) => (c.section ? `${c.name} ${c.section}` : c.name);

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

export type ExamListQuery = { kind?: string; kinds?: string; termId?: string; status?: string; classId?: string; q?: string };

/** Keeps the exam's status in step with its papers: marking → completed. Published and manual states are kept. */
export async function syncExamStatus(tx: Tx, examId: string) {
  const exam = await tx.exam.findUnique({ where: { id: examId }, select: { status: true } });
  if (!exam || exam.status === "PUBLISHED") return;
  const papers = await tx.examPaper.findMany({ where: { examId }, select: { status: true } });
  if (!papers.length) return;
  const approved = papers.every((p) => p.status === "APPROVED");
  const started = papers.some((p) => p.status !== "NOT_STARTED");
  const next = approved ? "COMPLETED" : started ? "MARKING" : exam.status === "COMPLETED" || exam.status === "MARKING" ? "IN_PROGRESS" : exam.status;
  if (next !== exam.status) await tx.exam.update({ where: { id: examId }, data: { status: next } });
}

@Injectable()
export class ExamsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Everything the exam forms need in one call: terms, scales, classes with their subjects, staff. */
  async context(schoolId: string, yearId: string, scope: TeacherScope) {
    const [year, terms, scales, classes, subjects, staff] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: yearId, schoolId }, select: { id: true, name: true, startsOn: true, endsOn: true } }),
      this.prisma.term.findMany({ where: { schoolId, yearId }, orderBy: [{ sortOrder: "asc" }, { startsOn: "asc" }], select: { id: true, name: true, startsOn: true, endsOn: true, weight: true } }),
      this.prisma.gradingScale.findMany({ where: { schoolId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }], select: { id: true, name: true, isDefault: true } }),
      this.prisma.class.findMany({
        where: { schoolId, yearId, ...(scope ? { id: { in: [...scope.classIds] } } : {}) },
        orderBy: [{ name: "asc" }, { section: "asc" }],
        select: { id: true, name: true, section: true, campusId: true, subjects: { select: { subjectId: true } }, _count: { select: { enrollments: { where: { active: true } } } } },
      }),
      this.prisma.subject.findMany({ where: { schoolId, enabled: true }, orderBy: { name: "asc" }, select: { id: true, name: true, code: true } }),
      scope
        ? Promise.resolve([])
        : this.prisma.staff.findMany({ where: { schoolId, status: "ACTIVE" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    return {
      year,
      terms,
      gradingScales: scales,
      subjects,
      staff,
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        section: c.section,
        label: classLabel(c),
        campusId: c.campusId,
        students: c._count.enrollments,
        subjectIds: c.subjects
          .map((s) => s.subjectId)
          .filter((subjectId) => canMarkPaper(scope, { classId: c.id, subjectId })),
      })),
    };
  }

  async list(schoolId: string, yearId: string, query: ExamListQuery, scope: TeacherScope) {
    const kinds = (query.kinds ?? query.kind ?? "").split(",").filter(Boolean) as ExamKind[];
    const where: Prisma.ExamWhereInput = {
      schoolId,
      yearId,
      ...(kinds.length ? { kind: { in: kinds } } : {}),
      ...(query.termId ? { termId: query.termId } : {}),
      ...(query.status ? { status: query.status as Prisma.EnumExamStatusFilter["equals"] } : {}),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
      ...(query.classId || scope ? { papers: { some: { classId: query.classId ? query.classId : { in: [...(scope?.classIds ?? [])] } } } } : {}),
    };
    const exams = await this.prisma.exam.findMany({
      where,
      orderBy: [{ startsOn: "desc" }, { createdAt: "desc" }],
      take: 300,
      select: {
        id: true,
        name: true,
        code: true,
        kind: true,
        status: true,
        startsOn: true,
        endsOn: true,
        weight: true,
        publishedAt: true,
        term: { select: { id: true, name: true } },
        papers: {
          select: { id: true, status: true, classId: true, subjectId: true, maxMarks: true, class: { select: { name: true, section: true } }, subject: { select: { name: true } } },
        },
      },
    });
    return exams.map((exam) => {
      const papers = scope ? exam.papers.filter((p) => scope.classIds.has(p.classId)) : exam.papers;
      const counts = { NOT_STARTED: 0, DRAFT: 0, SUBMITTED: 0, RETURNED: 0, APPROVED: 0 } as Record<string, number>;
      papers.forEach((p) => (counts[p.status] += 1));
      const classNames = [...new Set(papers.map((p) => classLabel(p.class)))];
      const first = papers[0];
      return {
        id: exam.id,
        name: exam.name,
        code: exam.code,
        kind: exam.kind,
        status: exam.status,
        startsOn: isoDate(exam.startsOn),
        endsOn: isoDate(exam.endsOn),
        weight: exam.weight,
        publishedAt: exam.publishedAt,
        term: exam.term,
        classCount: classNames.length,
        classes: classNames.slice(0, 4),
        paperCount: papers.length,
        paperStatus: counts,
        /** For single-paper assessments the UI jumps straight to marks entry. */
        singlePaper:
          papers.length === 1 && first
            ? { id: first.id, subject: first.subject.name, className: classLabel(first.class), maxMarks: first.maxMarks, canMark: canMarkPaper(scope, first) }
            : null,
      };
    });
  }

  async detail(schoolId: string, id: string, scope: TeacherScope) {
    const exam = await this.prisma.exam.findFirst({
      where: { id, schoolId },
      include: {
        term: { select: { id: true, name: true } },
        gradingScale: { select: { id: true, name: true } },
        papers: {
          orderBy: [{ date: "asc" }, { startTime: "asc" }],
          include: {
            class: { select: { id: true, name: true, section: true } },
            subject: { select: { id: true, name: true } },
            invigilator: { select: { id: true, name: true } },
            _count: { select: { marks: true } },
          },
        },
      },
    });
    if (!exam) throw new NotFoundException("Exam not found");
    const papers = scope ? exam.papers.filter((p) => scope.classIds.has(p.classId)) : exam.papers;
    if (scope && !papers.length) throw new ForbiddenException("This exam has none of your classes");
    const strength = await this.classStrength(schoolId, [...new Set(papers.map((p) => p.classId))]);
    const rows = papers.map((p) => ({
      id: p.id,
      classId: p.classId,
      className: classLabel(p.class),
      grade: p.class.name,
      subjectId: p.subjectId,
      subjectName: p.subject.name,
      date: isoDate(p.date),
      startTime: p.startTime,
      endTime: p.endTime,
      room: p.room,
      invigilatorId: p.invigilatorId,
      invigilatorName: p.invigilator?.name ?? "",
      maxMarks: p.maxMarks,
      passMarks: p.passMarks,
      status: p.status,
      reviewNote: p.reviewNote,
      marksEntered: p._count.marks,
      students: strength.get(p.classId) ?? 0,
      canMark: canMarkPaper(scope, p),
    }));
    return {
      id: exam.id,
      name: exam.name,
      code: exam.code,
      kind: exam.kind,
      status: exam.status,
      startsOn: isoDate(exam.startsOn),
      endsOn: isoDate(exam.endsOn),
      weight: exam.weight,
      includeInReportCard: exam.includeInReportCard,
      instructions: exam.instructions,
      publishedAt: exam.publishedAt,
      yearId: exam.yearId,
      term: exam.term,
      gradingScale: exam.gradingScale,
      papers: rows,
      clashes: findClashes(rows),
    };
  }

  private async classStrength(schoolId: string, classIds: string[]) {
    if (!classIds.length) return new Map<string, number>();
    const groups = await this.prisma.enrollment.groupBy({ by: ["classId"], where: { schoolId, classId: { in: classIds }, active: true }, _count: { _all: true } });
    return new Map(groups.map((g) => [g.classId, g._count._all]));
  }

  /** Classes/subjects/term/scale/staff referenced by a payload must belong to this school and year. */
  private async assertRefs(
    schoolId: string,
    yearId: string,
    refs: { classIds: string[]; subjectIds: string[]; termId?: string | null; gradingScaleId?: string | null; staffIds?: string[] },
  ) {
    const [classes, subjects, term, scale, staff] = await Promise.all([
      this.prisma.class.count({ where: { schoolId, yearId, id: { in: refs.classIds } } }),
      this.prisma.subject.count({ where: { schoolId, id: { in: refs.subjectIds } } }),
      refs.termId ? this.prisma.term.count({ where: { schoolId, yearId, id: refs.termId } }) : Promise.resolve(1),
      refs.gradingScaleId ? this.prisma.gradingScale.count({ where: { schoolId, id: refs.gradingScaleId } }) : Promise.resolve(1),
      refs.staffIds?.length ? this.prisma.staff.count({ where: { schoolId, id: { in: refs.staffIds } } }) : Promise.resolve(0),
    ]);
    if (classes !== new Set(refs.classIds).size) throw new BadRequestException("Some classes are not in this academic year");
    if (subjects !== new Set(refs.subjectIds).size) throw new BadRequestException("Some subjects were not found");
    if (!term) throw new BadRequestException("Term is not in this academic year");
    if (!scale) throw new BadRequestException("Grading scale not found");
    if (refs.staffIds?.length && staff !== new Set(refs.staffIds).size) throw new BadRequestException("Invigilator not found");
  }

  private paperData(schoolId: string, p: z.infer<typeof examPaperInputSchema>) {
    return {
      schoolId,
      classId: p.classId,
      subjectId: p.subjectId,
      maxMarks: p.maxMarks,
      passMarks: p.passMarks,
      date: p.date ? dateOnly(p.date) : null,
      startTime: p.startTime ?? "",
      endTime: p.endTime ?? "",
      room: p.room ?? "",
      invigilatorId: p.invigilatorId || null,
    };
  }

  async create(schoolId: string, user: CurrentUser, yearId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = examCreateSchema.parse(body);
    const seen = new Set<string>();
    const papers = data.papers.filter((p) => {
      const key = `${p.classId}:${p.subjectId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    await this.assertRefs(schoolId, yearId, {
      classIds: papers.map((p) => p.classId),
      subjectIds: papers.map((p) => p.subjectId),
      termId: data.termId,
      gradingScaleId: data.gradingScaleId,
      staffIds: papers.map((p) => p.invigilatorId).filter((v): v is string => Boolean(v)),
    });
    const scheduled = papers.some((p) => p.date);
    const exam = await this.prisma.exam.create({
      data: {
        schoolId,
        yearId,
        kind: data.kind,
        name: data.name,
        code: data.code,
        termId: data.termId || null,
        gradingScaleId: data.gradingScaleId || null,
        startsOn: dateOnly(data.startsOn),
        endsOn: dateOnly(data.endsOn),
        weight: data.weight,
        includeInReportCard: data.includeInReportCard,
        instructions: data.instructions,
        status: data.publishSchedule || scheduled ? "SCHEDULED" : "DRAFT",
        createdById: user.id,
        papers: { create: papers.map((p) => this.paperData(schoolId, p)) },
      },
      select: { id: true, name: true },
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "exam_created", entity: "exam", entityId: exam.id, summary: `${exam.name} (${papers.length} papers)` });
    return exam;
  }

  /** A quiz / assignment / practical / viva for one class and subject — ready for marks straight away. */
  async quickAssessment(schoolId: string, user: CurrentUser, yearId: string, body: unknown, scope: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = quickAssessmentSchema.parse(body);
    assertCanMarkPaper(scope, data);
    await this.assertRefs(schoolId, yearId, { classIds: [data.classId], subjectIds: [data.subjectId], termId: data.termId });
    const termId = data.termId || (await this.termForDate(schoolId, yearId, data.date));
    const passMarks = data.passMarks ?? Math.round(data.maxMarks * 0.33 * 10) / 10;
    const exam = await this.prisma.exam.create({
      data: {
        schoolId,
        yearId,
        termId,
        kind: data.kind,
        name: data.name,
        startsOn: dateOnly(data.date),
        endsOn: dateOnly(data.date),
        weight: data.weight,
        instructions: data.instructions,
        status: "IN_PROGRESS",
        createdById: user.id,
        papers: { create: { schoolId, classId: data.classId, subjectId: data.subjectId, maxMarks: data.maxMarks, passMarks, date: dateOnly(data.date) } },
      },
      select: { id: true, name: true, papers: { select: { id: true } } },
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "assessment_created", entity: "exam", entityId: exam.id, summary: `${data.kind}: ${exam.name}` });
    return { id: exam.id, name: exam.name, paperId: exam.papers[0].id };
  }

  private async termForDate(schoolId: string, yearId: string, date: string) {
    const day = dateOnly(date);
    const term = await this.prisma.term.findFirst({ where: { schoolId, yearId, startsOn: { lte: day }, endsOn: { gte: day } }, select: { id: true } });
    return term?.id ?? null;
  }

  private async ownedExam(schoolId: string, id: string) {
    const exam = await this.prisma.exam.findFirst({ where: { id, schoolId } });
    if (!exam) throw new NotFoundException("Exam not found");
    return exam;
  }

  async update(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const exam = await this.ownedExam(schoolId, id);
    const data = examUpdateSchema.parse(body);
    if (data.termId || data.gradingScaleId) {
      await this.assertRefs(schoolId, exam.yearId, { classIds: [], subjectIds: [], termId: data.termId, gradingScaleId: data.gradingScaleId });
    }
    if (data.status === "PUBLISHED") throw new BadRequestException("Publish results from the Results page");
    const updated = await this.prisma.exam.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.code !== undefined ? { code: data.code } : {}),
        ...(data.termId !== undefined ? { termId: data.termId || null } : {}),
        ...(data.gradingScaleId !== undefined ? { gradingScaleId: data.gradingScaleId || null } : {}),
        ...(data.startsOn ? { startsOn: dateOnly(data.startsOn) } : {}),
        ...(data.endsOn ? { endsOn: dateOnly(data.endsOn) } : {}),
        ...(data.weight !== undefined ? { weight: data.weight } : {}),
        ...(data.includeInReportCard !== undefined ? { includeInReportCard: data.includeInReportCard } : {}),
        ...(data.instructions !== undefined ? { instructions: data.instructions } : {}),
        ...(data.status ? { status: data.status } : {}),
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "exam_updated", entity: "exam", entityId: id });
    return updated;
  }

  async remove(schoolId: string, actorId: string, id: string, scope: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const exam = await this.prisma.exam.findFirst({ where: { id, schoolId }, include: { papers: { select: { classId: true, subjectId: true, status: true } } } });
    if (!exam) throw new NotFoundException("Exam not found");
    if (scope) {
      if (exam.kind === "EXAM" || exam.createdById === null) throw new ForbiddenException("Only admins can delete exams");
      exam.papers.forEach((p) => assertCanMarkPaper(scope, p));
    }
    if (exam.status === "PUBLISHED") throw new BadRequestException("Unpublish results before deleting this exam");
    if (exam.papers.some((p) => p.status === "APPROVED")) throw new BadRequestException("Approved marks exist — this exam can't be deleted");
    await this.prisma.exam.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "exam_deleted", entity: "exam", entityId: id, summary: exam.name });
    return { ok: true };
  }

  /** Copy classes, subjects and marks setup into a new draft (e.g. Mid Term → Final Term). */
  async duplicate(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const input = z.object({ name: z.string().trim().min(1), startsOn: z.string().min(10), endsOn: z.string().min(10), termId: z.string().nullable().optional() }).parse(body);
    const exam = await this.prisma.exam.findFirst({ where: { id, schoolId }, include: { papers: true } });
    if (!exam) throw new NotFoundException("Exam not found");
    const copy = await this.prisma.exam.create({
      data: {
        schoolId,
        yearId: exam.yearId,
        termId: input.termId === undefined ? exam.termId : input.termId,
        gradingScaleId: exam.gradingScaleId,
        kind: exam.kind,
        name: input.name,
        startsOn: dateOnly(input.startsOn),
        endsOn: dateOnly(input.endsOn),
        weight: exam.weight,
        includeInReportCard: exam.includeInReportCard,
        instructions: exam.instructions,
        createdById: actorId,
        papers: { create: exam.papers.map((p) => ({ schoolId, classId: p.classId, subjectId: p.subjectId, maxMarks: p.maxMarks, passMarks: p.passMarks, room: p.room, invigilatorId: p.invigilatorId })) },
      },
      select: { id: true, name: true },
    });
    await audit(this.prisma, { schoolId, actorId, action: "exam_duplicated", entity: "exam", entityId: copy.id, summary: `from ${exam.name}` });
    return copy;
  }

  async addPapers(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const exam = await this.ownedExam(schoolId, id);
    const papers = z.object({ papers: z.array(examPaperInputSchema).min(1) }).parse(body).papers;
    await this.assertRefs(schoolId, exam.yearId, { classIds: papers.map((p) => p.classId), subjectIds: papers.map((p) => p.subjectId) });
    const result = await this.prisma.examPaper.createMany({ data: papers.map((p) => ({ ...this.paperData(schoolId, p), examId: id })), skipDuplicates: true });
    await audit(this.prisma, { schoolId, actorId, action: "exam_papers_added", entity: "exam", entityId: id, summary: `${result.count} papers` });
    return { added: result.count };
  }

  async updatePaper(schoolId: string, actorId: string, paperId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = examPaperUpdateSchema.parse(body);
    const paper = await this.prisma.examPaper.findFirst({ where: { id: paperId, schoolId } });
    if (!paper) throw new NotFoundException("Paper not found");
    const maxMarks = data.maxMarks ?? paper.maxMarks;
    const passMarks = data.passMarks ?? paper.passMarks;
    if (passMarks > maxMarks) throw new BadRequestException("Pass marks exceed max marks");
    if (data.maxMarks !== undefined && data.maxMarks !== paper.maxMarks && paper.status === "APPROVED") {
      throw new BadRequestException("Marks are approved — max marks can't change");
    }
    if (data.maxMarks !== undefined) {
      const over = await this.prisma.examMark.count({ where: { paperId, marks: { gt: data.maxMarks } } });
      if (over) throw new BadRequestException(`${over} students already scored above ${data.maxMarks}`);
    }
    if (data.invigilatorId) {
      const staff = await this.prisma.staff.count({ where: { schoolId, id: data.invigilatorId } });
      if (!staff) throw new BadRequestException("Invigilator not found");
    }
    const updated = await this.prisma.examPaper.update({
      where: { id: paperId },
      data: {
        ...(data.date !== undefined ? { date: data.date ? dateOnly(data.date) : null } : {}),
        ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
        ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
        ...(data.room !== undefined ? { room: data.room } : {}),
        ...(data.invigilatorId !== undefined ? { invigilatorId: data.invigilatorId || null } : {}),
        maxMarks,
        passMarks,
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "exam_paper_updated", entity: "exam_paper", entityId: paperId });
    return updated;
  }

  async removePaper(schoolId: string, actorId: string, paperId: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const paper = await this.prisma.examPaper.findFirst({ where: { id: paperId, schoolId }, include: { _count: { select: { marks: true } } } });
    if (!paper) throw new NotFoundException("Paper not found");
    if (paper._count.marks) throw new BadRequestException("Marks were entered for this paper — it can't be removed");
    await this.prisma.examPaper.delete({ where: { id: paperId } });
    await audit(this.prisma, { schoolId, actorId, action: "exam_paper_removed", entity: "exam", entityId: paper.examId });
    return { ok: true };
  }

  /** Auto-builds the date sheet for every paper of the exam. */
  async generateSchedule(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const options = scheduleGenerateSchema.parse(body);
    const exam = await this.prisma.exam.findFirst({
      where: { id, schoolId },
      include: { papers: { select: { id: true, classId: true, subjectId: true, class: { select: { name: true } }, subject: { select: { name: true } } } } },
    });
    if (!exam) throw new NotFoundException("Exam not found");
    const { slots, lastDay } = autoSchedule(
      exam.papers.map((p) => ({ id: p.id, classId: p.classId, grade: p.class.name, subjectId: p.subjectId, subjectName: p.subject.name })),
      options,
    );
    await this.prisma.$transaction([
      ...[...slots].map(([paperId, slot]) =>
        this.prisma.examPaper.update({ where: { id: paperId }, data: { date: dateOnly(slot.date), startTime: slot.startTime, endTime: slot.endTime } }),
      ),
      this.prisma.exam.update({
        where: { id },
        data: { startsOn: dateOnly(options.startsOn), endsOn: dateOnly(lastDay), ...(exam.status === "DRAFT" ? { status: "SCHEDULED" } : {}) },
      }),
    ]);
    await audit(this.prisma, { schoolId, actorId, action: "exam_schedule_generated", entity: "exam", entityId: id });
    return { scheduled: slots.size, endsOn: lastDay };
  }

  async calendar(schoolId: string, yearId: string, query: { from?: string; to?: string; classId?: string }, scope: TeacherScope) {
    const from = query.from ? dateOnly(query.from) : undefined;
    const to = query.to ? dateOnly(query.to) : undefined;
    const papers = await this.prisma.examPaper.findMany({
      where: {
        schoolId,
        exam: { yearId },
        date: { not: null, ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) },
        ...(query.classId ? { classId: query.classId } : scope ? { classId: { in: [...scope.classIds] } } : {}),
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: 2000,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        room: true,
        status: true,
        class: { select: { name: true, section: true } },
        subject: { select: { name: true } },
        exam: { select: { id: true, name: true, kind: true } },
      },
    });
    return papers.map((p) => ({
      id: p.id,
      date: isoDate(p.date),
      startTime: p.startTime,
      endTime: p.endTime,
      room: p.room,
      status: p.status,
      className: classLabel(p.class),
      subject: p.subject.name,
      examId: p.exam.id,
      examName: p.exam.name,
      kind: p.exam.kind,
    }));
  }

  async dashboard(schoolId: string, yearId: string, scope: TeacherScope) {
    const today = dateOnly(new Date().toISOString());
    const inWeeks = new Date(today.getTime() + 21 * 86400000);
    const classFilter = scope ? { classId: { in: [...scope.classIds] } } : {};
    const [upcoming, statusGroups, activeExams, corrections, published, examCount] = await Promise.all([
      this.prisma.examPaper.findMany({
        where: { schoolId, exam: { yearId }, date: { gte: today, lte: inWeeks }, ...classFilter },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
        take: 12,
        select: { id: true, date: true, startTime: true, class: { select: { name: true, section: true } }, subject: { select: { name: true } }, exam: { select: { id: true, name: true, kind: true } } },
      }),
      this.prisma.examPaper.groupBy({ by: ["status"], where: { schoolId, exam: { yearId }, ...classFilter }, _count: { _all: true } }),
      this.prisma.exam.findMany({
        where: { schoolId, yearId, kind: "EXAM", status: { in: ["SCHEDULED", "IN_PROGRESS", "MARKING", "COMPLETED"] } },
        orderBy: { startsOn: "desc" },
        take: 6,
        select: { id: true, name: true, status: true, startsOn: true, endsOn: true, papers: { select: { status: true, classId: true } } },
      }),
      scope ? Promise.resolve(0) : this.prisma.markCorrection.count({ where: { schoolId, status: "PENDING" } }),
      this.prisma.exam.findMany({
        where: { schoolId, yearId, status: "PUBLISHED" },
        orderBy: { publishedAt: "desc" },
        take: 5,
        select: { id: true, name: true, kind: true, publishedAt: true },
      }),
      this.prisma.exam.count({ where: { schoolId, yearId } }),
    ]);
    const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Record<string, number>;
    let myPapers: { toMark: number } | null = null;
    if (scope) {
      const open = await this.prisma.examPaper.findMany({
        where: { schoolId, exam: { yearId }, status: { in: ["NOT_STARTED", "DRAFT", "RETURNED"] }, ...classFilter },
        select: { classId: true, subjectId: true },
      });
      myPapers = { toMark: open.filter((p) => canMarkPaper(scope, p)).length };
    }
    return {
      examCount,
      upcoming: upcoming.map((p) => ({ id: p.id, date: isoDate(p.date), startTime: p.startTime, className: classLabel(p.class), subject: p.subject.name, exam: p.exam })),
      papers: {
        notStarted: byStatus.NOT_STARTED ?? 0,
        draft: byStatus.DRAFT ?? 0,
        submitted: byStatus.SUBMITTED ?? 0,
        returned: byStatus.RETURNED ?? 0,
        approved: byStatus.APPROVED ?? 0,
      },
      pendingCorrections: corrections,
      myPapers,
      activeExams: activeExams.map((e) => {
        const papers = scope ? e.papers.filter((p) => scope.classIds.has(p.classId)) : e.papers;
        return {
          id: e.id,
          name: e.name,
          status: e.status,
          startsOn: isoDate(e.startsOn),
          endsOn: isoDate(e.endsOn),
          total: papers.length,
          approved: papers.filter((p) => p.status === "APPROVED").length,
          submitted: papers.filter((p) => p.status === "SUBMITTED").length,
        };
      }),
      published: published.map((e) => ({ ...e, publishedAt: e.publishedAt })),
    };
  }
}
