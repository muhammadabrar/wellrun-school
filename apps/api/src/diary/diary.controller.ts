import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin, requireSchoolId } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { resolveYearId, teacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { DiaryService, type DiaryListQuery } from "./diary.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

/** Teachers write the diary for their own classes; admins read it all and can take an entry down. */
@Controller("console/diary")
@UseGuards(AuthGuard)
export class DiaryController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DiaryService) private readonly diary: DiaryService,
  ) {}

  private async ctx(req: Req) {
    const schoolId = requireSchoolId(req.user);
    const [yearId, scope] = await Promise.all([resolveYearId(this.prisma, schoolId, req.schoolScope), teacherScope(this.prisma, req.user)]);
    return { schoolId, yearId, scope };
  }

  @Get("choices")
  async choices(@Req() req: Req) {
    const { schoolId, yearId, scope } = await this.ctx(req);
    return this.diary.choices(schoolId, yearId, scope);
  }

  @Get("today")
  async today(@Req() req: Req) {
    const { schoolId, yearId } = await this.ctx(req);
    return this.diary.today(schoolId, yearId, req.user);
  }

  @Get("overview")
  async overview(@Req() req: Req, @Query("date") date?: string) {
    const schoolId = requireSchoolAdmin(req.user);
    const yearId = await resolveYearId(this.prisma, schoolId, req.schoolScope);
    return this.diary.overview(schoolId, yearId, req.schoolScope?.campusId, date);
  }

  @Get()
  async list(@Req() req: Req, @Query() query: DiaryListQuery) {
    const { schoolId, yearId, scope } = await this.ctx(req);
    return this.diary.list(schoolId, yearId, req.user, scope, query);
  }

  @Post()
  async create(@Req() req: Req, @Body() body: unknown) {
    const { schoolId, yearId, scope } = await this.ctx(req);
    return this.diary.create(schoolId, yearId, req.user, scope, body);
  }

  @Patch(":id")
  async update(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const { schoolId, scope } = await this.ctx(req);
    return this.diary.update(schoolId, req.user, scope, id, body);
  }

  @Post(":id/copy")
  async copy(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    const { schoolId, yearId, scope } = await this.ctx(req);
    return this.diary.copy(schoolId, yearId, req.user, scope, id, body);
  }

  @Delete(":id")
  async remove(@Req() req: Req, @Param("id") id: string) {
    const { schoolId, scope } = await this.ctx(req);
    return this.diary.remove(schoolId, req.user, scope, id);
  }
}
