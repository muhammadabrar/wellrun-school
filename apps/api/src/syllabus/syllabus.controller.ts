import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import type { SchoolScope } from "../common/school-scope";
import { assertExamAccess, resolveYearId, teacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { assertSyllabusAccess, type SyllabusAction } from "./access";
import { SyllabusService, type SyllabusListQuery } from "./syllabus.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

@Controller("console/syllabus")
@UseGuards(AuthGuard)
export class SyllabusController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SyllabusService) private readonly syllabus: SyllabusService,
  ) {}

  /** School, the academic year from X-Year-Id, and the teacher's class/subject scope (null for admins). */
  private async ctx(req: Req, action: SyllabusAction) {
    const schoolId = assertSyllabusAccess(req.user, action);
    const [yearId, teacher] = await Promise.all([resolveYearId(this.prisma, schoolId, req.schoolScope), teacherScope(this.prisma, req.user)]);
    return { schoolId, yearId, teacher };
  }

  private async teacher(req: Req, action: SyllabusAction) {
    const schoolId = assertSyllabusAccess(req.user, action);
    return { schoolId, teacher: await teacherScope(this.prisma, req.user) };
  }

  // Reads ---------------------------------------------------------------------------------------------------------

  @Get("overview")
  async overview(@Req() req: Req) {
    const { schoolId, yearId, teacher } = await this.ctx(req, "syllabus.view");
    return this.syllabus.overview(schoolId, yearId, teacher);
  }

  @Get()
  async list(@Req() req: Req, @Query() query: SyllabusListQuery) {
    const { schoolId, yearId, teacher } = await this.ctx(req, "syllabus.view");
    return this.syllabus.list(schoolId, yearId, query, teacher);
  }

  @Get("sources")
  async sources(@Req() req: Req, @Query() query: { subjectId?: string }) {
    const { schoolId, yearId, teacher } = await this.ctx(req, "syllabus.edit");
    return this.syllabus.sources(schoolId, yearId, query, teacher);
  }

  @Get("coverage/options")
  async coverageOptions(@Req() req: Req, @Query() query: { gradeName?: string; subjectId?: string }) {
    const schoolId = assertExamAccess(req.user, "exams.view");
    const [yearId, teacher] = await Promise.all([resolveYearId(this.prisma, schoolId, req.schoolScope), teacherScope(this.prisma, req.user)]);
    return this.syllabus.coverageOptions(schoolId, yearId, query, teacher);
  }

  @Get("coverage/paper/:paperId")
  async paperCoverage(@Req() req: Req, @Param("paperId") paperId: string) {
    const schoolId = assertExamAccess(req.user, "exams.view");
    return this.syllabus.paperCoverage(schoolId, paperId, await teacherScope(this.prisma, req.user));
  }

  @Put("coverage/paper/:paperId")
  setPaperCoverage(@Req() req: Req, @Param("paperId") paperId: string, @Body() body: unknown) {
    return this.syllabus.setPaperCoverage(assertExamAccess(req.user, "exams.manage"), req.user.id, paperId, body);
  }

  @Get(":id")
  async detail(@Req() req: Req, @Param("id") id: string) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.view");
    return this.syllabus.detail(schoolId, id, teacher);
  }

  // Syllabus ----------------------------------------------------------------------------------------------------------

  @Post()
  async create(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, yearId, teacher } = await this.ctx(req, "syllabus.edit");
    return this.syllabus.create(schoolId, req.user.id, yearId, body, teacher);
  }

  @Post("copy-year")
  async copyYear(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, yearId } = await this.ctx(req, "syllabus.manage");
    return this.syllabus.copyYear(schoolId, req.user.id, yearId, body);
  }

  @Patch(":id")
  async update(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.update(schoolId, req.user.id, id, body, teacher);
  }

  @Delete(":id")
  async remove(@Req() req: Req, @Param("id") id: string) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.remove(schoolId, req.user.id, id, teacher);
  }

  // Units ---------------------------------------------------------------------------------------------------------------

  @Post(":id/units")
  async createUnit(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.createUnit(schoolId, req.user.id, id, body, teacher);
  }

  @Put(":id/units/order")
  async reorderUnits(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.reorderUnits(schoolId, req.user.id, id, body, teacher);
  }

  @Patch("units/:unitId")
  async updateUnit(@Req() req: Req, @Param("unitId") unitId: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.updateUnit(schoolId, req.user.id, unitId, body, teacher);
  }

  @Delete("units/:unitId")
  async removeUnit(@Req() req: Req, @Param("unitId") unitId: string) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.removeUnit(schoolId, req.user.id, unitId, teacher);
  }

  // Topics --------------------------------------------------------------------------------------------------------------

  @Post("units/:unitId/topics")
  async createTopics(@Req() req: Req, @Param("unitId") unitId: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.createTopics(schoolId, req.user.id, unitId, body, teacher);
  }

  @Put("units/:unitId/topics/order")
  async reorderTopics(@Req() req: Req, @Param("unitId") unitId: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.reorderTopics(schoolId, req.user.id, unitId, body, teacher);
  }

  @Post("topics/progress")
  async progressBulk(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.setProgressBulk(schoolId, req.user.id, body, teacher);
  }

  @Patch("topics/:topicId")
  async updateTopic(@Req() req: Req, @Param("topicId") topicId: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.updateTopic(schoolId, req.user.id, topicId, body, teacher);
  }

  @Delete("topics/:topicId")
  async removeTopic(@Req() req: Req, @Param("topicId") topicId: string) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.removeTopic(schoolId, req.user.id, topicId, teacher);
  }

  @Patch("topics/:topicId/progress")
  async progress(@Req() req: Req, @Param("topicId") topicId: string, @Body() body: unknown) {
    const { schoolId, teacher } = await this.teacher(req, "syllabus.edit");
    return this.syllabus.setProgress(schoolId, req.user.id, topicId, body, teacher);
  }
}
