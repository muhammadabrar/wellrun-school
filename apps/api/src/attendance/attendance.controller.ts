import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Put, Query, Req, UseGuards } from "@nestjs/common";
import { saveAttendanceSchema } from "@wellrun/shared";
import { AuthGuard } from "../auth/auth.guard";
import { requireSchoolAdmin, requireSchoolId } from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";
import { AttendanceService } from "./attendance.service";
import { RegisterService } from "./register.service";
import { AttendanceReportsService } from "./reports.service";
import { attendanceContext, type AttendanceReq } from "./rules";
import { AttendanceSettingsService } from "./settings.service";

@Controller("console/attendance")
@UseGuards(AuthGuard)
export class AttendanceController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(AttendanceSettingsService) private readonly settings: AttendanceSettingsService,
    @Inject(RegisterService) private readonly register: RegisterService,
    @Inject(AttendanceReportsService) private readonly reports: AttendanceReportsService,
  ) {}

  @Get("absent")
  absent(@Req() req: AttendanceReq, @Query("date") date?: string) {
    requireSchoolId(req.user);
    return this.attendance.absent(req.user, date, req.schoolScope);
  }

  @Get("me/today")
  async today(@Req() req: AttendanceReq) {
    return this.attendance.today(await attendanceContext(this.prisma, req));
  }

  @Get("settings")
  getSettings(@Req() req: AttendanceReq) {
    return this.settings.get(requireSchoolId(req.user));
  }

  @Put("settings")
  saveSettings(@Req() req: AttendanceReq, @Body() body: unknown) {
    return this.settings.save(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Get("holidays")
  holidays(@Req() req: AttendanceReq, @Query("year") year?: string, @Query("yearId") yearId?: string) {
    return this.settings.holidays(requireSchoolId(req.user), year, yearId);
  }

  @Post("holidays")
  createHoliday(@Req() req: AttendanceReq, @Body() body: unknown) {
    return this.settings.createHoliday(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Patch("holidays/:id")
  updateHoliday(@Req() req: AttendanceReq, @Param("id") id: string, @Body() body: unknown) {
    return this.settings.updateHoliday(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Delete("holidays/:id")
  removeHoliday(@Req() req: AttendanceReq, @Param("id") id: string) {
    return this.settings.removeHoliday(requireSchoolAdmin(req.user), req.user.id, id);
  }

  @Get("register")
  async month(@Req() req: AttendanceReq, @Query() query: Record<string, string>) {
    return this.register.month(await attendanceContext(this.prisma, req), query);
  }

  @Put("register")
  async saveRegister(@Req() req: AttendanceReq, @Body() body: unknown) {
    return this.register.saveCells(await attendanceContext(this.prisma, req), body);
  }

  @Get("report")
  async report(@Req() req: AttendanceReq, @Query() query: Record<string, string>) {
    return this.reports.report(await attendanceContext(this.prisma, req), query);
  }

  @Get("overview")
  async overview(@Req() req: AttendanceReq, @Query("date") date?: string) {
    return this.reports.overview(await attendanceContext(this.prisma, req), date || undefined);
  }

  @Get()
  async records(@Req() req: AttendanceReq, @Query("classId") classId: string, @Query("date") date: string) {
    return this.attendance.day(await attendanceContext(this.prisma, req), classId, date);
  }

  @Post()
  async save(@Req() req: AttendanceReq, @Body() body: unknown) {
    const input = saveAttendanceSchema.parse(body);
    return this.attendance.save(await attendanceContext(this.prisma, req), input);
  }
}
