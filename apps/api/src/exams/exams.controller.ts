import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import type { SchoolScope } from "../common/school-scope";
import { assertExamYearOpen } from "../common/year-lock";
import { PrismaService } from "../prisma/prisma.service";
import { assertExamAccess, resolveYearId, teacherScope, type ExamAction } from "./access";
import { ExamAnalyticsService } from "./analytics.service";
import { ExamsService, type ExamListQuery } from "./exams.service";
import { MarksService } from "./marks.service";
import { ReportCardService, type ReportCardQuery } from "./report-card.service";
import { ResultsService } from "./results.service";
import { ExamSettingsService } from "./settings.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

/** School, academic year (from X-Year-Id) and the teacher's class/subject scope for one request. */
async function examContext(prisma: PrismaService, req: Req, action: ExamAction) {
  const schoolId = assertExamAccess(req.user, action);
  const [yearId, scope] = await Promise.all([resolveYearId(prisma, schoolId, req.schoolScope), teacherScope(prisma, req.user)]);
  return { schoolId, yearId, scope };
}

/** examContext for writes: the viewed year must not be closed. */
async function examWriteContext(prisma: PrismaService, req: Req, action: ExamAction) {
  const ctx = await examContext(prisma, req, action);
  await assertExamYearOpen(prisma, ctx.schoolId, { yearId: ctx.yearId });
  return ctx;
}

/** Access check plus the closed-year lock for routes that name an exam, paper, term or correction. */
async function examWriteAccess(prisma: PrismaService, req: Req, action: ExamAction, ref: Parameters<typeof assertExamYearOpen>[2]) {
  const schoolId = assertExamAccess(req.user, action);
  await assertExamYearOpen(prisma, schoolId, ref);
  return schoolId;
}

@Controller("console/exams")
@UseGuards(AuthGuard)
export class ExamsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExamsService) private readonly exams: ExamsService,
  ) {}

  @Get("dashboard")
  async dashboard(@Req() req: Req) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "exams.view");
    return this.exams.dashboard(schoolId, yearId, scope);
  }

  @Get("context")
  async context(@Req() req: Req) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "exams.view");
    return this.exams.context(schoolId, yearId, scope);
  }

  @Get("calendar")
  async calendar(@Req() req: Req, @Query() query: { from?: string; to?: string; classId?: string }) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "exams.view");
    return this.exams.calendar(schoolId, yearId, query, scope);
  }

  @Get()
  async list(@Req() req: Req, @Query() query: ExamListQuery) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "exams.view");
    return this.exams.list(schoolId, yearId, query, scope);
  }

  @Post()
  async create(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, yearId } = await examWriteContext(this.prisma, req, "exams.manage");
    return this.exams.create(schoolId, req.user, yearId, body);
  }

  @Post("assessments")
  async quickAssessment(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, yearId, scope } = await examWriteContext(this.prisma, req, "exams.assessment.create");
    return this.exams.quickAssessment(schoolId, req.user, yearId, body, scope);
  }

  @Patch("papers/:paperId")
  async updatePaper(@Req() req: Req, @Param("paperId") paperId: string, @Body() body: unknown) {
    return this.exams.updatePaper(await examWriteAccess(this.prisma, req, "exams.manage", { paperIds: [paperId] }), req.user.id, paperId, body);
  }

  @Delete("papers/:paperId")
  async removePaper(@Req() req: Req, @Param("paperId") paperId: string) {
    return this.exams.removePaper(await examWriteAccess(this.prisma, req, "exams.manage", { paperIds: [paperId] }), req.user.id, paperId);
  }

  @Get(":id")
  async detail(@Req() req: Req, @Param("id") id: string) {
    const schoolId = assertExamAccess(req.user, "exams.view");
    return this.exams.detail(schoolId, id, await teacherScope(this.prisma, req.user));
  }

  @Patch(":id")
  async update(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.exams.update(await examWriteAccess(this.prisma, req, "exams.manage", { examId: id }), req.user.id, id, body);
  }

  @Delete(":id")
  async remove(@Req() req: Req, @Param("id") id: string) {
    const schoolId = await examWriteAccess(this.prisma, req, "exams.assessment.create", { examId: id });
    return this.exams.remove(schoolId, req.user.id, id, await teacherScope(this.prisma, req.user));
  }

  @Post(":id/duplicate")
  async duplicate(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const schoolId = assertExamAccess(req.user, "exams.manage");
    // Copying out of a closed year is fine; the copy lands in the year being viewed.
    await assertExamYearOpen(this.prisma, schoolId, { yearId: await resolveYearId(this.prisma, schoolId, req.schoolScope) });
    return this.exams.duplicate(schoolId, req.user.id, id, body);
  }

  @Post(":id/papers")
  async addPapers(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.exams.addPapers(await examWriteAccess(this.prisma, req, "exams.manage", { examId: id }), req.user.id, id, body);
  }

  @Post(":id/schedule")
  async schedule(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.exams.generateSchedule(await examWriteAccess(this.prisma, req, "exams.manage", { examId: id }), req.user.id, id, body);
  }
}

@Controller("console/exam-marks")
@UseGuards(AuthGuard)
export class ExamMarksController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(MarksService) private readonly marks: MarksService,
  ) {}

  @Get("papers")
  async papers(@Req() req: Req, @Query() query: { status?: string; examId?: string; classId?: string; q?: string }) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "marks.enter");
    return this.marks.papers(schoolId, yearId, query, scope);
  }

  @Get("papers/:paperId")
  async sheet(@Req() req: Req, @Param("paperId") paperId: string) {
    const schoolId = assertExamAccess(req.user, "exams.view");
    return this.marks.sheet(schoolId, paperId, req.user, await teacherScope(this.prisma, req.user));
  }

  @Put("papers/:paperId")
  async save(@Req() req: Req, @Param("paperId") paperId: string, @Body() body: unknown) {
    const schoolId = await examWriteAccess(this.prisma, req, "marks.enter", { paperIds: [paperId] });
    return this.marks.save(schoolId, req.user, paperId, body, await teacherScope(this.prisma, req.user));
  }

  @Post("review")
  review(@Req() req: Req, @Body() body: unknown) {
    return this.marks.review(assertExamAccess(req.user, "marks.review"), req.user.id, body);
  }

  @Post("papers/:paperId/reopen")
  async reopen(@Req() req: Req, @Param("paperId") paperId: string, @Body() body: unknown) {
    return this.marks.reopen(await examWriteAccess(this.prisma, req, "marks.review", { paperIds: [paperId] }), req.user.id, paperId, body);
  }

  @Get("corrections")
  async corrections(@Req() req: Req, @Query("status") status?: string) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "marks.correction.request");
    return this.marks.corrections(schoolId, yearId, status, scope, req.user.id);
  }

  @Post("corrections")
  async requestCorrection(@Req() req: Req, @Body() body: unknown) {
    const schoolId = assertExamAccess(req.user, "marks.correction.request");
    return this.marks.requestCorrection(schoolId, req.user, body, await teacherScope(this.prisma, req.user));
  }

  @Post("corrections/:id/review")
  async reviewCorrection(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.marks.reviewCorrection(await examWriteAccess(this.prisma, req, "marks.correction.review", { correctionId: id }), req.user.id, id, body);
  }
}

@Controller("console/exam-results")
@UseGuards(AuthGuard)
export class ExamResultsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ResultsService) private readonly results: ResultsService,
    @Inject(ReportCardService) private readonly reportCards: ReportCardService,
  ) {}

  @Get("class")
  async classResults(@Req() req: Req, @Query() query: { scope?: string; scopeId?: string; classId?: string }) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "results.view");
    return this.results.classResults(schoolId, yearId, query, scope);
  }

  @Get("students/:studentId")
  async student(@Req() req: Req, @Param("studentId") studentId: string, @Query("yearId") yearId?: string) {
    const schoolId = assertExamAccess(req.user, "results.view");
    return this.results.studentResults(schoolId, studentId, yearId || req.schoolScope?.yearId, await teacherScope(this.prisma, req.user));
  }

  @Get("report-cards")
  async reportCard(@Req() req: Req, @Query() query: ReportCardQuery, @Res() res: Response) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "results.view");
    return this.reportCards.pdf(schoolId, (query as { yearId?: string }).yearId || yearId, query, scope, res);
  }

  @Post("compute")
  async compute(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, yearId } = await examWriteContext(this.prisma, req, "results.manage");
    return this.results.compute(schoolId, req.user.id, yearId, body);
  }

  @Post("publish")
  async publish(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, yearId } = await examWriteContext(this.prisma, req, "results.manage");
    return this.results.publish(schoolId, req.user.id, yearId, body);
  }

  @Patch("remarks")
  remarks(@Req() req: Req, @Body() body: unknown) {
    return this.results.saveRemarks(assertExamAccess(req.user, "results.manage"), req.user.id, body);
  }
}

@Controller("console/exam-analytics")
@UseGuards(AuthGuard)
export class ExamAnalyticsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExamAnalyticsService) private readonly analytics: ExamAnalyticsService,
  ) {}

  @Get("scopes")
  async scopes(@Req() req: Req) {
    const { schoolId, yearId } = await examContext(this.prisma, req, "analytics.view");
    return this.analytics.scopes(schoolId, yearId);
  }

  @Get("classes")
  async classes(@Req() req: Req, @Query() query: { scope?: string; scopeId?: string }) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "analytics.view");
    return this.analytics.classPerformance(schoolId, yearId, query, scope);
  }

  @Get("subjects")
  async subjects(@Req() req: Req, @Query() query: { scope?: string; scopeId?: string; classId?: string }) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "analytics.view");
    return this.analytics.subjectPerformance(schoolId, yearId, query, scope);
  }

  @Get("students")
  async students(@Req() req: Req, @Query() query: { studentId?: string; classId?: string; page?: string; pageSize?: string }) {
    const { schoolId, yearId, scope } = await examContext(this.prisma, req, "analytics.view");
    return this.analytics.studentPerformance(schoolId, yearId, query, scope);
  }
}

@Controller("console/exam-settings")
@UseGuards(AuthGuard)
export class ExamSettingsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExamSettingsService) private readonly settings: ExamSettingsService,
  ) {}

  @Get("rules")
  rules(@Req() req: Req) {
    return this.settings.rules(assertExamAccess(req.user, "exams.view"));
  }

  @Patch("rules")
  updateRules(@Req() req: Req, @Body() body: unknown) {
    return this.settings.updateRules(assertExamAccess(req.user, "settings.manage"), req.user.id, body);
  }

  @Get("terms")
  async terms(@Req() req: Req) {
    const { schoolId, yearId } = await examContext(this.prisma, req, "exams.view");
    return this.settings.terms(schoolId, yearId);
  }

  @Post("terms")
  async createTerm(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, yearId } = await examWriteContext(this.prisma, req, "settings.manage");
    return this.settings.createTerm(schoolId, req.user.id, yearId, body);
  }

  @Patch("terms/:id")
  async updateTerm(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.settings.updateTerm(await examWriteAccess(this.prisma, req, "settings.manage", { termId: id }), req.user.id, id, body);
  }

  @Delete("terms/:id")
  async deleteTerm(@Req() req: Req, @Param("id") id: string) {
    return this.settings.deleteTerm(await examWriteAccess(this.prisma, req, "settings.manage", { termId: id }), req.user.id, id);
  }

  @Get("grading-scales")
  scales(@Req() req: Req) {
    return this.settings.scales(assertExamAccess(req.user, "exams.view"));
  }

  @Post("grading-scales")
  createScale(@Req() req: Req, @Body() body: unknown) {
    return this.settings.saveScale(assertExamAccess(req.user, "settings.manage"), req.user.id, null, body);
  }

  @Patch("grading-scales/:id")
  updateScale(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.settings.saveScale(assertExamAccess(req.user, "settings.manage"), req.user.id, id, body);
  }

  @Delete("grading-scales/:id")
  deleteScale(@Req() req: Req, @Param("id") id: string) {
    return this.settings.deleteScale(assertExamAccess(req.user, "settings.manage"), req.user.id, id);
  }

  @Get("report-templates")
  templates(@Req() req: Req) {
    return this.settings.templates(assertExamAccess(req.user, "exams.view"));
  }

  @Post("report-templates")
  createTemplate(@Req() req: Req, @Body() body: unknown) {
    return this.settings.saveTemplate(assertExamAccess(req.user, "settings.manage"), req.user.id, null, body);
  }

  @Patch("report-templates/:id")
  updateTemplate(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.settings.saveTemplate(assertExamAccess(req.user, "settings.manage"), req.user.id, id, body);
  }

  @Delete("report-templates/:id")
  deleteTemplate(@Req() req: Req, @Param("id") id: string) {
    return this.settings.deleteTemplate(assertExamAccess(req.user, "settings.manage"), req.user.id, id);
  }
}
