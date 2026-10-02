import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin, requireSchoolId } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { teacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { NoticesService, type NoticeListQuery } from "./notices.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

/** Admins post notices; teachers can read the ones that reach their classes. */
@Controller("console/notices")
@UseGuards(AuthGuard)
export class NoticesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NoticesService) private readonly notices: NoticesService,
  ) {}

  @Get()
  async list(@Req() req: Req, @Query() query: NoticeListQuery) {
    const schoolId = requireSchoolId(req.user);
    return this.notices.list(schoolId, req.schoolScope?.campusId, await teacherScope(this.prisma, req.user), query);
  }

  @Post()
  create(@Req() req: Req, @Body() body: unknown) {
    return this.notices.create(requireSchoolAdmin(req.user), req.schoolScope?.campusId, req.user, body);
  }

  @Patch(":id")
  update(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.notices.update(requireSchoolAdmin(req.user), req.user, id, body);
  }

  @Delete(":id")
  remove(@Req() req: Req, @Param("id") id: string) {
    return this.notices.remove(requireSchoolAdmin(req.user), req.user, id);
  }
}
