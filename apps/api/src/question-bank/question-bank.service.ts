import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type QuestionType } from "@prisma/client";
import { createHash } from "node:crypto";
import {
  BANK_TYPES,
  DIFFICULTIES,
  bankQuestionProblem,
  bankQuestionSchema,
  bankQuestionUpdateSchema,
  normalizeQuestion,
  pageParams,
  questionKey,
  saveToBankSchema,
  type BankChoices,
  type BankList,
  type BankQuestionView,
  type BankTopic,
  type SavedToBank,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import type { TeacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanEditSyllabus, canEditSyllabus, syllabusScope, type SyllabusScope } from "../syllabus/access";

export type BankListQuery = { gradeName?: string; subjectId?: string; type?: string; difficulty?: string; topicId?: string; tag?: string; q?: string; mine?: string; archived?: string; page?: string; pageSize?: string };

const numeric = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export const hashQuestion = (type: QuestionType, text: string, options: unknown) => createHash("sha1").update(questionKey(type, text, options)).digest("hex");

const include = { subject: { select: { name: true } }, topic: { select: { title: true } } } satisfies Prisma.BankQuestionInclude;

type Row = Prisma.BankQuestionGetPayload<{ include: typeof include }>;

@Injectable()
export class QuestionBankService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private isAdmin(user: CurrentUser) {
    return user.role === "SCHOOL_ADMIN";
  }

  private scope(schoolId: string, yearId: string, teacher: TeacherScope) {
    return syllabusScope(this.prisma, schoolId, yearId, teacher);
  }

  private canUse(scope: SyllabusScope, row: { gradeName: string; subjectId: string }) {
    return canEditSyllabus(scope, row.gradeName, row.subjectId);
  }

  private async view(rows: Row[], user: CurrentUser, scope: SyllabusScope): Promise<BankQuestionView[]> {
    const ids = [...new Set(rows.flatMap((r) => (r.createdById ? [r.createdById] : [])))];
    const people = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = new Map(people.map((p) => [p.id, p.name]));
    return rows.map((r) => {
      const mine = r.createdById === user.id;
      return {
        id: r.id,
        subjectId: r.subjectId,
        subject: r.subject.name,
        gradeName: r.gradeName,
        topicId: r.topicId,
        topic: r.topic?.title ?? null,
        type: r.type,
        text: r.text,
        marks: r.marks,
        options: r.options,
        answer: r.answer,
        answerLines: r.answerLines,
        difficulty: r.difficulty,
        tags: r.tags,
        rtl: r.rtl,
        active: r.active,
        usageCount: r.usageCount,
        lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
        createdBy: r.createdById ? (names.get(r.createdById) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
        mine,
        // Anyone who teaches the subject can use a question; only its author (or an admin) can change it.
        canEdit: this.isAdmin(user) || (mine && this.canUse(scope, r)),
      };
    });
  }

  /** The grades and subjects this person can keep questions for. */
  async choices(schoolId: string, yearId: string, teacher: TeacherScope): Promise<BankChoices> {
    const scope = await this.scope(schoolId, yearId, teacher);
    const links = await this.prisma.classSubject.findMany({
      where: { schoolId, class: { yearId }, subject: { enabled: true } },
      select: { class: { select: { name: true } }, subject: { select: { id: true, name: true } } },
    });
    const byGrade = new Map<string, Map<string, string>>();
    for (const link of links) {
      if (!canEditSyllabus(scope, link.class.name, link.subject.id)) continue;
      const subjects = byGrade.get(link.class.name) ?? new Map<string, string>();
      subjects.set(link.subject.id, link.subject.name);
      byGrade.set(link.class.name, subjects);
    }
    return {
      grades: [...byGrade]
        .sort(([a], [b]) => numeric(a, b))
        .map(([gradeName, subjects]) => ({ gradeName, subjects: [...subjects].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)) })),
    };
  }

  /** Syllabus topics a question can be tied to, for the chosen grade and subject. */
  async topics(schoolId: string, yearId: string, query: { gradeName?: string; subjectId?: string }, teacher: TeacherScope): Promise<BankTopic[]> {
    if (!query.gradeName || !query.subjectId) return [];
    assertCanEditSyllabus(await this.scope(schoolId, yearId, teacher), query.gradeName, query.subjectId);
    const topics = await this.prisma.syllabusTopic.findMany({
      where: { syllabus: { schoolId, yearId, gradeName: query.gradeName, subjectId: query.subjectId } },
      orderBy: [{ unit: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: { id: true, title: true, unit: { select: { title: true } } },
    });
    return topics.map((t) => ({ id: t.id, title: t.title, unit: t.unit.title }));
  }

  async list(schoolId: string, yearId: string, user: CurrentUser, teacher: TeacherScope, query: BankListQuery): Promise<BankList> {
    const { page, pageSize, skip, take } = pageParams(query, 20);
    const scope = await this.scope(schoolId, yearId, teacher);
    const and: Prisma.BankQuestionWhereInput[] = [];
    if (scope) {
      const allowed: Prisma.BankQuestionWhereInput[] = [
        ...(scope.wholeGrades.size ? [{ gradeName: { in: [...scope.wholeGrades] } }] : []),
        ...[...scope.pairs].map((key) => {
          const [gradeName, subjectId] = key.split("::");
          return { gradeName, subjectId };
        }),
      ];
      if (!allowed.length) return { items: [], total: 0, page, pageSize };
      and.push({ OR: allowed });
    }
    const q = query.q?.trim();
    const where: Prisma.BankQuestionWhereInput = {
      schoolId,
      active: query.archived === "1" ? false : true,
      ...(query.gradeName ? { gradeName: query.gradeName } : {}),
      ...(query.subjectId ? { subjectId: query.subjectId } : {}),
      ...(BANK_TYPES.some((t) => t === query.type) ? { type: query.type as QuestionType } : {}),
      ...(DIFFICULTIES.some((d) => d === query.difficulty) ? { difficulty: query.difficulty as "EASY" } : {}),
      ...(query.topicId ? { topicId: query.topicId } : {}),
      ...(query.tag ? { tags: { has: query.tag.trim().toLowerCase() } } : {}),
      ...(query.mine === "1" ? { createdById: user.id } : {}),
      ...(q ? { text: { contains: q, mode: "insensitive" } } : {}),
      ...(and.length ? { AND: and } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.bankQuestion.findMany({ where, include, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], skip, take }),
      this.prisma.bankQuestion.count({ where }),
    ]);
    return { items: await this.view(rows, user, scope), total, page, pageSize };
  }

  /** The topic must belong to the same grade and subject, or the link would mislead whoever reads it. */
  private async checkTopic(schoolId: string, topicId: string | null | undefined, gradeName: string, subjectId: string) {
    if (!topicId) return null;
    const topic = await this.prisma.syllabusTopic.findFirst({ where: { id: topicId, syllabus: { schoolId, gradeName, subjectId } }, select: { id: true } });
    if (!topic) throw new BadRequestException("That topic isn't in this grade and subject's syllabus");
    return topic.id;
  }

  private async existing(schoolId: string, subjectId: string, gradeName: string, type: QuestionType, textHash: string) {
    return this.prisma.bankQuestion.findUnique({ where: { schoolId_subjectId_gradeName_type_textHash: { schoolId, subjectId, gradeName, type, textHash } }, select: { id: true, active: true } });
  }

  private duplicate(row: { active: boolean }) {
    return new ConflictException(row.active ? "That question is already in the bank" : "That question is in the bank but archived. Restore it from the archived list instead of adding it again.");
  }

  async create(schoolId: string, yearId: string, user: CurrentUser, teacher: TeacherScope, body: unknown): Promise<BankQuestionView> {
    const data = bankQuestionSchema.parse(body);
    const type = data.type as QuestionType;
    const scope = await this.scope(schoolId, yearId, teacher);
    assertCanEditSyllabus(scope, data.gradeName, data.subjectId);
    if (!(await this.prisma.classSubject.findFirst({ where: { schoolId, subjectId: data.subjectId, class: { name: data.gradeName } }, select: { id: true } }))) {
      throw new BadRequestException("That subject isn't taught in that grade");
    }
    const normalized = normalizeQuestion(type, data);
    const problem = bankQuestionProblem(type, normalized);
    if (problem) throw new BadRequestException(problem);
    const topicId = await this.checkTopic(schoolId, data.topicId, data.gradeName, data.subjectId);
    const textHash = hashQuestion(type, normalized.text, normalized.options);
    const found = await this.existing(schoolId, data.subjectId, data.gradeName, type, textHash);
    if (found) throw this.duplicate(found);
    try {
      const row = await this.prisma.bankQuestion.create({
        data: {
          schoolId,
          subjectId: data.subjectId,
          gradeName: data.gradeName,
          topicId,
          type,
          text: normalized.text,
          textHash,
          marks: normalized.marks,
          options: normalized.options as Prisma.InputJsonValue,
          answer: normalized.answer,
          answerLines: normalized.answerLines,
          difficulty: data.difficulty,
          tags: data.tags,
          rtl: data.rtl,
          createdById: user.id,
        },
        include,
      });
      await audit(this.prisma, { schoolId, actorId: user.id, action: "bank_question_created", entity: "bank_question", entityId: row.id, summary: `${data.gradeName} ${row.subject.name}` });
      return (await this.view([row], user, scope))[0]!;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ConflictException("That question is already in the bank");
      throw error;
    }
  }

  private async editable(schoolId: string, yearId: string, user: CurrentUser, teacher: TeacherScope, id: string) {
    const row = await this.prisma.bankQuestion.findFirst({ where: { id, schoolId }, include });
    if (!row) throw new NotFoundException("Question not found");
    const scope = await this.scope(schoolId, yearId, teacher);
    if (!this.canUse(scope, row)) throw new ForbiddenException("You don't teach this subject in this grade");
    if (!this.isAdmin(user) && row.createdById !== user.id) throw new ForbiddenException("Only the person who added a question, or an admin, can change it");
    return { row, scope };
  }

  async update(schoolId: string, yearId: string, user: CurrentUser, teacher: TeacherScope, id: string, body: unknown): Promise<BankQuestionView> {
    const patch = bankQuestionUpdateSchema.parse(body);
    const { row, scope } = await this.editable(schoolId, yearId, user, teacher, id);
    const normalized = normalizeQuestion(row.type, {
      text: patch.text ?? row.text,
      marks: patch.marks ?? row.marks,
      options: patch.options ?? row.options,
      answer: patch.answer ?? row.answer,
      answerLines: patch.answerLines ?? row.answerLines,
    });
    const problem = bankQuestionProblem(row.type, normalized);
    if (problem) throw new BadRequestException(problem);
    const topicId = patch.topicId === undefined ? row.topicId : await this.checkTopic(schoolId, patch.topicId, row.gradeName, row.subjectId);
    const textHash = hashQuestion(row.type, normalized.text, normalized.options);
    if (textHash !== row.textHash) {
      const clash = await this.existing(schoolId, row.subjectId, row.gradeName, row.type, textHash);
      if (clash && clash.id !== id) throw this.duplicate(clash);
    }
    const updated = await this.prisma.bankQuestion.update({
      where: { id },
      data: {
        text: normalized.text,
        textHash,
        marks: normalized.marks,
        options: normalized.options as Prisma.InputJsonValue,
        answer: normalized.answer,
        answerLines: normalized.answerLines,
        difficulty: patch.difficulty,
        tags: patch.tags,
        topicId,
        rtl: patch.rtl,
      },
      include,
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "bank_question_updated", entity: "bank_question", entityId: id });
    return (await this.view([updated], user, scope))[0]!;
  }

  async setActive(schoolId: string, yearId: string, user: CurrentUser, teacher: TeacherScope, id: string, active: boolean): Promise<BankQuestionView> {
    const { scope } = await this.editable(schoolId, yearId, user, teacher, id);
    const row = await this.prisma.bankQuestion.update({ where: { id }, data: { active }, include });
    await audit(this.prisma, { schoolId, actorId: user.id, action: active ? "bank_question_restored" : "bank_question_archived", entity: "bank_question", entityId: id });
    return (await this.view([row], user, scope))[0]!;
  }

  /**
   * Keeps a question from a paper in the bank. If it is already there, nothing is added and the paper's question is
   * simply linked to it, so "Save to bank" is safe to press twice.
   */
  async fromQuestion(schoolId: string, yearId: string, user: CurrentUser, teacher: TeacherScope, body: unknown): Promise<SavedToBank> {
    const data = saveToBankSchema.parse(body);
    const question = await this.prisma.question.findFirst({
      where: { id: data.questionId, section: { paper: { schoolId } } },
      select: { id: true, text: true, marks: true, options: true, answer: true, answerLines: true, bankQuestionId: true, section: { select: { type: true, rtl: true, paper: { select: { gradeName: true, subjectId: true, exam: { select: { yearId: true } } } } } } },
    });
    if (!question) throw new NotFoundException("Question not found");
    const { type, rtl, paper } = question.section;
    assertCanEditSyllabus(await this.scope(schoolId, paper.exam.yearId, teacher), paper.gradeName, paper.subjectId);
    if (type === "COMPREHENSION") throw new BadRequestException("Questions about a reading passage depend on the passage, so they can't be saved on their own");
    const normalized = normalizeQuestion(type, question);
    const problem = bankQuestionProblem(type, normalized);
    if (problem) throw new BadRequestException(`Finish the question before saving it: ${problem.charAt(0).toLowerCase()}${problem.slice(1)}`);
    const textHash = hashQuestion(type, normalized.text, normalized.options);
    const found = await this.existing(schoolId, paper.subjectId, paper.gradeName, type, textHash);
    if (found) {
      if (!question.bankQuestionId) await this.prisma.question.update({ where: { id: question.id }, data: { bankQuestionId: found.id }, select: { id: true } });
      return { id: found.id, existed: true, archived: !found.active };
    }
    const topicId = await this.checkTopic(schoolId, data.topicId, paper.gradeName, paper.subjectId);
    const row = await this.prisma.bankQuestion.create({
      data: {
        schoolId,
        subjectId: paper.subjectId,
        gradeName: paper.gradeName,
        topicId,
        type,
        text: normalized.text,
        textHash,
        marks: normalized.marks,
        options: normalized.options as Prisma.InputJsonValue,
        answer: normalized.answer,
        answerLines: normalized.answerLines,
        difficulty: data.difficulty,
        tags: data.tags,
        rtl,
        usageCount: 1,
        lastUsedAt: new Date(),
        createdById: user.id,
      },
      select: { id: true },
    });
    await this.prisma.question.update({ where: { id: question.id }, data: { bankQuestionId: row.id }, select: { id: true } });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "bank_question_created", entity: "bank_question", entityId: row.id, summary: "Saved from a question paper" });
    void yearId;
    return { id: row.id, existed: false, archived: false };
  }
}
