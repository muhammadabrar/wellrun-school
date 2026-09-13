import { Body, Controller, Delete, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin, requireSchoolId } from "../common/roles";
import { TimetableService } from "./timetable.service";

@Controller("console/timetable")
@UseGuards(AuthGuard)
export class TimetableController {
  constructor(@Inject(TimetableService) private readonly timetable: TimetableService) {}

  @Get("periods")
  periods(@Req() req: { user: CurrentUser }) {
    return this.timetable.periods(requireSchoolId(req.user));
  }

  @Post("periods")
  savePeriod(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.timetable.savePeriod(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Get()
  grid(@Req() req: { user: CurrentUser }, @Query("classId") classId?: string) {
    return this.timetable.grid(requireSchoolId(req.user), classId, req.user);
  }

  @Post("lessons")
  lesson(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.timetable.upsertLesson(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Delete("lessons/:id")
  remove(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.timetable.removeLesson(requireSchoolAdmin(req.user), req.user.id, id);
  }
}
