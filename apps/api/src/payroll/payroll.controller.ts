import { Body, Controller, Get, Inject, NotFoundException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { dateOnly, karachiToday } from "../common/date";
import { requireSchoolAdmin, requireSchoolId } from "../common/roles";
import { firstTeachingPeriod, staffForUser } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";
import { currentContract, payLines, StaffService } from "../staff/staff.service";
import { PayrollService } from "./payroll.service";

@Controller("console/payroll")
@UseGuards(AuthGuard)
export class PayrollController {
  constructor(@Inject(PayrollService) private readonly payroll: PayrollService) {}

  @Get()
  month(@Req() req: { user: CurrentUser }, @Query("period") period: string) {
    return this.payroll.month(requireSchoolAdmin(req.user), period);
  }

  @Post("generate")
  generate(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.payroll.generate(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("finalize")
  finalizeAll(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.payroll.finalizeAll(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Get("payslips/:id")
  payslip(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.payroll.payslip(requireSchoolAdmin(req.user), id);
  }

  @Patch("payslips/:id")
  update(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.payroll.update(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("payslips/:id/finalize")
  finalize(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.payroll.finalize(requireSchoolAdmin(req.user), req.user.id, id);
  }

  @Post("payslips/:id/pay")
  pay(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.payroll.pay(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("payslips/:id/cancel")
  cancel(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.payroll.cancel(requireSchoolAdmin(req.user), req.user.id, id);
  }
}

/** The signed-in staff member's own profile, timetable, first-period attendance and payslips. */
@Controller("console/me")
@UseGuards(AuthGuard)
export class PortalController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StaffService) private readonly staff: StaffService,
    @Inject(PayrollService) private readonly payroll: PayrollService,
  ) {}

  @Get()
  async me(@Req() req: { user: CurrentUser }) {
    const schoolId = requireSchoolId(req.user);
    const record = await staffForUser(this.prisma, req.user);
    if (!record) return { staff: null };
    const today = karachiToday();
    const weekday = dateOnly(today).getUTCDay();
    const [profile, week, payslips, period] = await Promise.all([
      this.prisma.staff.findUniqueOrThrow({
        where: { id: record.id },
        select: {
          id: true,
          employeeNo: true,
          name: true,
          cnic: true,
          title: true,
          department: true,
          status: true,
          joinDate: true,
          phone: true,
          email: true,
          campus: { select: { name: true } },
          contracts: { select: { type: true, startDate: true, endDate: true, basicSalaryPkr: true, allowances: true } },
        },
      }),
      this.staff.weekly(schoolId, record.id),
      this.payroll.forStaff(schoolId, record.id),
      firstTeachingPeriod(this.prisma, schoolId),
    ]);
    const firstClasses =
      period && weekday >= 1 && weekday <= 6
        ? week.lessons.filter((lesson) => lesson.weekday === weekday && lesson.periodId === period.id).map((lesson) => lesson.class)
        : [];
    const marked = firstClasses.length
      ? await this.prisma.attendanceRecord.groupBy({
          by: ["classId"],
          where: { schoolId, date: dateOnly(today), classId: { in: firstClasses.map((cls) => cls.id) } },
          _count: { _all: true },
        })
      : [];
    const markedIds = new Set(marked.map((row) => row.classId));
    const { contracts, ...rest } = profile;
    const contract = currentContract(contracts);
    return {
      staff: {
        ...rest,
        contract: contract ? { ...contract, allowances: payLines(contract.allowances) } : null,
      },
      today: { date: today, weekday },
      timetable: week,
      firstPeriod: period
        ? { period, classes: firstClasses.map((cls) => ({ ...cls, marked: markedIds.has(cls.id) })) }
        : null,
      payslips,
    };
  }

  @Get("payslips/:id")
  async payslip(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const schoolId = requireSchoolId(req.user);
    const record = await staffForUser(this.prisma, req.user);
    if (!record) throw new NotFoundException("Payslip not found");
    return this.payroll.payslip(schoolId, id, record.id);
  }
}
