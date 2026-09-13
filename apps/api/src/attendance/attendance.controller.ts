import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import { saveAttendanceSchema } from "@wellrun/shared";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolId } from "../common/roles";
import { AttendanceService } from "./attendance.service";

@Controller("console/attendance")
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}

  @Get("classes")
  classes(@Req() req: { user: CurrentUser }) {
    requireSchoolId(req.user);
    return this.attendance.classes(req.user);
  }

  @Get("absent")
  absent(@Req() req: { user: CurrentUser }, @Query("date") date?: string) {
    requireSchoolId(req.user);
    return this.attendance.absent(req.user, date);
  }

  @Get()
  records(
    @Req() req: { user: CurrentUser },
    @Query("classId") classId: string,
    @Query("date") date: string,
  ) {
    return this.attendance.records(requireSchoolId(req.user), classId, date);
  }

  @Post()
  save(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    requireSchoolId(req.user);
    return this.attendance.save(req.user, saveAttendanceSchema.parse(body));
  }
}
