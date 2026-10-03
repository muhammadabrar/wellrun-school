import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin, requireSchoolId } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { resolveYearId, teacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { EventsService } from "./events.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

/** Everyone at school can read the calendar they are meant to see; only the admin writes events. */
@Controller("console/calendar")
@UseGuards(AuthGuard)
export class CalendarController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventsService) private readonly events: EventsService,
  ) {}

  @Get()
  async calendar(@Req() req: Req, @Query("from") from?: string, @Query("to") to?: string) {
    const schoolId = requireSchoolId(req.user);
    const [yearId, teacher] = await Promise.all([resolveYearId(this.prisma, schoolId, req.schoolScope), teacherScope(this.prisma, req.user)]);
    return this.events.calendar(schoolId, yearId, req.schoolScope?.campusId, teacher, { from, to });
  }
}

@Controller("console/events")
@UseGuards(AuthGuard)
export class EventsController {
  constructor(@Inject(EventsService) private readonly events: EventsService) {}

  @Get(":id")
  get(@Req() req: Req, @Param("id") id: string) {
    return this.events.get(requireSchoolId(req.user), id);
  }

  @Post()
  create(@Req() req: Req, @Body() body: unknown) {
    return this.events.create(requireSchoolAdmin(req.user), req.user, body);
  }

  @Patch(":id")
  update(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.events.update(requireSchoolAdmin(req.user), req.user, id, body);
  }

  @Delete(":id")
  remove(@Req() req: Req, @Param("id") id: string) {
    return this.events.remove(requireSchoolAdmin(req.user), req.user, id);
  }
}
