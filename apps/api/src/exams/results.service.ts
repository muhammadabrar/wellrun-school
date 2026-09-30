import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, ResultScope } from "@prisma/client";
import { resultComputeSchema, resultPublishSchema, resultRemarksSchema } from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import { assertExamYearOpen } from "../common/year-lock";
import { PrismaService } from "../prisma/prisma.service";
import { assertClassInScope, type TeacherScope } from "./access";
import { classLabel } from "./exams.service";
import {
  combineSubject,
  combineTerms,
  outcome,
  paperLine,
  rankRows,
  round,
  stats,
  type Band,
  type ContributionLine,
  type ResultRules,
  type SubjectLine,
} from "./results.engine";
import { ExamSettingsService } from "./settings.service";

type LoadedPaper = {
  id: string;
  classId: string;
  className: string;
  grade: string;
  subjectId: string;
  subjectName: string;
  maxMarks: number;
  passMarks: number;
  examId: string;
  examName: string;
  examKind: string;
  examWeight: number;
  examStartsOn: Date;
  termId: string | null;
  marks: Map<string, { marks: number | null; attendance: "PRESENT" | "ABSENT" | "MEDICAL" | "EXEMPT" }>;
};

type ComputedRow = {
  studentId: string;
  classId: string;
  grade: string;
  lines: SubjectLine[];
};

@Injectable()
export class ResultsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExamSettingsService) private readonly settings: ExamSettingsService,
  ) {}

  // Loading -------------------------------------------------------------------

  private async loadPapers(where: Prisma.ExamPaperWhereInput): Promise<LoadedPaper[]> {
    const papers = await this.prisma.examPaper.findMany({
      where: { ...where, status: "APPROVED" },
      select: {
        id: true,
        classId: true,
        subjectId: true,
        maxMarks: true,
        passMarks: true,
        class: { select: { name: true, section: true } },
        subject: { select: { name: true } },
        exam: { select: { id: true, name: true, kind: true, weight: true, startsOn: true, termId: true } },
        marks: { select: { studentId: true, marks: true, attendance: true } },
      },
    });
    return papers.map((p) => ({
      id: p.id,
      classId: p.classId,
      className: classLabel(p.class),
      grade: p.class.name,
      subjectId: p.subjectId,
      subjectName: p.subject.name,
      maxMarks: p.maxMarks,
      passMarks: p.passMarks,
      examId: p.exam.id,
      examName: p.exam.name,
      examKind: p.exam.kind,
      examWeight: p.exam.weight,
      examStartsOn: p.exam.startsOn,
      termId: p.exam.termId,
      marks: new Map(p.marks.map((m) => [m.studentId, { marks: m.marks, attendance: m.attendance }])),
    }));
  }

  /** Students currently enrolled in the classes (so a student with no marks yet still appears). */
  private async roster(schoolId: string, classIds: string[]) {
    const rows = await this.prisma.enrollment.findMany({
      where: { schoolId, classId: { in: classIds }, active: true },
      select: { studentId: true, classId: true },
    });
    return rows;
  }

  // Building rows -------------------------------------------------------------

  private studentsByClass(papers: LoadedPaper[], roster: { studentId: string; classId: string }[]) {
    const classOf = new Map<string, string>();
    roster.forEach((r) => classOf.set(r.studentId, r.classId));
    // Students who left the class keep their marks: place them in the class of their latest paper.
    [...papers]
      .sort((a, b) => a.examStartsOn.getTime() - b.examStartsOn.getTime())
      .forEach((p) => p.marks.forEach((_m, studentId) => classOf.has(studentId) || classOf.set(studentId, p.classId)));
    return classOf;
  }

  private examRows(papers: LoadedPaper[], classOf: Map<string, string>, rules: ResultRules, bands: Band[]): ComputedRow[] {
    const gradeOf = new Map(papers.map((p) => [p.classId, p.grade]));
    return [...classOf].map(([studentId, classId]) => ({
      studentId,
      classId,
      grade: gradeOf.get(classId) ?? "",
      lines: papers
        .filter((p) => p.classId === classId)
        .sort((a, b) => a.subjectName.localeCompare(b.subjectName))
        .map((p) => {
          const mark = p.marks.get(studentId);
          return paperLine(
            { subjectId: p.subjectId, name: p.subjectName, marks: mark?.marks ?? null, attendance: mark?.attendance ?? "PRESENT", maxMarks: p.maxMarks, passMarks: p.passMarks },
            rules,
            bands,
          );
        }),
    }));
  }

  /** Subject lines for one student over a bucket of papers (a term, or the whole year when there are no terms). */
  private bucketLines(papers: LoadedPaper[], studentId: string, rules: ResultRules, bands: Band[]) {
    const bySubject = new Map<string, { name: string; lines: ContributionLine[] }>();
    for (const p of papers) {
      const mark = p.marks.get(studentId);
      if (!mark) continue;
      const line = paperLine(
        { subjectId: p.subjectId, name: p.subjectName, marks: mark.marks, attendance: mark.attendance, maxMarks: p.maxMarks, passMarks: p.passMarks },
        rules,
        bands,
      );
      const entry = bySubject.get(p.subjectId) ?? { name: p.subjectName, lines: [] };
      entry.lines.push({ label: p.examName, kind: p.examKind === "EXAM" ? "EXAM" : "ASSESSMENT", weight: p.examWeight, pct: line.pct, passPct: line.passPct });
      bySubject.set(p.subjectId, entry);
    }
    return new Map(
      [...bySubject].map(([subjectId, entry]) => [subjectId, combineSubject({ subjectId, name: entry.name }, entry.lines, rules, bands)] as const),
    );
  }

  private async attendancePct(schoolId: string, studentIds: string[], from: Date, to: Date) {
    if (!studentIds.length) return new Map<string, number>();
    const groups = await this.prisma.attendanceRecord.groupBy({
      by: ["studentId", "status"],
      where: { schoolId, studentId: { in: studentIds }, date: { gte: from, lte: to } },
      _count: { _all: true },
    });
    const totals = new Map<string, { present: number; all: number }>();
    for (const g of groups) {
      const t = totals.get(g.studentId) ?? { present: 0, all: 0 };
      t.all += g._count._all;
      if (g.status === "PRESENT" || g.status === "LATE") t.present += g._count._all;
      totals.set(g.studentId, t);
    }
    return new Map([...totals].map(([id, t]) => [id, t.all ? round((t.present / t.all) * 100, 1) : 0]));
  }

  /** Rank inside the section or across all sections of a grade, then upsert the snapshot rows. */
  private async persist(
    schoolId: string,
    yearId: string,
    scope: ResultScope,
    scopeKey: string,
    ids: { examId?: string; termId?: string },
    rows: ComputedRow[],
    rules: ResultRules & { rankScope: string },
    bands: Band[],
    attendance: Map<string, number> | null,
  ) {
    const computed = rows.map((row) => ({ ...row, id: row.studentId, ...outcome(row.lines, rules, bands), hasMarks: row.lines.some((l) => l.pct != null) }));
    const groupKey = (r: ComputedRow) => (rules.rankScope === "GRADE" ? r.grade : r.classId);
    const groups = new Map<string, typeof computed>();
    computed.forEach((r) => groups.set(groupKey(r), [...(groups.get(groupKey(r)) ?? []), r]));
    const ranks = new Map<string, number | null>();
    groups.forEach((list) => rankRows(list, rules.rankMethod, rules.rankOnlyPassed).forEach((rank, id) => ranks.set(id, rank)));

    const classIds = [...new Set(rows.map((r) => r.classId))];
    // One batched transaction: an interactive one makes a round trip per student and times out on a remote database.
    await this.prisma.$transaction([
      this.prisma.studentResult.deleteMany({
        where: { scope, scopeKey, classId: { in: classIds }, studentId: { notIn: computed.map((r) => r.studentId) } },
      }),
      ...computed.map((r) => {
        const data = {
          classId: r.classId,
          totalObtained: r.totalObtained,
          totalMax: r.totalMax,
          percentage: r.percentage,
          grade: r.grade,
          gpa: r.gpa,
          rank: ranks.get(r.studentId) ?? null,
          passed: r.passed,
          failedSubjects: r.failedSubjects,
          subjects: r.lines as unknown as Prisma.InputJsonValue,
          attendancePct: attendance?.get(r.studentId) ?? null,
          computedAt: new Date(),
        };
        return this.prisma.studentResult.upsert({
          where: { scope_scopeKey_studentId: { scope, scopeKey, studentId: r.studentId } },
          create: { schoolId, yearId, scope, scopeKey, examId: ids.examId, termId: ids.termId, studentId: r.studentId, ...data },
          update: data,
        });
      }),
    ]);
    return { students: computed.length, classes: classIds.length };
  }

  // Compute -------------------------------------------------------------------

  /** With grade-wide ranking, recomputing one section must include every section of that grade. */
  private async rankingClassIds(schoolId: string, classIds: string[] | undefined, rules: { rankScope: string }) {
    if (!classIds?.length || rules.rankScope !== "GRADE") return classIds;
    const picked = await this.prisma.class.findMany({ where: { schoolId, id: { in: classIds } }, select: { name: true, yearId: true } });
    const siblings = await this.prisma.class.findMany({
      where: { schoolId, OR: picked.map((c) => ({ name: c.name, yearId: c.yearId })) },
      select: { id: true },
    });
    return siblings.map((c) => c.id);
  }

  async computeExam(schoolId: string, examId: string, classIds?: string[]) {
    const exam = await this.prisma.exam.findFirst({ where: { id: examId, schoolId }, select: { id: true, yearId: true, gradingScaleId: true } });
    if (!exam) throw new NotFoundException("Exam not found");
    const [rules, bands] = await Promise.all([this.settings.rules(schoolId), this.settings.bandsFor(schoolId, exam.gradingScaleId)]);
    classIds = await this.rankingClassIds(schoolId, classIds, rules);
    const papers = await this.loadPapers({ schoolId, examId, ...(classIds?.length ? { classId: { in: classIds } } : {}) });
    if (!papers.length) return { students: 0, classes: 0 };
    const paperClassIds = [...new Set(papers.map((p) => p.classId))];
    const roster = await this.roster(schoolId, paperClassIds);
    const classOf = this.studentsByClass(papers, roster);
    return this.persist(schoolId, exam.yearId, "EXAM", examId, { examId }, this.examRows(papers, classOf, rules, bands), rules, bands, null);
  }

  async computeTerm(schoolId: string, termId: string, classIds?: string[]) {
    const term = await this.prisma.term.findFirst({ where: { id: termId, schoolId } });
    if (!term) throw new NotFoundException("Term not found");
    const [rules, bands] = await Promise.all([this.settings.rules(schoolId), this.settings.bandsFor(schoolId, null)]);
    classIds = await this.rankingClassIds(schoolId, classIds, rules);
    const papers = await this.loadPapers({
      schoolId,
      exam: { termId, includeInReportCard: true },
      ...(classIds?.length ? { classId: { in: classIds } } : {}),
    });
    if (!papers.length) return { students: 0, classes: 0 };
    const roster = await this.roster(schoolId, [...new Set(papers.map((p) => p.classId))]);
    const classOf = this.studentsByClass(papers, roster);
    const gradeOf = new Map(papers.map((p) => [p.classId, p.grade]));
    const rows: ComputedRow[] = [...classOf].map(([studentId, classId]) => ({
      studentId,
      classId,
      grade: gradeOf.get(classId) ?? "",
      lines: [...this.bucketLines(papers.filter((p) => p.classId === classId), studentId, rules, bands).values()].sort((a, b) => a.name.localeCompare(b.name)),
    }));
    const attendance = await this.attendancePct(schoolId, rows.map((r) => r.studentId), term.startsOn, term.endsOn);
    return this.persist(schoolId, term.yearId, "TERM", termId, { termId }, rows, rules, bands, attendance);
  }

  async computeAnnual(schoolId: string, yearId: string, classIds?: string[]) {
    const year = await this.prisma.academicYear.findFirst({ where: { id: yearId, schoolId } });
    if (!year) throw new NotFoundException("Academic year not found");
    const [rules, bands, terms] = await Promise.all([
      this.settings.rules(schoolId),
      this.settings.bandsFor(schoolId, null),
      this.prisma.term.findMany({ where: { schoolId, yearId }, orderBy: [{ sortOrder: "asc" }, { startsOn: "asc" }] }),
    ]);
    classIds = await this.rankingClassIds(schoolId, classIds, rules);
    const papers = await this.loadPapers({
      schoolId,
      exam: { yearId, includeInReportCard: true },
      ...(classIds?.length ? { classId: { in: classIds } } : {}),
    });
    if (!papers.length) return { students: 0, classes: 0 };
    const roster = await this.roster(schoolId, [...new Set(papers.map((p) => p.classId))]);
    const classOf = this.studentsByClass(papers, roster);
    const gradeOf = new Map(papers.map((p) => [p.classId, p.grade]));
    // Without terms (or with exams outside any term) the whole year is one bucket.
    const buckets = terms.length
      ? [
          ...terms.map((t) => ({ label: t.name, weight: t.weight, papers: papers.filter((p) => p.termId === t.id) })),
          ...(papers.some((p) => !p.termId) ? [{ label: "Other", weight: 0, papers: papers.filter((p) => !p.termId) }] : []),
        ]
      : [{ label: year.name, weight: 100, papers }];
    const rows: ComputedRow[] = [...classOf].map(([studentId, classId]) => {
      const perBucket = buckets.map((b) => ({ ...b, lines: this.bucketLines(b.papers.filter((p) => p.classId === classId), studentId, rules, bands) }));
      const subjects = new Map<string, string>();
      perBucket.forEach((b) => b.lines.forEach((line, id) => subjects.set(id, line.name)));
      const lines = [...subjects].map(([subjectId, name]) =>
        combineTerms({ subjectId, name }, perBucket.map((b) => ({ label: b.label, weight: b.weight, line: b.lines.get(subjectId) ?? null })), rules, bands),
      );
      return { studentId, classId, grade: gradeOf.get(classId) ?? "", lines: lines.sort((a, b) => a.name.localeCompare(b.name)) };
    });
    const attendance = await this.attendancePct(schoolId, rows.map((r) => r.studentId), year.startsOn, year.endsOn);
    return this.persist(schoolId, yearId, "ANNUAL", yearId, {}, rows, rules, bands, attendance);
  }

  async compute(schoolId: string, actorId: string, yearId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = resultComputeSchema.parse(body);
    const out =
      data.scope === "EXAM"
        ? await this.computeExam(schoolId, this.requireScopeId(data.scopeId), data.classIds)
        : data.scope === "TERM"
          ? await this.computeTerm(schoolId, this.requireScopeId(data.scopeId), data.classIds)
          : await this.computeAnnual(schoolId, yearId, data.classIds);
    await audit(this.prisma, { schoolId, actorId, action: "results_computed", entity: "results", entityId: data.scopeId ?? yearId, summary: `${data.scope}: ${out.students} students` });
    return out;
  }

  private requireScopeId(id?: string) {
    if (!id) throw new BadRequestException("Pick an exam or term");
    return id;
  }

  private scopeKey(scope: ResultScope, scopeId: string | undefined, yearId: string) {
    return scope === "ANNUAL" ? yearId : this.requireScopeId(scopeId);
  }

  // Reading -------------------------------------------------------------------

  /** Class result / tabulation sheet: one row per student with every subject. */
  async classResults(
    schoolId: string,
    yearId: string,
    query: { scope?: string; scopeId?: string; classId?: string },
    teacher: TeacherScope,
  ) {
    const scope = (query.scope ?? "EXAM") as ResultScope;
    if (!query.classId) throw new BadRequestException("Pick a class");
    assertClassInScope(teacher, query.classId);
    const scopeKey = this.scopeKey(scope, query.scopeId, yearId);
    const [cls, rows, rules, pending] = await Promise.all([
      this.prisma.class.findFirst({ where: { id: query.classId, schoolId }, select: { id: true, name: true, section: true } }),
      this.prisma.studentResult.findMany({
        where: { schoolId, scope, scopeKey, classId: query.classId },
        orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { percentage: "desc" }],
        select: {
          id: true,
          studentId: true,
          totalObtained: true,
          totalMax: true,
          percentage: true,
          grade: true,
          gpa: true,
          rank: true,
          passed: true,
          failedSubjects: true,
          subjects: true,
          attendancePct: true,
          teacherRemark: true,
          principalRemark: true,
          publishedAt: true,
          computedAt: true,
          student: { select: { firstName: true, lastName: true, admissionNo: true, enrollments: { where: { classId: query.classId }, select: { rollNo: true }, take: 1 } } },
        },
      }),
      this.settings.rules(schoolId),
      scope === "EXAM"
        ? this.prisma.examPaper.count({ where: { schoolId, examId: scopeKey, classId: query.classId, status: { not: "APPROVED" } } })
        : scope === "TERM"
          ? this.prisma.examPaper.count({ where: { schoolId, exam: { termId: scopeKey, includeInReportCard: true }, classId: query.classId, status: { not: "APPROVED" } } })
          : this.prisma.examPaper.count({ where: { schoolId, exam: { yearId, includeInReportCard: true }, classId: query.classId, status: { not: "APPROVED" } } }),
    ]);
    if (!cls) throw new NotFoundException("Class not found");
    const subjects = new Map<string, string>();
    rows.forEach((r) => (r.subjects as SubjectLine[]).forEach((s) => subjects.set(s.subjectId, s.name)));
    const pcts = rows.filter((r) => r.totalMax > 0).map((r) => r.percentage);
    const gradeCounts: Record<string, number> = {};
    rows.forEach((r) => r.grade && (gradeCounts[r.grade] = (gradeCounts[r.grade] ?? 0) + 1));
    return {
      class: { id: cls.id, label: classLabel(cls) },
      scope,
      scopeKey,
      pendingPapers: pending,
      showRank: rules.showRank,
      published: rows.length > 0 && rows.every((r) => r.publishedAt),
      computedAt: rows[0]?.computedAt ?? null,
      subjects: [...subjects].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
      summary: {
        ...stats(pcts),
        passed: rows.filter((r) => r.passed).length,
        failed: rows.filter((r) => !r.passed).length,
        passPct: rows.length ? round((rows.filter((r) => r.passed).length / rows.length) * 100, 1) : null,
        grades: gradeCounts,
      },
      rows: rows.map((r) => ({
        id: r.id,
        studentId: r.studentId,
        name: `${r.student.firstName} ${r.student.lastName}`.trim(),
        admissionNo: r.student.admissionNo,
        rollNo: r.student.enrollments[0]?.rollNo ?? "",
        totalObtained: r.totalObtained,
        totalMax: r.totalMax,
        percentage: r.percentage,
        grade: r.grade,
        gpa: r.gpa,
        rank: r.rank,
        passed: r.passed,
        failedSubjects: r.failedSubjects,
        attendancePct: r.attendancePct,
        teacherRemark: r.teacherRemark,
        principalRemark: r.principalRemark,
        published: Boolean(r.publishedAt),
        subjects: r.subjects as SubjectLine[],
      })),
    };
  }

  /** Everything for the student profile Results tab and Student results page, for one academic year. */
  async studentResults(schoolId: string, studentId: string, yearId: string | undefined, teacher: TeacherScope) {
    const student = await this.prisma.student.findFirst({
      where: { id: studentId, schoolId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNo: true,
        enrollments: { select: { classId: true, active: true, rollNo: true, class: { select: { yearId: true, name: true, section: true, year: { select: { id: true, name: true, startsOn: true } } } } } },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    if (teacher && !student.enrollments.some((e) => teacher.classIds.has(e.classId))) throw new ForbiddenException("This student is not in your assigned class");
    const years = [...new Map(student.enrollments.map((e) => [e.class.year.id, e.class.year])).values()].sort((a, b) => b.startsOn.getTime() - a.startsOn.getTime());
    const activeYear = yearId && years.some((y) => y.id === yearId) ? yearId : years[0]?.id;
    if (!activeYear) {
      return { student: { id: student.id, name: `${student.firstName} ${student.lastName}`.trim(), admissionNo: student.admissionNo }, years: [], yearId: null, className: "", rollNo: "", results: [], marks: [] };
    }
    const [results, marks, terms] = await Promise.all([
      this.prisma.studentResult.findMany({
        where: { schoolId, studentId, yearId: activeYear },
        orderBy: { computedAt: "desc" },
        select: {
          id: true,
          scope: true,
          scopeKey: true,
          examId: true,
          termId: true,
          percentage: true,
          totalObtained: true,
          totalMax: true,
          grade: true,
          gpa: true,
          rank: true,
          passed: true,
          failedSubjects: true,
          subjects: true,
          attendancePct: true,
          teacherRemark: true,
          principalRemark: true,
          publishedAt: true,
          class: { select: { name: true, section: true } },
          exam: { select: { name: true, startsOn: true, kind: true } },
        },
      }),
      this.prisma.examMark.findMany({
        where: { schoolId, studentId, paper: { exam: { yearId: activeYear } } },
        select: {
          marks: true,
          attendance: true,
          remark: true,
          paper: {
            select: {
              id: true,
              maxMarks: true,
              passMarks: true,
              status: true,
              date: true,
              subject: { select: { name: true } },
              exam: { select: { id: true, name: true, kind: true, startsOn: true } },
            },
          },
        },
        orderBy: { paper: { exam: { startsOn: "desc" } } },
      }),
      this.prisma.term.findMany({ where: { schoolId, yearId: activeYear }, select: { id: true, name: true } }),
    ]);
    const termName = new Map(terms.map((t) => [t.id, t.name]));
    const enrollment = student.enrollments.find((e) => e.class.yearId === activeYear && e.active) ?? student.enrollments.find((e) => e.class.yearId === activeYear);
    const pct = (m: number | null, max: number) => (m == null || !max ? null : round((m / max) * 100, 1));
    return {
      student: { id: student.id, name: `${student.firstName} ${student.lastName}`.trim(), admissionNo: student.admissionNo },
      years: years.map((y) => ({ id: y.id, name: y.name })),
      yearId: activeYear,
      className: enrollment ? classLabel(enrollment.class) : "",
      rollNo: enrollment?.rollNo ?? "",
      results: results
        .map((r) => ({
          id: r.id,
          scope: r.scope,
          scopeKey: r.scopeKey,
          label: r.scope === "EXAM" ? r.exam?.name ?? "Exam" : r.scope === "TERM" ? termName.get(r.termId ?? "") ?? "Term" : "Annual result",
          date: r.exam?.startsOn ?? null,
          kind: r.exam?.kind ?? null,
          className: classLabel(r.class),
          percentage: r.percentage,
          totalObtained: r.totalObtained,
          totalMax: r.totalMax,
          grade: r.grade,
          gpa: r.gpa,
          rank: r.rank,
          passed: r.passed,
          failedSubjects: r.failedSubjects,
          subjects: r.subjects as SubjectLine[],
          attendancePct: r.attendancePct,
          teacherRemark: r.teacherRemark,
          principalRemark: r.principalRemark,
          published: Boolean(r.publishedAt),
        }))
        .filter((r) => r.scope !== "EXAM" || r.kind === "EXAM"),
      marks: marks.map((m) => ({
        paperId: m.paper.id,
        examId: m.paper.exam.id,
        examName: m.paper.exam.name,
        kind: m.paper.exam.kind,
        date: m.paper.date ?? m.paper.exam.startsOn,
        subject: m.paper.subject.name,
        marks: m.marks,
        maxMarks: m.paper.maxMarks,
        passMarks: m.paper.passMarks,
        pct: m.attendance === "PRESENT" ? pct(m.marks, m.paper.maxMarks) : null,
        attendance: m.attendance,
        remark: m.remark,
        approved: m.paper.status === "APPROVED",
      })),
    };
  }

  // Publishing & remarks ---------------------------------------------------------

  async publish(schoolId: string, actorId: string, yearId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = resultPublishSchema.parse(body);
    const scopeKey = this.scopeKey(data.scope, data.scopeId, yearId);
    const classFilter = data.classIds?.length ? { classId: { in: data.classIds } } : {};
    if (data.publish && data.scope === "EXAM") {
      const pending = await this.prisma.examPaper.count({ where: { schoolId, examId: scopeKey, status: { not: "APPROVED" }, ...classFilter } });
      if (pending) throw new BadRequestException(`${pending} papers are not approved yet`);
      await this.computeExam(schoolId, scopeKey, data.classIds);
    }
    const result = await this.prisma.studentResult.updateMany({
      where: { schoolId, scope: data.scope, scopeKey, ...classFilter },
      data: { publishedAt: data.publish ? new Date() : null },
    });
    if (!result.count && data.publish) throw new BadRequestException("Generate results before publishing");
    if (data.scope === "EXAM") {
      const unpublished = await this.prisma.studentResult.count({ where: { schoolId, scope: "EXAM", scopeKey, publishedAt: null } });
      await this.prisma.exam.update({
        where: { id: scopeKey },
        data: unpublished ? { status: "COMPLETED", publishedAt: null } : { status: "PUBLISHED", publishedAt: new Date() },
      });
    }
    await audit(this.prisma, { schoolId, actorId, action: data.publish ? "results_published" : "results_unpublished", entity: "results", entityId: scopeKey, summary: `${data.scope}: ${result.count} students` });
    return { updated: result.count };
  }

  async saveRemarks(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const { rows } = resultRemarksSchema.parse(body);
    await assertExamYearOpen(this.prisma, schoolId, { resultIds: rows.map((r) => r.resultId) });
    const owned = await this.prisma.studentResult.count({ where: { schoolId, id: { in: rows.map((r) => r.resultId) } } });
    if (owned !== rows.length) throw new BadRequestException("Some results were not found");
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.studentResult.update({
          where: { id: r.resultId },
          data: {
            ...(r.teacherRemark !== undefined ? { teacherRemark: r.teacherRemark } : {}),
            ...(r.principalRemark !== undefined ? { principalRemark: r.principalRemark } : {}),
          },
        }),
      ),
    );
    await audit(this.prisma, { schoolId, actorId, action: "result_remarks_saved", entity: "results", entityId: rows[0]?.resultId ?? "", summary: `${rows.length} remarks` });
    return { saved: rows.length };
  }

  /** Recompute everything a changed paper feeds into (exam, its term, the year) — used after approvals and corrections. */
  async refreshForPaper(schoolId: string, paperId: string) {
    const paper = await this.prisma.examPaper.findFirst({
      where: { id: paperId, schoolId },
      select: { classId: true, exam: { select: { id: true, yearId: true, termId: true, kind: true } } },
    });
    if (!paper) return;
    const classIds = [paper.classId];
    if (paper.exam.kind === "EXAM") await this.computeExam(schoolId, paper.exam.id, classIds);
    const hasTermResults = paper.exam.termId
      ? await this.prisma.studentResult.count({ where: { schoolId, scope: "TERM", scopeKey: paper.exam.termId, classId: paper.classId } })
      : 0;
    if (paper.exam.termId && hasTermResults) await this.computeTerm(schoolId, paper.exam.termId, classIds);
    const hasAnnual = await this.prisma.studentResult.count({ where: { schoolId, scope: "ANNUAL", scopeKey: paper.exam.yearId, classId: paper.classId } });
    if (hasAnnual) await this.computeAnnual(schoolId, paper.exam.yearId, classIds);
  }
}
