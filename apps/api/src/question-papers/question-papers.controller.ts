import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import type { SchoolScope } from "../common/school-scope";
import { assertExamAccess, resolveYearId, teacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { QuestionPapersService, type QuestionPaperListQuery } from "./question-papers.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

/**
 * Teachers write papers for the class + subject they teach (the service enforces that per paper);
 * admins review, reopen and print. Both reuse the exam permissions: marks.enter for authors, marks.review for admins.
 */
@Controller("console/question-papers")
@UseGuards(AuthGuard)
export class QuestionPapersController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QuestionPapersService) private readonly papers: QuestionPapersService,
  ) {}

  private async author(req: Req) {
    const schoolId = assertExamAccess(req.user, "marks.enter");
    return { schoolId, teacher: await teacherScope(this.prisma, req.user) };
  }

  private async authorInYear(req: Req) {
    const { schoolId, teacher } = await this.author(req);
    return { schoolId, teacher, yearId: await resolveYearId(this.prisma, schoolId, req.schoolScope) };
  }

  @Get()
  async list(@Req() req: Req, @Query() query: QuestionPaperListQuery) {
    const { schoolId, teacher, yearId } = await this.authorInYear(req);
    return this.papers.list(schoolId, yearId, query, teacher);
  }

  @Get("todo")
  async todo(@Req() req: Req) {
    const { schoolId, teacher, yearId } = await this.authorInYear(req);
    return this.papers.todo(schoolId, yearId, teacher);
  }

  @Post()
  async create(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.create(schoolId, req.user, body, teacher);
  }

  @Get(":id")
  async detail(@Req() req: Req, @Param("id") id: string) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.detail(schoolId, id, req.user, teacher);
  }

  @Patch(":id")
  async update(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.update(schoolId, req.user, id, body, teacher);
  }

  @Delete(":id")
  async remove(@Req() req: Req, @Param("id") id: string) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.remove(schoolId, req.user, id, teacher);
  }

  @Post(":id/submit")
  async submit(@Req() req: Req, @Param("id") id: string) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.submit(schoolId, req.user, id, teacher);
  }

  @Post(":id/review")
  review(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.papers.review(assertExamAccess(req.user, "marks.review"), req.user.id, id, body);
  }

  @Post(":id/reopen")
  reopen(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.papers.reopen(assertExamAccess(req.user, "marks.review"), req.user.id, id, body);
  }

  @Post(":id/prints")
  print(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.papers.recordPrint(assertExamAccess(req.user, "marks.review"), req.user.id, id, body);
  }

  @Post(":id/sections")
  async createSection(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.createSection(schoolId, req.user, id, body, teacher);
  }

  @Put(":id/sections/order")
  async reorderSections(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.reorderSections(schoolId, req.user, id, body, teacher);
  }

  @Patch("sections/:sectionId")
  async updateSection(@Req() req: Req, @Param("sectionId") sectionId: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.updateSection(schoolId, req.user, sectionId, body, teacher);
  }

  @Delete("sections/:sectionId")
  async removeSection(@Req() req: Req, @Param("sectionId") sectionId: string) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.removeSection(schoolId, req.user, sectionId, teacher);
  }

  @Post("sections/:sectionId/questions")
  async createQuestions(@Req() req: Req, @Param("sectionId") sectionId: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.createQuestions(schoolId, req.user, sectionId, body, teacher);
  }

  @Put("sections/:sectionId/questions/order")
  async reorderQuestions(@Req() req: Req, @Param("sectionId") sectionId: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.reorderQuestions(schoolId, req.user, sectionId, body, teacher);
  }

  @Patch("questions/:questionId")
  async updateQuestion(@Req() req: Req, @Param("questionId") questionId: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.updateQuestion(schoolId, req.user, questionId, body, teacher);
  }

  @Delete("questions/:questionId")
  async removeQuestion(@Req() req: Req, @Param("questionId") questionId: string) {
    const { schoolId, teacher } = await this.author(req);
    return this.papers.removeQuestion(schoolId, req.user, questionId, teacher);
  }
}
