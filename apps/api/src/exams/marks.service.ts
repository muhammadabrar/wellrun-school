import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PaperStatus, Prisma } from "@prisma/client";
import { correctionReviewSchema, markCorrectionSchema, marksBulkSaveSchema, marksReviewSchema } from "@wellrun/shared";
import { z } from "zod";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import { assertWritableSchool } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanMarkPaper, canMarkPaper, type TeacherScope } from "./access";
import { classLabel, syncExamStatus } from "./exams.service";
import { round, stats } from "./results.engine";
import { ResultsService } from "./results.service";
import { ExamSettingsService } from "./settings.service";

const EDITABLE: PaperStatus[] = ["NOT_STARTED", "DRAFT", "RETURNED"];
const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);

const paperSelect = {
  id: true,
  examId: true,
  classId: true,
  subjectId: true,
  date: true,
  maxMarks: true,
  passMarks: true,
  status: true,
  submittedAt: true,
  reviewedAt: true,
  reviewNote: true,
  class: { select: { name: true, section: true } },
  subject: { select: { name: true } },
  exam: { select: { id: true, name: true, kind: true, yearId: true, status: true } },
} satisfies Prisma.ExamPaperSelect;

@Injectable()
export class MarksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResultsService) private readonly results: ResultsService,
    @Inject(ExamSettingsService) private readonly settings: ExamSettingsService,
  ) {}

  /** Paper queue: "to mark" for teachers, plus pending / approved lists for admins. */
  async papers(schoolId: string, yearId: string, query: { status?: string; examId?: string; classId?: string; q?: string }, scope: TeacherScope) {
    const statuses = (query.status ?? "").split(",").filter(Boolean) as PaperStatus[];
    const papers = await this.prisma.examPaper.findMany({
      where: {
        schoolId,
        exam: { yearId, ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}) },
        ...(statuses.length ? { status: { in: statuses } } : {}),
        ...(query.examId ? { examId: query.examId } : {}),
        ...(query.classId ? { classId: query.classId } : scope ? { classId: { in: [...scope.classIds] } } : {}),
      },
      orderBy: [{ submittedAt: "desc" }, { date: "desc" }],
      take: 500,
      select: { ...paperSelect, marks: { select: { marks: true, attendance: true } } },
    });
    const visible = papers.filter((p) => canMarkPaper(scope, p));
    const strength = await this.classStrength(schoolId, [...new Set(visible.map((p) => p.classId))]);
    return visible.map((p) => {
      const pcts = p.marks.filter((m) => m.attendance === "PRESENT" && m.marks != null).map((m) => ((m.marks ?? 0) / p.maxMarks) * 100);
      return {
        id: p.id,
        examId: p.examId,
        examName: p.exam.name,
        kind: p.exam.kind,
        className: classLabel(p.class),
        classId: p.classId,
        subject: p.subject.name,
        date: isoDate(p.date),
        maxMarks: p.maxMarks,
        passMarks: p.passMarks,
        status: p.status,
        submittedAt: p.submittedAt,
        reviewedAt: p.reviewedAt,
        reviewNote: p.reviewNote,
        entered: p.marks.length,
        students: strength.get(p.classId) ?? 0,
        stats: {
          ...stats(pcts.map((v) => round(v, 1))),
          fails: p.marks.filter((m) => m.attendance === "ABSENT" || (m.attendance === "PRESENT" && (m.marks ?? 0) < p.passMarks)).length,
          absent: p.marks.filter((m) => m.attendance === "ABSENT").length,
        },
      };
    });
  }

  private async classStrength(schoolId: string, classIds: string[]) {
    if (!classIds.length) return new Map<string, number>();
    const groups = await this.prisma.enrollment.groupBy({ by: ["classId"], where: { schoolId, classId: { in: classIds }, active: true }, _count: { _all: true } });
    return new Map(groups.map((g) => [g.classId, g._count._all]));
  }

  private async ownedPaper(schoolId: string, paperId: string) {
    const paper = await this.prisma.examPaper.findFirst({ where: { id: paperId, schoolId }, select: paperSelect });
    if (!paper) throw new NotFoundException("Paper not found");
    return paper;
  }

  /** Marks grid: roster in roll-number order with any saved marks. */
  async sheet(schoolId: string, paperId: string, user: CurrentUser, scope: TeacherScope) {
    const paper = await this.ownedPaper(schoolId, paperId);
    if (scope && !scope.classIds.has(paper.classId)) throw new ForbiddenException("This class is not assigned to you");
    const [enrollments, marks, exam, corrections] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { schoolId, classId: paper.classId, active: true },
        select: { rollNo: true, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, extra: true } } },
      }),
      this.prisma.examMark.findMany({
        where: { paperId },
        select: { studentId: true, marks: true, attendance: true, remark: true, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, extra: true } } },
      }),
      this.prisma.exam.findUnique({ where: { id: paper.examId }, select: { gradingScaleId: true } }),
      this.prisma.markCorrection.findMany({ where: { paperId, status: "PENDING" }, select: { studentId: true } }),
    ]);
    const bands = await this.settings.bandsFor(schoolId, exam?.gradingScaleId);
    const byStudent = new Map(marks.map((m) => [m.studentId, m]));
    const students = new Map<string, { id: string; name: string; admissionNo: string; rollNo: string; photo: string | null; enrolled: boolean }>();
    const photo = (extra: Prisma.JsonValue) => (extra && typeof extra === "object" && !Array.isArray(extra) && typeof extra.photo === "string" ? extra.photo : null);
    enrollments.forEach((e) =>
      students.set(e.student.id, {
        id: e.student.id,
        name: `${e.student.firstName} ${e.student.lastName}`.trim(),
        admissionNo: e.student.admissionNo,
        rollNo: e.rollNo,
        photo: photo(e.student.extra),
        enrolled: true,
      }),
    );
    marks.forEach((m) => {
      if (!students.has(m.studentId)) {
        students.set(m.studentId, { id: m.student.id, name: `${m.student.firstName} ${m.student.lastName}`.trim(), admissionNo: m.student.admissionNo, rollNo: "", photo: photo(m.student.extra), enrolled: false });
      }
    });
    const pendingCorrections = new Set(corrections.map((c) => c.studentId));
    const rows = [...students.values()]
      .sort((a, b) => (Number(a.rollNo) || 9999) - (Number(b.rollNo) || 9999) || a.rollNo.localeCompare(b.rollNo) || a.name.localeCompare(b.name))
      .map((s) => {
        const m = byStudent.get(s.id);
        return { ...s, marks: m?.marks ?? null, attendance: m?.attendance ?? "PRESENT", remark: m?.remark ?? "", saved: Boolean(m), correctionPending: pendingCorrections.has(s.id) };
      });
    const canMark = canMarkPaper(scope, paper);
    const isAdmin = user.role === "SCHOOL_ADMIN";
    return {
      paper: {
        id: paper.id,
        examId: paper.examId,
        examName: paper.exam.name,
        kind: paper.exam.kind,
        className: classLabel(paper.class),
        subject: paper.subject.name,
        date: isoDate(paper.date),
        maxMarks: paper.maxMarks,
        passMarks: paper.passMarks,
        status: paper.status,
        reviewNote: paper.reviewNote,
        submittedAt: paper.submittedAt,
        reviewedAt: paper.reviewedAt,
      },
      bands,
      permissions: {
        canEdit: canMark && (EDITABLE.includes(paper.status) || (isAdmin && paper.status === "SUBMITTED")),
        canSubmit: canMark && EDITABLE.includes(paper.status),
        canReview: isAdmin && paper.status === "SUBMITTED",
        canRequestCorrection: canMark && paper.status === "APPROVED",
        canReopen: isAdmin && paper.status === "APPROVED",
      },
      rows,
    };
  }

  async save(schoolId: string, user: CurrentUser, paperId: string, body: unknown, scope: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = marksBulkSaveSchema.parse(body);
    const paper = await this.ownedPaper(schoolId, paperId);
    assertCanMarkPaper(scope, paper);
    const adminFixingSubmitted = user.role === "SCHOOL_ADMIN" && paper.status === "SUBMITTED";
    if (!EDITABLE.includes(paper.status) && !adminFixingSubmitted) {
      throw new BadRequestException(paper.status === "APPROVED" ? "Marks are approved — request a correction instead" : "Marks were submitted and are waiting for verification");
    }
    const errors: string[] = [];
    data.rows.forEach((r) => {
      if (r.attendance === "PRESENT" && r.marks != null && r.marks > paper.maxMarks) errors.push(`${r.studentId}: above ${paper.maxMarks}`);
    });
    if (errors.length) throw new BadRequestException(`Marks can't be more than ${paper.maxMarks}`);
    const allowed = new Set(
      (
        await this.prisma.enrollment.findMany({ where: { schoolId, classId: paper.classId }, select: { studentId: true } })
      ).map((e) => e.studentId),
    );
    if (data.rows.some((r) => !allowed.has(r.studentId))) throw new BadRequestException("Some students are not in this class");

    if (data.submit) {
      const roster = await this.prisma.enrollment.findMany({ where: { schoolId, classId: paper.classId, active: true }, select: { studentId: true } });
      const existing = await this.prisma.examMark.findMany({ where: { paperId }, select: { studentId: true, marks: true, attendance: true } });
      const complete = new Map(existing.map((m) => [m.studentId, m.attendance !== "PRESENT" || m.marks != null]));
      data.rows.forEach((r) => complete.set(r.studentId, r.attendance !== "PRESENT" || r.marks != null));
      const missing = roster.filter((r) => !complete.get(r.studentId)).length;
      if (missing) throw new BadRequestException(`${missing} students have no marks — enter marks or mark them absent`);
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const r of data.rows) {
          const values = { marks: r.attendance === "PRESENT" ? r.marks : null, attendance: r.attendance, remark: r.remark };
          await tx.examMark.upsert({
            where: { paperId_studentId: { paperId, studentId: r.studentId } },
            create: { schoolId, paperId, studentId: r.studentId, ...values },
            update: values,
          });
        }
        const nextStatus: PaperStatus = adminFixingSubmitted ? "SUBMITTED" : data.submit ? "SUBMITTED" : "DRAFT";
        await tx.examPaper.update({
          where: { id: paperId },
          data: { status: nextStatus, enteredById: user.id, ...(data.submit ? { submittedAt: new Date(), reviewNote: "" } : {}) },
        });
        await syncExamStatus(tx, paper.examId);
      },
      { timeout: 30000 },
    );
    if (data.submit) {
      await audit(this.prisma, { schoolId, actorId: user.id, action: "marks_submitted", entity: "exam_paper", entityId: paperId, summary: `${paper.exam.name} · ${classLabel(paper.class)} · ${paper.subject.name}` });
    }
    return { saved: data.rows.length, status: data.submit ? "SUBMITTED" : adminFixingSubmitted ? "SUBMITTED" : "DRAFT" };
  }

  /** Approve or return submitted papers (bulk). Approval refreshes any results they feed. */
  async review(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = marksReviewSchema.parse(body);
    const papers = await this.prisma.examPaper.findMany({ where: { schoolId, id: { in: data.paperIds } }, select: { id: true, examId: true, classId: true, status: true } });
    if (papers.length !== data.paperIds.length) throw new NotFoundException("Some papers were not found");
    const reviewable = papers.filter((p) => p.status === "SUBMITTED" || (data.action === "APPROVE" && p.status === "DRAFT"));
    if (!reviewable.length) throw new BadRequestException("None of these papers are waiting for verification");
    await this.prisma.$transaction(async (tx) => {
      await tx.examPaper.updateMany({
        where: { id: { in: reviewable.map((p) => p.id) } },
        data: { status: data.action === "APPROVE" ? "APPROVED" : "RETURNED", reviewedById: actorId, reviewedAt: new Date(), reviewNote: data.note },
      });
      for (const examId of new Set(reviewable.map((p) => p.examId))) await syncExamStatus(tx, examId);
    });
    if (data.action === "APPROVE") {
      const oncePerClass = new Map(reviewable.map((p) => [`${p.examId}:${p.classId}`, p.id]));
      for (const paperId of oncePerClass.values()) await this.results.refreshForPaper(schoolId, paperId);
    }
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: data.action === "APPROVE" ? "marks_approved" : "marks_returned",
      entity: "exam_paper",
      entityId: reviewable[0].id,
      summary: `${reviewable.length} papers${data.note ? ` — ${data.note}` : ""}`,
    });
    return { updated: reviewable.length, skipped: papers.length - reviewable.length };
  }

  /** Admin unlocks an approved paper for re-entry (audited with a reason). */
  async reopen(schoolId: string, actorId: string, paperId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const { reason } = z.object({ reason: z.string().trim().min(5, "Give a reason") }).parse(body);
    const paper = await this.ownedPaper(schoolId, paperId);
    if (paper.status !== "APPROVED") throw new BadRequestException("Only approved papers can be reopened");
    if (paper.exam.status === "PUBLISHED") throw new BadRequestException("Unpublish results first, or use a correction");
    await this.prisma.$transaction(async (tx) => {
      await tx.examPaper.update({ where: { id: paperId }, data: { status: "RETURNED", reviewNote: reason, reviewedById: actorId, reviewedAt: new Date() } });
      await syncExamStatus(tx, paper.examId);
    });
    await audit(this.prisma, { schoolId, actorId, action: "marks_reopened", entity: "exam_paper", entityId: paperId, summary: reason });
    return { ok: true };
  }

  // Corrections --------------------------------------------------------------------

  async corrections(schoolId: string, yearId: string, status: string | undefined, scope: TeacherScope, userId: string) {
    const rows = await this.prisma.markCorrection.findMany({
      where: {
        schoolId,
        paper: { exam: { yearId } },
        ...(status ? { status: status as "PENDING" | "APPROVED" | "REJECTED" } : {}),
        ...(scope ? { requestedById: userId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        id: true,
        oldMarks: true,
        newMarks: true,
        oldAttendance: true,
        newAttendance: true,
        reason: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        reviewedAt: true,
        requestedById: true,
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        paper: { select: { id: true, maxMarks: true, class: { select: { name: true, section: true } }, subject: { select: { name: true } }, exam: { select: { id: true, name: true } } } },
      },
    });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.requestedById))] } }, select: { id: true, name: true } });
    const userName = new Map(users.map((u) => [u.id, u.name]));
    return rows.map((r) => ({
      id: r.id,
      status: r.status,
      reason: r.reason,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt,
      reviewedAt: r.reviewedAt,
      requestedBy: userName.get(r.requestedById) ?? "",
      oldMarks: r.oldMarks,
      newMarks: r.newMarks,
      oldAttendance: r.oldAttendance,
      newAttendance: r.newAttendance,
      student: { id: r.student.id, name: `${r.student.firstName} ${r.student.lastName}`.trim(), admissionNo: r.student.admissionNo },
      paper: { id: r.paper.id, maxMarks: r.paper.maxMarks, className: classLabel(r.paper.class), subject: r.paper.subject.name, examId: r.paper.exam.id, examName: r.paper.exam.name },
    }));
  }

  async requestCorrection(schoolId: string, user: CurrentUser, body: unknown, scope: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = markCorrectionSchema.parse(body);
    const paper = await this.ownedPaper(schoolId, data.paperId);
    assertCanMarkPaper(scope, paper);
    if (paper.status !== "APPROVED") throw new BadRequestException("This paper isn't approved — edit the marks directly");
    if (data.newAttendance === "PRESENT" && (data.newMarks == null || data.newMarks > paper.maxMarks)) {
      throw new BadRequestException(`Enter marks between 0 and ${paper.maxMarks}`);
    }
    const mark = await this.prisma.examMark.findUnique({ where: { paperId_studentId: { paperId: data.paperId, studentId: data.studentId } } });
    const inClass = mark || (await this.prisma.enrollment.count({ where: { schoolId, classId: paper.classId, studentId: data.studentId } }));
    if (!inClass) throw new BadRequestException("Student is not in this class");
    const pending = await this.prisma.markCorrection.count({ where: { paperId: data.paperId, studentId: data.studentId, status: "PENDING" } });
    if (pending) throw new BadRequestException("A correction for this student is already waiting");
    const row = await this.prisma.markCorrection.create({
      data: {
        schoolId,
        paperId: data.paperId,
        studentId: data.studentId,
        oldMarks: mark?.marks ?? null,
        oldAttendance: mark?.attendance ?? "PRESENT",
        newMarks: data.newAttendance === "PRESENT" ? data.newMarks : null,
        newAttendance: data.newAttendance,
        reason: data.reason,
        requestedById: user.id,
      },
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "mark_correction_requested", entity: "exam_paper", entityId: data.paperId, summary: data.reason });
    return row;
  }

  async reviewCorrection(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = correctionReviewSchema.parse(body);
    const correction = await this.prisma.markCorrection.findFirst({ where: { id, schoolId } });
    if (!correction) throw new NotFoundException("Correction not found");
    if (correction.status !== "PENDING") throw new BadRequestException("This correction was already reviewed");
    await this.prisma.$transaction(async (tx) => {
      await tx.markCorrection.update({
        where: { id },
        data: { status: data.action === "APPROVE" ? "APPROVED" : "REJECTED", reviewNote: data.note, reviewedById: actorId, reviewedAt: new Date() },
      });
      if (data.action === "APPROVE") {
        const values = { marks: correction.newMarks, attendance: correction.newAttendance };
        await tx.examMark.upsert({
          where: { paperId_studentId: { paperId: correction.paperId, studentId: correction.studentId } },
          create: { schoolId, paperId: correction.paperId, studentId: correction.studentId, ...values },
          update: values,
        });
      }
    });
    if (data.action === "APPROVE") await this.results.refreshForPaper(schoolId, correction.paperId);
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: data.action === "APPROVE" ? "mark_correction_approved" : "mark_correction_rejected",
      entity: "exam_paper",
      entityId: correction.paperId,
      summary: `${correction.oldMarks ?? correction.oldAttendance} → ${correction.newMarks ?? correction.newAttendance}`,
    });
    return { ok: true };
  }
}
