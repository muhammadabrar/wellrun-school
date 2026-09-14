import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import { StudentsService } from "./students.service";

@Controller("console/students")
@UseGuards(AuthGuard)
export class StudentsController {
  constructor(@Inject(StudentsService) private readonly students: StudentsService) {}

  @Get()
  list(
    @Req() req: { user: CurrentUser },
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.students.list(requireSchoolAdmin(req.user), query);
  }

  @Get("guardians")
  guardians(@Req() req: { user: CurrentUser }, @Query("q") q?: string) {
    return this.students.guardians(requireSchoolAdmin(req.user), q);
  }

  @Post()
  create(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (payload.className || payload.guardianId || payload.guardian) {
      return this.students.admit(requireSchoolAdmin(req.user), req.user.id, body);
    }
    return this.students.create(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("admit")
  admit(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.students.admit(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post(":id/photo")
  photo(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: { dataUrl?: string }) {
    return this.students.savePhoto(requireSchoolAdmin(req.user), req.user.id, id, String(body.dataUrl || ""));
  }

  @Post(":id/guardians")
  guardian(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.linkGuardian(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Get(":id")
  byId(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.students.byId(requireSchoolAdmin(req.user), id);
  }

  @Patch(":id")
  update(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.update(requireSchoolAdmin(req.user), req.user.id, id, body);
  }
}
