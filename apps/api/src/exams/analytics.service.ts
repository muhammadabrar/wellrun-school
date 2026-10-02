import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { ResultScope } from "@prisma/client";
import { paginate } from "@wellrun/shared";
import { PrismaService } from "../prisma/prisma.service";
import { assertClassInScope, type TeacherScope } from "./access";
import { classLabel } from "./exams.service";
import { round, stats, type SubjectLine } from "./results.engine";
import { ExamSettingsService } from "./settings.service";

type ScopeQuery = { scope?: string; scopeId?: string; classId?: string };

@Injectable()
export class ExamAnalyticsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExamSettingsService) private readonly settings: ExamSettingsService,
  ) {}

  /** Result sets that exist for this year, newest first — powers the scope picker on every analytics page. */
  async scopes(schoolId: string, yearId: string) {
    const [exams, terms, annual] = await Promise.all([
      this.prisma.exam.findMany({
        where: { schoolId, yearId, kind: "EXAM", results: { some: {} } },
        orderBy: { startsOn: "desc" },
        select: { id: true, name: true, startsOn: true },
      }),
      this.prisma.term.findMany({ where: { schoolId, yearId }, orderBy: [{ sortOrder: "asc" }, { startsOn: "asc" }], select: { id: true, name: true } }),
      this.prisma.studentResult.count({ where: { schoolId, yearId, scope: "ANNUAL" } }),
    ]);
    const termsWithResults = await this.prisma.studentResult.groupBy({ by: ["scopeKey"], where: { schoolId, yearId, scope: "TERM" } });
    const termIds = new Set(termsWithResults.map((t) => t.scopeKey));
    return [
      ...exams.map((e) => ({ scope: "EXAM" as const, scopeId: e.id, label: e.name })),
      ...terms.filter((t) => termIds.has(t.id)).map((t) => ({ scope: "TERM" as const, scopeId: t.id, label: `${t.name} result` })),
      ...(annual ? [{ scope: "ANNUAL" as const, scopeId: yearId, label: "Annual result" }] : []),
    ];
  }

  private async rows(schoolId: string, yearId: string, query: ScopeQuery, teacher: TeacherScope) {
    const scope = (query.scope ?? "EXAM") as ResultScope;
    const scopeKey = scope === "ANNUAL" ? yearId : query.scopeId;
    if (!scopeKey) throw new BadRequestException("Pick an exam or term");
    if (query.classId) assertClassInScope(teacher, query.classId);
    return this.prisma.studentResult.findMany({
      where: {
        schoolId,
        yearId,
        scope,
        scopeKey,
        ...(query.classId ? { classId: query.classId } : teacher ? { classId: { in: [...teacher.classIds] } } : {}),
      },
      select: {
        studentId: true,
        classId: true,
        percentage: true,
        grade: true,
        passed: true,
        rank: true,
        subjects: true,
        class: { select: { name: true, section: true } },
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
    });
  }

  /** Per-section averages, pass rates and grade spread; sections of a grade sit side by side. */
  async classPerformance(schoolId: string, yearId: string, query: ScopeQuery, teacher: TeacherScope) {
    const rows = await this.rows(schoolId, yearId, { ...query, classId: undefined }, teacher);
    const byClass = new Map<string, typeof rows>();
    rows.forEach((r) => byClass.set(r.classId, [...(byClass.get(r.classId) ?? []), r]));
    const grades = new Set<string>();
    const classes = [...byClass].map(([classId, list]) => {
      const gradeCounts: Record<string, number> = {};
      list.forEach((r) => {
        if (!r.grade) return;
        grades.add(r.grade);
        gradeCounts[r.grade] = (gradeCounts[r.grade] ?? 0) + 1;
      });
      const top = [...list].sort((a, b) => b.percentage - a.percentage)[0];
      return {
        classId,
        label: classLabel(list[0].class),
        grade: list[0].class.name,
        students: list.length,
        ...stats(list.map((r) => r.percentage)),
        passPct: round((list.filter((r) => r.passed).length / list.length) * 100, 1),
        failed: list.filter((r) => !r.passed).length,
        grades: gradeCounts,
        topper: top ? { studentId: top.studentId, name: `${top.student.firstName} ${top.student.lastName}`.trim(), percentage: top.percentage } : null,
      };
    });
    classes.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    return {
      overall: {
        students: rows.length,
        ...stats(rows.map((r) => r.percentage)),
        passPct: rows.length ? round((rows.filter((r) => r.passed).length / rows.length) * 100, 1) : null,
      },
      gradeLabels: [...grades],
      classes,
    };
  }

  /** Subject averages across the school (or one class) plus a class × subject matrix. */
  async subjectPerformance(schoolId: string, yearId: string, query: ScopeQuery, teacher: TeacherScope) {
    const rows = await this.rows(schoolId, yearId, query, teacher);
    const bySubject = new Map<string, { name: string; pcts: number[]; passed: number; total: number }>();
    const matrix = new Map<string, { label: string; cells: Map<string, number[]> }>();
    for (const r of rows) {
      const row = matrix.get(r.classId) ?? { label: classLabel(r.class), cells: new Map<string, number[]>() };
      for (const s of r.subjects as SubjectLine[]) {
        if (s.pct == null) continue;
        const agg = bySubject.get(s.subjectId) ?? { name: s.name, pcts: [], passed: 0, total: 0 };
        agg.pcts.push(s.pct);
        agg.total += 1;
        if (s.passed) agg.passed += 1;
        bySubject.set(s.subjectId, agg);
        row.cells.set(s.subjectId, [...(row.cells.get(s.subjectId) ?? []), s.pct]);
      }
      matrix.set(r.classId, row);
    }
    const teachers = await this.subjectTeachers(schoolId, [...matrix.keys()]);
    const subjects = [...bySubject]
      .map(([subjectId, a]) => ({ subjectId, name: a.name, ...stats(a.pcts), passPct: round((a.passed / a.total) * 100, 1), failed: a.total - a.passed }))
      .sort((a, b) => (a.avg ?? 0) - (b.avg ?? 0));
    return {
      subjects,
      matrix: [...matrix]
        .map(([classId, row]) => ({
          classId,
          label: row.label,
          cells: Object.fromEntries(
            [...row.cells].map(([subjectId, pcts]) => [subjectId, { avg: stats(pcts).avg, teacher: teachers.get(`${classId}:${subjectId}`) ?? "" }]),
          ),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
    };
  }

  /** Teacher name per class+subject from teacher assignments (matched by subject name). */
  private async subjectTeachers(schoolId: string, classIds: string[]) {
    if (!classIds.length) return new Map<string, string>();
    const [assignments, subjects] = await Promise.all([
      this.prisma.teacherAssignment.findMany({ where: { schoolId, classId: { in: classIds }, subject: { not: "" } }, select: { classId: true, subject: true, staff: { select: { name: true } } } }),
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ]);
    const idByName = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s.id]));
    const out = new Map<string, string>();
    assignments.forEach((a) => {
      const subjectId = idByName.get(a.subject.trim().toLowerCase());
      if (subjectId) out.set(`${a.classId}:${subjectId}`, a.staff.name);
    });
    return out;
  }

  /**
   * Without a student: the at-risk list (below the school's threshold, failed, or dropped 10+ points between
   * their last two exams). With a student: their exam-by-exam trend per subject.
   */
  async studentPerformance(schoolId: string, yearId: string, query: { studentId?: string; classId?: string; page?: string; pageSize?: string }, teacher: TeacherScope) {
    if (query.classId) assertClassInScope(teacher, query.classId);
    const rules = await this.settings.rules(schoolId);
    const results = await this.prisma.studentResult.findMany({
      where: {
        schoolId,
        yearId,
        scope: "EXAM",
        exam: { kind: "EXAM" },
        ...(query.studentId ? { studentId: query.studentId } : {}),
        ...(query.classId ? { classId: query.classId } : teacher ? { classId: { in: [...teacher.classIds] } } : {}),
      },
      select: {
        studentId: true,
        classId: true,
        percentage: true,
        grade: true,
        passed: true,
        rank: true,
        subjects: true,
        exam: { select: { id: true, name: true, startsOn: true } },
        class: { select: { name: true, section: true } },
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
    });
    results.sort((a, b) => (a.exam?.startsOn.getTime() ?? 0) - (b.exam?.startsOn.getTime() ?? 0));

    if (query.studentId) {
      if (teacher && !results.every((r) => teacher.classIds.has(r.classId))) return { trend: [], subjects: [] };
      const subjectNames = new Map<string, string>();
      results.forEach((r) => (r.subjects as SubjectLine[]).forEach((s) => subjectNames.set(s.subjectId, s.name)));
      return {
        trend: results.map((r) => ({ examId: r.exam?.id, exam: r.exam?.name ?? "", date: r.exam?.startsOn, percentage: r.percentage, grade: r.grade, rank: r.rank, passed: r.passed })),
        subjects: [...subjectNames].map(([subjectId, name]) => ({
          subjectId,
          name,
          points: results.map((r) => (r.subjects as SubjectLine[]).find((s) => s.subjectId === subjectId)?.pct ?? null),
        })),
      };
    }

    const byStudent = new Map<string, typeof results>();
    results.forEach((r) => byStudent.set(r.studentId, [...(byStudent.get(r.studentId) ?? []), r]));
    const atRisk = [...byStudent]
      .map(([studentId, list]) => {
        const latest = list[list.length - 1];
        const previous = list.length > 1 ? list[list.length - 2] : null;
        const drop = previous ? round(previous.percentage - latest.percentage, 1) : 0;
        const reasons: string[] = [];
        if (latest.percentage < rules.atRiskPct) reasons.push(`Below ${rules.atRiskPct}%`);
        if (!latest.passed) reasons.push("Failed");
        if (drop >= 10) reasons.push(`Dropped ${drop} points`);
        const weak = (latest.subjects as SubjectLine[]).filter((s) => s.pct != null && !s.passed).map((s) => s.name);
        return {
          studentId,
          name: `${latest.student.firstName} ${latest.student.lastName}`.trim(),
          admissionNo: latest.student.admissionNo,
          className: classLabel(latest.class),
          latestExam: latest.exam?.name ?? "",
          percentage: latest.percentage,
          previous: previous?.percentage ?? null,
          grade: latest.grade,
          reasons,
          weakSubjects: weak,
        };
      })
      .filter((r) => r.reasons.length)
      .sort((a, b) => a.percentage - b.percentage);
    return { threshold: rules.atRiskPct, ...paginate(atRisk, query) };
  }
}
