import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, QuestionType } from "@prisma/client";
import {
  classSortIndex,
  normalizeQuestion,
  paginate,
  paperMarks,
  questionOrderSchema,
  questionPaperCreateSchema,
  questionPaperPrintSchema,
  questionPaperReopenSchema,
  questionPaperReviewSchema,
  questionPaperUpdateSchema,
  questionSectionSchema,
  questionSectionUpdateSchema,
  questionUpdateSchema,
  questionsCreateSchema,
  sectionMarks,
  validatePaper,
  type PaperIssue,
  type PaperSection,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import { assertWritableSchool, schoolLetterhead } from "../common/school";
import { assertYearWritable } from "../common/year-lock";
import type { TeacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanEditSyllabus, canEditSyllabus, syllabusScope } from "../syllabus/access";

const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const classLabel = (c: { name: string; section: string }) => (c.section ? `${c.name} ${c.section}` : c.name);


export type QuestionPaperListQuery = { examId?: string; status?: string; q?: string; page?: string; pageSize?: string };

@Injectable()
export class QuestionPapersService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Helpers -----------------------------------------------------------------------------------------------------

  private isAdmin(user: CurrentUser) {
    return user.role === "SCHOOL_ADMIN";
  }

  private async scopeFor(schoolId: string, yearId: string, teacher: TeacherScope) {
    return syllabusScope(this.prisma, schoolId, yearId, teacher);
  }

  /** The exam papers (one per section of the grade) this question paper is sat on. */
  private async slotsFor(schoolId: string, examId: string, gradeName: string, subjectId: string) {
    const papers = await this.prisma.examPaper.findMany({
      where: { schoolId, examId, subjectId, class: { name: gradeName } },
      orderBy: [{ class: { section: "asc" } }],
      select: {
        id: true,
        classId: true,
        date: true,
        startTime: true,
        endTime: true,
        room: true,
        maxMarks: true,
        class: { select: { name: true, section: true } },
        topics: { select: { topic: { select: { title: true, unit: { select: { title: true, sortOrder: true } } } } } },
      },
    });
    const strength = papers.length
      ? await this.prisma.enrollment.groupBy({ by: ["classId"], where: { schoolId, active: true, classId: { in: papers.map((p) => p.classId) } }, _count: { _all: true } })
      : [];
    const students = new Map(strength.map((g) => [g.classId, g._count._all]));
    return papers.map((p) => ({
      paperId: p.id,
      classId: p.classId,
      label: classLabel(p.class),
      date: isoDate(p.date),
      startTime: p.startTime,
      endTime: p.endTime,
      room: p.room,
      maxMarks: p.maxMarks,
      students: students.get(p.classId) ?? 0,
      topics: p.topics.map((t) => ({ title: t.topic.title, unit: t.topic.unit.title, unitOrder: t.topic.unit.sortOrder })),
    }));
  }

  private expectedFrom(slots: { maxMarks: number }[]) {
    const distinct = [...new Set(slots.map((s) => s.maxMarks))];
    return { expectedMarks: distinct.length === 1 ? distinct[0] : null, mixed: distinct.length > 1 };
  }

  private toSections(
    sections: { id: string; title: string; type: QuestionType; attemptCount: number | null; passage: string; questions: { id: string; text: string; marks: number; options: Prisma.JsonValue; answer: string }[] }[],
  ): PaperSection[] {
    return sections.map((s) => ({ id: s.id, title: s.title, type: s.type, passage: s.passage, attemptCount: s.attemptCount, questions: s.questions.map((q) => ({ id: q.id, text: q.text, marks: q.marks, options: q.options, answer: q.answer })) }));
  }

  /** Total marks are stored on the paper so lists don't have to load every question. */
  private async recalc(tx: Prisma.TransactionClient | PrismaService, paperId: string, actorId?: string) {
    const sections = await tx.questionSection.findMany({ where: { paperId }, select: { attemptCount: true, questions: { select: { marks: true } } } });
    await tx.questionPaper.update({ where: { id: paperId }, data: { totalMarks: paperMarks(sections), ...(actorId ? { updatedById: actorId } : {}) }, select: { id: true } });
  }

  /** Who may change a paper, and whether its status allows it. Approved papers are locked until an admin reopens them. */
  private async editable(schoolId: string, paperId: string, user: CurrentUser, teacher: TeacherScope) {
    const paper = await this.prisma.questionPaper.findFirst({
      where: { id: paperId, schoolId },
      select: { id: true, status: true, gradeName: true, subjectId: true, exam: { select: { yearId: true } } },
    });
    if (!paper) throw new NotFoundException("Question paper not found");
    await assertYearWritable(this.prisma, schoolId, paper.exam.yearId);
    assertCanEditSyllabus(await this.scopeFor(schoolId, paper.exam.yearId, teacher), paper.gradeName, paper.subjectId);
    if (paper.status === "APPROVED") throw new BadRequestException("This paper is approved and locked. An admin can reopen it if it needs to change.");
    if (paper.status === "SUBMITTED" && !this.isAdmin(user)) throw new BadRequestException("This paper was submitted and is waiting for approval. Ask an admin to return it if you need to change it.");
    return paper;
  }

  private async sectionForWrite(schoolId: string, sectionId: string, user: CurrentUser, teacher: TeacherScope) {
    const section = await this.prisma.questionSection.findFirst({ where: { id: sectionId, paper: { schoolId } }, select: { id: true, paperId: true, type: true, title: true } });
    if (!section) throw new NotFoundException("Section not found");
    await this.editable(schoolId, section.paperId, user, teacher);
    return section;
  }

  private async questionForWrite(schoolId: string, questionId: string, user: CurrentUser, teacher: TeacherScope) {
    const question = await this.prisma.question.findFirst({
      where: { id: questionId, section: { paper: { schoolId } } },
      select: { id: true, text: true, marks: true, options: true, answer: true, answerLines: true, sectionId: true, section: { select: { paperId: true, type: true } } },
    });
    if (!question) throw new NotFoundException("Question not found");
    await this.editable(schoolId, question.section.paperId, user, teacher);
    return question;
  }

  // Reading -------------------------------------------------------------------------------------------------------

  /** Question papers of the year. Teachers see only the class + subject they teach (papers are confidential). */
  async list(schoolId: string, yearId: string, query: QuestionPaperListQuery, teacher: TeacherScope) {
    const scope = await this.scopeFor(schoolId, yearId, teacher);
    const rows = await this.prisma.questionPaper.findMany({
      where: {
        schoolId,
        exam: { yearId },
        ...(query.examId ? { examId: query.examId } : {}),
        ...(query.q ? { OR: [{ title: { contains: query.q, mode: "insensitive" } }, { gradeName: { contains: query.q, mode: "insensitive" } }, { subject: { name: { contains: query.q, mode: "insensitive" } } }, { exam: { name: { contains: query.q, mode: "insensitive" } } }] } : {}),
      },
      select: {
        id: true,
        title: true,
        gradeName: true,
        subjectId: true,
        status: true,
        totalMarks: true,
        durationMinutes: true,
        updatedAt: true,
        submittedAt: true,
        reviewNote: true,
        exam: { select: { id: true, name: true, kind: true, startsOn: true } },
        subject: { select: { name: true } },
        sections: { select: { _count: { select: { questions: true } } } },
        prints: { select: { copies: true } },
      },
    });
    const visible = rows
      .filter((r) => canEditSyllabus(scope, r.gradeName, r.subjectId))
      .map((r) => ({
        id: r.id,
        title: r.title,
        gradeName: r.gradeName,
        subject: { id: r.subjectId, name: r.subject.name },
        exam: { id: r.exam.id, name: r.exam.name, kind: r.exam.kind, startsOn: isoDate(r.exam.startsOn) },
        status: r.status,
        totalMarks: r.totalMarks,
        durationMinutes: r.durationMinutes,
        sections: r.sections.length,
        questions: r.sections.reduce((n, s) => n + s._count.questions, 0),
        printed: r.prints.reduce((n, p) => n + p.copies, 0),
        reviewNote: r.reviewNote,
        updatedAt: r.updatedAt,
        submittedAt: r.submittedAt,
        sortKey: r.exam.startsOn.getTime(),
      }));
    const statusCounts: Record<string, number> = {};
    visible.forEach((r) => (statusCounts[r.status] = (statusCounts[r.status] ?? 0) + 1));
    const filtered = (query.status ? visible.filter((r) => r.status === query.status) : visible).sort(
      (a, b) => b.sortKey - a.sortKey || classSortIndex(a.gradeName) - classSortIndex(b.gradeName) || a.subject.name.localeCompare(b.subject.name),
    );
    return { ...paginate(filtered.map(({ sortKey: _k, ...rest }) => rest), query, 25), statusCounts };
  }

  /** Papers still to be written: upcoming exams' class + subject with no question paper yet. */
  async todo(schoolId: string, yearId: string, teacher: TeacherScope) {
    const scope = await this.scopeFor(schoolId, yearId, teacher);
    const papers = await this.prisma.examPaper.findMany({
      where: { schoolId, exam: { yearId, kind: "EXAM", status: { in: ["DRAFT", "SCHEDULED", "IN_PROGRESS"] } }, status: "NOT_STARTED" },
      orderBy: [{ date: "asc" }],
      take: 2000,
      select: { id: true, subjectId: true, date: true, class: { select: { name: true } }, subject: { select: { name: true } }, exam: { select: { id: true, name: true } } },
    });
    const existing = await this.prisma.questionPaper.findMany({ where: { schoolId, exam: { yearId } }, select: { examId: true, gradeName: true, subjectId: true } });
    const have = new Set(existing.map((e) => `${e.examId}|${e.gradeName}|${e.subjectId}`));
    const seen = new Set<string>();
    const out: { examPaperId: string; examId: string; examName: string; gradeName: string; subject: string; date: string | null }[] = [];
    for (const p of papers) {
      const key = `${p.exam.id}|${p.class.name}|${p.subjectId}`;
      if (have.has(key) || seen.has(key) || !canEditSyllabus(scope, p.class.name, p.subjectId)) continue;
      seen.add(key);
      out.push({ examPaperId: p.id, examId: p.exam.id, examName: p.exam.name, gradeName: p.class.name, subject: p.subject.name, date: isoDate(p.date) });
    }
    return out
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || classSortIndex(a.gradeName) - classSortIndex(b.gradeName))
      .slice(0, 100);
  }

  async detail(schoolId: string, id: string, user: CurrentUser, teacher: TeacherScope) {
    const paper = await this.prisma.questionPaper.findFirst({
      where: { id, schoolId },
      include: {
        exam: { select: { id: true, name: true, kind: true, status: true, yearId: true, startsOn: true, endsOn: true, year: { select: { name: true, status: true } } } },
        subject: { select: { id: true, name: true } },
        sections: { orderBy: { sortOrder: "asc" }, include: { questions: { orderBy: { sortOrder: "asc" } } } },
      },
    });
    if (!paper) throw new NotFoundException("Question paper not found");
    const scope = await this.scopeFor(schoolId, paper.exam.yearId, teacher);
    if (!canEditSyllabus(scope, paper.gradeName, paper.subjectId)) throw new ForbiddenException("You don't teach this subject in this class");
    const admin = this.isAdmin(user);
    const [slots, school, prints, people] = await Promise.all([
      this.slotsFor(schoolId, paper.examId, paper.gradeName, paper.subjectId),
      schoolLetterhead(this.prisma, schoolId),
      admin ? this.prisma.questionPaperPrint.findMany({ where: { paperId: id }, orderBy: { createdAt: "desc" }, take: 30 }) : Promise.resolve([]),
      this.prisma.user.findMany({ where: { id: { in: [paper.createdById, paper.reviewedById].filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true } }),
    ]);
    const { expectedMarks, mixed } = this.expectedFrom(slots);
    const sections = this.toSections(paper.sections);
    const { issues } = validatePaper(sections, expectedMarks);
    if (mixed) issues.push({ message: "The sections of this grade have different max marks for this subject — set them the same in the exam first" });
    const yearClosed = paper.exam.year.status === "CLOSED";
    const editableStatus = paper.status === "DRAFT" || paper.status === "RETURNED" || (admin && paper.status === "SUBMITTED");
    const canEdit = !yearClosed && editableStatus;
    const names = new Map(people.map((p) => [p.id, p.name]));
    const topics = [...new Map(slots.flatMap((s) => s.topics).map((t) => [`${t.unit}|${t.title}`, t])).values()].sort((a, b) => a.unitOrder - b.unitOrder);
    return {
      id: paper.id,
      status: paper.status,
      title: paper.title,
      instructions: paper.instructions,
      durationMinutes: paper.durationMinutes,
      totalMarks: paper.totalMarks,
      reviewNote: paper.reviewNote,
      submittedAt: paper.submittedAt,
      reviewedAt: paper.reviewedAt,
      createdBy: names.get(paper.createdById ?? "") ?? "",
      reviewedBy: names.get(paper.reviewedById ?? "") ?? "",
      exam: { id: paper.exam.id, name: paper.exam.name, kind: paper.exam.kind, startsOn: isoDate(paper.exam.startsOn), endsOn: isoDate(paper.exam.endsOn), yearName: paper.exam.year.name },
      gradeName: paper.gradeName,
      subject: paper.subject,
      school,
      slots: slots.map(({ topics: _t, ...slot }) => slot),
      expectedMarks,
      syllabus: topics.map((t) => ({ title: t.title, unit: t.unit })),
      sections: paper.sections.map((s) => ({
        id: s.id,
        title: s.title,
        type: s.type,
        instructions: s.instructions,
        passage: s.passage,
        rtl: s.rtl,
        attemptCount: s.attemptCount,
        sortOrder: s.sortOrder,
        marks: sectionMarks({ attemptCount: s.attemptCount, questions: s.questions }),
        questions: s.questions.map((q) => ({ id: q.id, text: q.text, marks: q.marks, options: q.options, answer: q.answer, answerLines: q.answerLines, sortOrder: q.sortOrder })),
      })),
      issues,
      permissions: {
        canEdit,
        canSubmit: !yearClosed && (paper.status === "DRAFT" || paper.status === "RETURNED"),
        canReview: admin && !yearClosed && paper.status === "SUBMITTED",
        canReopen: admin && !yearClosed && paper.status === "APPROVED",
        canPrint: admin && paper.status === "APPROVED",
        canDelete: !yearClosed && (paper.status !== "APPROVED" || (admin && prints.length === 0)),
        readOnlyReason: yearClosed
          ? `${paper.exam.year.name} is closed, so this paper is read-only.`
          : canEdit
            ? null
            : paper.status === "APPROVED"
              ? "Approved and locked. An admin can reopen it to make changes."
              : paper.status === "SUBMITTED"
                ? "Submitted and waiting for admin approval."
                : null,
      },
      prints: admin
        ? {
            total: prints.reduce((n, p) => n + p.copies, 0),
            recent: prints.map((p) => ({ id: p.id, classLabel: p.classLabel, copies: p.copies, answerKey: p.answerKey, createdAt: p.createdAt })),
          }
        : null,
    };
  }

  // Creating and changing the paper ------------------------------------------------------------------------------------

  async create(schoolId: string, user: CurrentUser, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = questionPaperCreateSchema.parse(body);
    const slot = await this.prisma.examPaper.findFirst({
      where: { id: data.examPaperId, schoolId },
      select: { subjectId: true, startTime: true, endTime: true, examId: true, class: { select: { name: true } }, subject: { select: { name: true } }, exam: { select: { name: true, yearId: true } } },
    });
    if (!slot) throw new NotFoundException("Exam paper not found");
    await assertYearWritable(this.prisma, schoolId, slot.exam.yearId);
    assertCanEditSyllabus(await this.scopeFor(schoolId, slot.exam.yearId, teacher), slot.class.name, slot.subjectId);

    const existing = await this.prisma.questionPaper.findUnique({ where: { examId_gradeName_subjectId: { examId: slot.examId, gradeName: slot.class.name, subjectId: slot.subjectId } }, select: { id: true } });
    if (existing) return { id: existing.id, existed: true };

    const source = data.copyFromId
      ? await this.prisma.questionPaper.findFirst({
          where: { id: data.copyFromId, schoolId },
          select: { gradeName: true, subjectId: true, instructions: true, durationMinutes: true, sections: { orderBy: { sortOrder: "asc" }, include: { questions: { orderBy: { sortOrder: "asc" } } } } },
        })
      : null;
    if (data.copyFromId) {
      if (!source) throw new NotFoundException("The paper to copy from was not found");
      assertCanEditSyllabus(await this.scopeFor(schoolId, slot.exam.yearId, teacher), source.gradeName, source.subjectId);
    }
    const minutes = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const duration = source?.durationMinutes ?? (slot.startTime && slot.endTime && minutes(slot.endTime) > minutes(slot.startTime) ? minutes(slot.endTime) - minutes(slot.startTime) : 60);

    const created = await this.prisma.$transaction(async (tx) => {
      const paper = await tx.questionPaper.create({
        data: {
          schoolId,
          examId: slot.examId,
          gradeName: slot.class.name,
          subjectId: slot.subjectId,
          title: `${slot.exam.name} — ${slot.subject.name}`,
          instructions: source?.instructions ?? "",
          durationMinutes: duration,
          createdById: user.id,
          updatedById: user.id,
        },
        select: { id: true },
      });
      for (const [i, s] of (source?.sections ?? []).entries()) {
        await tx.questionSection.create({
          data: {
            paperId: paper.id,
            title: s.title,
            type: s.type,
            instructions: s.instructions,
            passage: s.passage,
            rtl: s.rtl,
            attemptCount: s.attemptCount,
            sortOrder: i,
            questions: { create: s.questions.map((q, qi) => ({ text: q.text, marks: q.marks, options: q.options as Prisma.InputJsonValue, answer: q.answer, answerLines: q.answerLines, sortOrder: qi })) },
          },
        });
      }
      if (source) await this.recalc(tx, paper.id);
      return paper;
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "question_paper_created", entity: "question_paper", entityId: created.id, summary: `${slot.exam.name} · ${slot.class.name} ${slot.subject.name}${source ? " (copied)" : ""}` });
    return { id: created.id, existed: false };
  }

  async update(schoolId: string, user: CurrentUser, id: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = questionPaperUpdateSchema.parse(body);
    await this.editable(schoolId, id, user, teacher);
    await this.prisma.questionPaper.update({ where: { id }, data: { ...data, updatedById: user.id }, select: { id: true } });
    return { ok: true };
  }

  async remove(schoolId: string, user: CurrentUser, id: string, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const paper = await this.prisma.questionPaper.findFirst({ where: { id, schoolId }, select: { id: true, status: true, title: true, gradeName: true, subjectId: true, exam: { select: { yearId: true } }, _count: { select: { prints: true } } } });
    if (!paper) throw new NotFoundException("Question paper not found");
    await assertYearWritable(this.prisma, schoolId, paper.exam.yearId);
    assertCanEditSyllabus(await this.scopeFor(schoolId, paper.exam.yearId, teacher), paper.gradeName, paper.subjectId);
    if (paper.status === "APPROVED" && (!this.isAdmin(user) || paper._count.prints > 0)) throw new BadRequestException("Approved papers can't be deleted once approved or printed.");
    if (paper.status === "SUBMITTED" && !this.isAdmin(user)) throw new BadRequestException("This paper is waiting for approval and can't be deleted.");
    await this.prisma.questionPaper.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "question_paper_deleted", entity: "question_paper", entityId: id, summary: paper.title });
    return { ok: true };
  }

  // Sections and questions ------------------------------------------------------------------------------------------------

  async createSection(schoolId: string, user: CurrentUser, paperId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = questionSectionSchema.parse(body);
    await this.editable(schoolId, paperId, user, teacher);
    const last = await this.prisma.questionSection.aggregate({ where: { paperId }, _max: { sortOrder: true } });
    const section = await this.prisma.questionSection.create({
      data: { paperId, title: data.title, type: data.type, instructions: data.instructions, passage: data.passage, rtl: data.rtl, attemptCount: data.attemptCount, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true },
    });
    await this.recalc(this.prisma, paperId, user.id);
    return section;
  }

  async updateSection(schoolId: string, user: CurrentUser, sectionId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = questionSectionUpdateSchema.parse(body);
    const section = await this.sectionForWrite(schoolId, sectionId, user, teacher);
    if (data.attemptCount) {
      const count = await this.prisma.question.count({ where: { sectionId } });
      if (count && data.attemptCount > count) throw new BadRequestException(`This section has only ${count} questions`);
    }
    await this.prisma.questionSection.update({ where: { id: sectionId }, data });
    await this.recalc(this.prisma, section.paperId, user.id);
    return { ok: true };
  }

  async removeSection(schoolId: string, user: CurrentUser, sectionId: string, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const section = await this.sectionForWrite(schoolId, sectionId, user, teacher);
    await this.prisma.questionSection.delete({ where: { id: sectionId } });
    await this.recalc(this.prisma, section.paperId, user.id);
    return { ok: true };
  }

  async reorderSections(schoolId: string, user: CurrentUser, paperId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const { ids } = questionOrderSchema.parse(body);
    await this.editable(schoolId, paperId, user, teacher);
    const existing = (await this.prisma.questionSection.findMany({ where: { paperId }, select: { id: true } })).map((s) => s.id);
    if (existing.length !== ids.length || new Set(ids).size !== ids.length || !ids.every((id) => existing.includes(id))) throw new BadRequestException("The section list changed — refresh and try again");
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.questionSection.update({ where: { id }, data: { sortOrder: index } })));
    return { ok: true };
  }

  async createQuestions(schoolId: string, user: CurrentUser, sectionId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const { questions } = questionsCreateSchema.parse(body);
    const section = await this.sectionForWrite(schoolId, sectionId, user, teacher);
    const last = await this.prisma.question.aggregate({ where: { sectionId }, _max: { sortOrder: true } });
    const start = (last._max.sortOrder ?? -1) + 1;
    await this.prisma.question.createMany({
      data: questions.map((q, i) => {
        const n = normalizeQuestion(section.type, q);
        return { sectionId, text: n.text, marks: n.marks, options: n.options as Prisma.InputJsonValue, answer: n.answer, answerLines: n.answerLines, sortOrder: start + i };
      }),
    });
    await this.recalc(this.prisma, section.paperId, user.id);
    return { added: questions.length };
  }

  async updateQuestion(schoolId: string, user: CurrentUser, questionId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const patch = questionUpdateSchema.parse(body);
    const question = await this.questionForWrite(schoolId, questionId, user, teacher);
    const merged = normalizeQuestion(question.section.type, {
      text: patch.text ?? question.text,
      marks: patch.marks ?? question.marks,
      options: patch.options ?? question.options,
      answer: patch.answer ?? question.answer,
      answerLines: patch.answerLines ?? question.answerLines,
    });
    await this.prisma.question.update({ where: { id: questionId }, data: { text: merged.text, marks: merged.marks, options: merged.options as Prisma.InputJsonValue, answer: merged.answer, answerLines: merged.answerLines } });
    await this.recalc(this.prisma, question.section.paperId, user.id);
    return { ok: true };
  }

  async removeQuestion(schoolId: string, user: CurrentUser, questionId: string, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const question = await this.questionForWrite(schoolId, questionId, user, teacher);
    await this.prisma.question.delete({ where: { id: questionId } });
    await this.recalc(this.prisma, question.section.paperId, user.id);
    return { ok: true };
  }

  async reorderQuestions(schoolId: string, user: CurrentUser, sectionId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const { ids } = questionOrderSchema.parse(body);
    await this.sectionForWrite(schoolId, sectionId, user, teacher);
    const existing = (await this.prisma.question.findMany({ where: { sectionId }, select: { id: true } })).map((q) => q.id);
    if (existing.length !== ids.length || new Set(ids).size !== ids.length || !ids.every((id) => existing.includes(id))) throw new BadRequestException("The question list changed — refresh and try again");
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.question.update({ where: { id }, data: { sortOrder: index } })));
    return { ok: true };
  }

  // Workflow -----------------------------------------------------------------------------------------------------------------

  /** Teacher (or admin) sends the finished paper for approval. It must add up to the exam's marks. */
  async submit(schoolId: string, user: CurrentUser, id: string, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const guard = await this.editableForSubmit(schoolId, id, teacher);
    const [sections, slots] = await Promise.all([
      this.prisma.questionSection.findMany({ where: { paperId: id }, orderBy: { sortOrder: "asc" }, include: { questions: { orderBy: { sortOrder: "asc" } } } }),
      this.slotsFor(schoolId, guard.examId, guard.gradeName, guard.subjectId),
    ]);
    const { expectedMarks, mixed } = this.expectedFrom(slots);
    const { issues } = validatePaper(this.toSections(sections), expectedMarks);
    if (mixed) issues.push({ message: "The sections of this grade have different max marks for this subject" });
    if (!slots.length) issues.push({ message: "This exam no longer has a paper for this class and subject" });
    if (issues.length) throw new BadRequestException(`Fix this before submitting: ${issues.slice(0, 4).map((i: PaperIssue) => i.message).join("; ")}${issues.length > 4 ? ` (+${issues.length - 4} more)` : ""}`);
    await this.prisma.questionPaper.update({ where: { id }, data: { status: "SUBMITTED", submittedAt: new Date(), reviewNote: "", updatedById: user.id }, select: { id: true } });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "question_paper_submitted", entity: "question_paper", entityId: id, summary: guard.title });
    return { ok: true };
  }

  private async editableForSubmit(schoolId: string, id: string, teacher: TeacherScope) {
    const paper = await this.prisma.questionPaper.findFirst({ where: { id, schoolId }, select: { id: true, title: true, status: true, examId: true, gradeName: true, subjectId: true, exam: { select: { yearId: true } } } });
    if (!paper) throw new NotFoundException("Question paper not found");
    await assertYearWritable(this.prisma, schoolId, paper.exam.yearId);
    assertCanEditSyllabus(await this.scopeFor(schoolId, paper.exam.yearId, teacher), paper.gradeName, paper.subjectId);
    if (paper.status !== "DRAFT" && paper.status !== "RETURNED") throw new BadRequestException("This paper was already submitted.");
    return paper;
  }

  async review(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = questionPaperReviewSchema.parse(body);
    const paper = await this.prisma.questionPaper.findFirst({ where: { id, schoolId }, select: { id: true, status: true, title: true, exam: { select: { yearId: true } } } });
    if (!paper) throw new NotFoundException("Question paper not found");
    await assertYearWritable(this.prisma, schoolId, paper.exam.yearId);
    if (paper.status !== "SUBMITTED") throw new BadRequestException("Only submitted papers can be reviewed.");
    await this.prisma.questionPaper.update({
      where: { id },
      data: { status: data.action === "APPROVE" ? "APPROVED" : "RETURNED", reviewedById: actorId, reviewedAt: new Date(), reviewNote: data.note },
      select: { id: true },
    });
    await audit(this.prisma, { schoolId, actorId, action: data.action === "APPROVE" ? "question_paper_approved" : "question_paper_returned", entity: "question_paper", entityId: id, summary: `${paper.title}${data.note ? ` — ${data.note}` : ""}` });
    return { ok: true };
  }

  /** An approved paper that must change goes back to the teacher with a reason (logged). */
  async reopen(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const { reason } = questionPaperReopenSchema.parse(body);
    const paper = await this.prisma.questionPaper.findFirst({ where: { id, schoolId }, select: { id: true, status: true, title: true, exam: { select: { yearId: true } } } });
    if (!paper) throw new NotFoundException("Question paper not found");
    await assertYearWritable(this.prisma, schoolId, paper.exam.yearId);
    if (paper.status !== "APPROVED") throw new BadRequestException("Only approved papers can be reopened.");
    await this.prisma.questionPaper.update({ where: { id }, data: { status: "RETURNED", reviewNote: `Reopened: ${reason}`, reviewedById: actorId, reviewedAt: new Date() }, select: { id: true } });
    await audit(this.prisma, { schoolId, actorId, action: "question_paper_reopened", entity: "question_paper", entityId: id, summary: `${paper.title} — ${reason}` });
    return { ok: true };
  }

  /** Records a print run. Any number of copies per class is allowed (e.g. 15 for a class of 11); every run is logged. */
  async recordPrint(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = questionPaperPrintSchema.parse(body);
    const paper = await this.prisma.questionPaper.findFirst({ where: { id, schoolId }, select: { id: true, status: true, title: true, examId: true, gradeName: true, subjectId: true } });
    if (!paper) throw new NotFoundException("Question paper not found");
    if (paper.status !== "APPROVED") throw new ConflictException("Only approved papers can be printed.");
    const slots = await this.slotsFor(schoolId, paper.examId, paper.gradeName, paper.subjectId);
    const byClass = new Map(slots.map((s) => [s.classId, s.label]));
    if (data.copies.some((c) => !byClass.has(c.classId))) throw new BadRequestException("Some classes aren't part of this paper");
    await this.prisma.questionPaperPrint.createMany({
      data: data.copies.map((c) => ({ schoolId, paperId: id, classId: c.classId, classLabel: byClass.get(c.classId) ?? "", copies: c.copies, answerKey: data.answerKey, printedById: actorId })),
    });
    const total = data.copies.reduce((n, c) => n + c.copies, 0);
    await audit(this.prisma, { schoolId, actorId, action: data.answerKey ? "question_paper_key_printed" : "question_paper_printed", entity: "question_paper", entityId: id, summary: `${paper.title}: ${data.copies.map((c) => `${byClass.get(c.classId)} ×${c.copies}`).join(", ")}` });
    return { copies: total };
  }
}

