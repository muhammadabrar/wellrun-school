import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin, requireSchoolId } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { LeaveService, type LeaveListQuery } from "./leave.service";
import { StaffAttendanceService } from "./staff-attendance.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

/** Attendance is recorded by the system, so an admin only reads it. There is no way to edit a mark. */
@Controller("console/staff-attendance")
@UseGuards(AuthGuard)
export class StaffAttendanceController {
  constructor(@Inject(StaffAttendanceService) private readonly attendance: StaffAttendanceService) {}

  @Get()
  day(@Req() req: Req, @Query("date") date?: string) {
    return this.attendance.day({ schoolId: requireSchoolAdmin(req.user), campusId: req.schoolScope?.campusId }, date);
  }

  @Get("month")
  month(@Req() req: Req, @Query("month") month?: string) {
    return this.attendance.month({ schoolId: requireSchoolAdmin(req.user), campusId: req.schoolScope?.campusId }, month);
  }

  /** The signed-in person's own day. Null when the login isn't linked to a staff record. */
  @Get("me")
  async me(@Req() req: Req) {
    const schoolId = requireSchoolId(req.user);
    return { today: await this.attendance.mine({ id: req.user.id, email: req.user.email, schoolId }) };
  }
}

@Controller("console/leave")
@UseGuards(AuthGuard)
export class LeaveController {
  constructor(@Inject(LeaveService) private readonly leave: LeaveService) {}

  @Get("mine")
  mine(@Req() req: Req) {
    requireSchoolId(req.user);
    return this.leave.mine(req.user);
  }

  @Post()
  request(@Req() req: Req, @Body() body: unknown) {
    requireSchoolId(req.user);
    return this.leave.request(req.user, body);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(@Req() req: Req, @Param("id") id: string) {
    requireSchoolId(req.user);
    return this.leave.cancel(req.user, id);
  }

  @Get()
  list(@Req() req: Req, @Query() query: LeaveListQuery) {
    return this.leave.list(requireSchoolAdmin(req.user), req.schoolScope?.campusId, query);
  }

  @Post(":id/decide")
  @HttpCode(200)
  decide(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.leave.decide(requireSchoolAdmin(req.user), req.user, id, body);
  }
}
