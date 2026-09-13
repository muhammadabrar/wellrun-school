import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import { StaffService } from "./staff.service";

@Controller("console")
@UseGuards(AuthGuard)
export class StaffController {
  constructor(@Inject(StaffService) private readonly staff: StaffService) {}

  @Get("staff")
  list(@Req() req: { user: CurrentUser }) {
    return this.staff.list(requireSchoolAdmin(req.user));
  }

  @Post("staff")
  create(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.staff.create(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("staff/:id/assign")
  assign(
    @Req() req: { user: CurrentUser },
    @Param("id") id: string,
    @Body() body: { classId: string; subject?: string },
  ) {
    return this.staff.assign(requireSchoolAdmin(req.user), req.user.id, id, body.classId, body.subject);
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
