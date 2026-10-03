import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import { StaffService } from "./staff.service";

@Controller("console")
@UseGuards(AuthGuard)
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get("staff")
  list(@Req() req: { user: CurrentUser }, @Query() query: { status?: string; q?: string; page?: string; pageSize?: string }) {
    return this.staff.list(requireSchoolAdmin(req.user), query);
  }

  @Get("staff/roster")
  roster(@Req() req: { user: CurrentUser }) {
    return this.staff.roster(requireSchoolAdmin(req.user));
  }

  @Post("staff")
  create(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.staff.create(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Get("staff/:id")
  detail(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.staff.detail(requireSchoolAdmin(req.user), id);
  }

  @Get("staff/:id/timetable")
  timetable(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.staff.weekly(requireSchoolAdmin(req.user), id);
  }

  @Patch("staff/:id")
  update(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.update(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("staff/:id/status")
  status(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.changeStatus(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("staff/:id/contracts")
  contract(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.addContract(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("staff/:id/photo")
  photo(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: { image?: string }) {
    return this.staff.savePhoto(requireSchoolAdmin(req.user), req.user.id, id, body?.image ?? "");
  }

  @Put("staff/:id/account")
  account(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.staff.saveAccount(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("staff/:id/assign")
  assign(
    @Req() req: { user: CurrentUser },
    @Param("id") id: string,
    @Body() body: { classId: string; subject?: string },
  ) {
    return this.staff.assign(requireSchoolAdmin(req.user), req.user.id, id, body.classId, body.subject);
  }

  @Delete("staff/:id/assign/:assignmentId")
  unassign(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Param("assignmentId") assignmentId: string) {
    return this.staff.unassign(requireSchoolAdmin(req.user), req.user.id, id, assignmentId);
  }

  @Get("invites")
  invites(@Req() req: { user: CurrentUser }) {
    return this.staff.invites(requireSchoolAdmin(req.user));
  }

  @Post("invites")
  invite(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.staff.invite(requireSchoolAdmin(req.user), req.user.id, body);
  }
}
