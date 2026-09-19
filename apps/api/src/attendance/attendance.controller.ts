import { Body, Controller, Get, Inject, Post, Query, Req, UseGuards } from "@nestjs/common";
import { saveAttendanceSchema } from "@wellrun/shared";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolId } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { AttendanceService } from "./attendance.service";

@Controller("console/attendance")
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendance: AttendanceService) {}

  @Get("absent")
  absent(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }, @Query("date") date?: string) {
    requireSchoolId(req.user);
    return this.attendance.absent(req.user, date, req.schoolScope);
  }

  @Get()
  records(
    @Req() req: { user: CurrentUser },
    @Query("classId") classId: string,
    @Query("date") date: string,
  ) {
    return this.attendance.day(requireSchoolId(req.user), classId, date);
  }

  @Post()
  save(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    requireSchoolId(req.user);
    return this.attendance.save(req.user, saveAttendanceSchema.parse(body));
  }
}
