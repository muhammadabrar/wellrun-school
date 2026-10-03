import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import type { SchoolScope } from "../common/school-scope";
import { assertExamAccess, resolveYearId, teacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { QuestionBankService, type BankListQuery } from "./question-bank.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

/** Teachers keep questions for the grade and subject they teach; admins for everything. Same people who write papers. */
@Controller("console/question-bank")
@UseGuards(AuthGuard)
export class QuestionBankController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QuestionBankService) private readonly bank: QuestionBankService,
  ) {}

  private async ctx(req: Req) {
    const schoolId = assertExamAccess(req.user, "marks.enter");
    const [teacher, yearId] = await Promise.all([teacherScope(this.prisma, req.user), resolveYearId(this.prisma, schoolId, req.schoolScope)]);
    return { schoolId, teacher, yearId };
  }

  @Get("choices")
  async choices(@Req() req: Req) {
    const { schoolId, teacher, yearId } = await this.ctx(req);
    return this.bank.choices(schoolId, yearId, teacher);
  }

  @Get("topics")
  async topics(@Req() req: Req, @Query("gradeName") gradeName?: string, @Query("subjectId") subjectId?: string) {
    const { schoolId, teacher, yearId } = await this.ctx(req);
    return this.bank.topics(schoolId, yearId, { gradeName, subjectId }, teacher);
  }

  @Get()
  async list(@Req() req: Req, @Query() query: BankListQuery) {
    const { schoolId, teacher, yearId } = await this.ctx(req);
    return this.bank.list(schoolId, yearId, req.user, teacher, query);
  }

  @Post()
  async create(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, teacher, yearId } = await this.ctx(req);
    return this.bank.create(schoolId, yearId, req.user, teacher, body);
  }

  @Post("from-question")
  @HttpCode(200)
  async fromQuestion(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, teacher, yearId } = await this.ctx(req);
    return this.bank.fromQuestion(schoolId, yearId, req.user, teacher, body);
  }

  @Patch(":id")
  async update(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const { schoolId, teacher, yearId } = await this.ctx(req);
    return this.bank.update(schoolId, yearId, req.user, teacher, id, body);
  }

  @Post(":id/archive")
  @HttpCode(200)
  async archive(@Req() req: Req, @Param("id") id: string) {
    const { schoolId, teacher, yearId } = await this.ctx(req);
    return this.bank.setActive(schoolId, yearId, req.user, teacher, id, false);
  }

  @Post(":id/restore")
  @HttpCode(200)
  async restore(@Req() req: Req, @Param("id") id: string) {
    const { schoolId, teacher, yearId } = await this.ctx(req);
    return this.bank.setActive(schoolId, yearId, req.user, teacher, id, true);
  }
}
