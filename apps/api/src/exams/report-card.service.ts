import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { ResultScope } from "@prisma/client";
import type { Response } from "express";
import { schoolLetterhead } from "../common/school";
import { logoFilePath } from "../fees/pdf";
import { PrismaService } from "../prisma/prisma.service";
import { assertClassInScope, type TeacherScope } from "./access";
import { classLabel } from "./exams.service";
import { renderReportCards, type ReportCard } from "./report-card.pdf";
import type { SubjectLine } from "./results.engine";
import { ExamSettingsService } from "./settings.service";

export type ReportCardQuery = { scope?: string; scopeId?: string; classId?: string; studentId?: string; templateId?: string };

@Injectable()
export class ReportCardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExamSettingsService) private readonly settings: ExamSettingsService,
  ) {}

  async pdf(schoolId: string, yearId: string, query: ReportCardQuery, teacher: TeacherScope, res: Response) {
    const scope = (query.scope ?? "EXAM") as ResultScope;
    const scopeKey = scope === "ANNUAL" ? yearId : query.scopeId;
    if (!scopeKey) throw new BadRequestException("Pick an exam or term");
    if (!query.classId && !query.studentId) throw new BadRequestException("Pick a class or a student");
    if (query.classId) assertClassInScope(teacher, query.classId);

    const rows = await this.prisma.studentResult.findMany({
      where: { schoolId, scope, scopeKey, ...(query.classId ? { classId: query.classId } : {}), ...(query.studentId ? { studentId: query.studentId } : {}) },
      orderBy: [{ rank: { sort: "asc", nulls: "last" } }, { percentage: "desc" }],
      include: {
        class: { select: { id: true, name: true, section: true } },
        exam: { select: { name: true, gradingScaleId: true } },
        student: {
          select: {
            firstName: true,
            lastName: true,
            admissionNo: true,
            enrollments: { select: { classId: true, rollNo: true } },
            guardians: { select: { guardian: { select: { name: true } } }, take: 1 },
          },
        },
      },
    });
    if (!rows.length) throw new NotFoundException("No results yet — generate results first");
    rows.forEach((r) => assertClassInScope(teacher, r.classId));

    const classIds = [...new Set(rows.map((r) => r.classId))];
    const [year, term, sizes, letterhead, template, bands] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: yearId, schoolId }, select: { name: true } }),
      scope === "TERM" ? this.prisma.term.findFirst({ where: { id: scopeKey, schoolId }, select: { name: true } }) : Promise.resolve(null),
      this.prisma.studentResult.groupBy({ by: ["classId"], where: { schoolId, scope, scopeKey, classId: { in: classIds } }, _count: { _all: true } }),
      schoolLetterhead(this.prisma, schoolId),
      this.settings.template(schoolId, query.templateId),
      this.settings.bandsFor(schoolId, rows[0].exam?.gradingScaleId),
    ]);
    const classSize = new Map(sizes.map((s) => [s.classId, s._count._all]));
    const title =
      scope === "EXAM" ? `${rows[0].exam?.name ?? "Exam"} — Report card` : scope === "TERM" ? `${term?.name ?? "Term"} — Report card` : "Annual report card";

    const cards: ReportCard[] = rows.map((r) => ({
      title,
      yearName: year?.name ?? "",
      scope,
      student: {
        name: `${r.student.firstName} ${r.student.lastName}`.trim(),
        admissionNo: r.student.admissionNo,
        rollNo: r.student.enrollments.find((e) => e.classId === r.classId)?.rollNo ?? "",
        className: classLabel(r.class),
        guardian: r.student.guardians[0]?.guardian.name ?? "",
      },
      subjects: r.subjects as SubjectLine[],
      totalObtained: r.totalObtained,
      totalMax: r.totalMax,
      percentage: r.percentage,
      grade: r.grade,
      gpa: r.gpa,
      rank: r.rank,
      classSize: classSize.get(r.classId) ?? rows.length,
      passed: r.passed,
      attendancePct: r.attendancePct,
      teacherRemark: r.teacherRemark,
      principalRemark: r.principalRemark,
    }));

    const bytes = await renderReportCards({
      school: { ...letterhead, logoPath: logoFilePath(letterhead.logoUrl) },
      template: { layout: template.layout, ...template.options },
      bands,
      cards,
    });
    const fileName = (query.studentId ? cards[0].student.name : `${cards[0].student.className}-${title}`).replace(/[^A-Za-z0-9-]+/g, "_");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${fileName}.pdf"`);
    res.send(bytes);
  }
}
