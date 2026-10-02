import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { REPORTS, type ReportParams } from "@wellrun/shared";
import { AuthGuard } from "../auth/auth.guard";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { resolveYearId } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { ReportsService } from "./reports.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

/** The reports hub is for the school admin only: it reads across every part of the school. */
@Controller("console/reports")
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReportsService) private readonly reports: ReportsService,
  ) {}

  private async ctx(req: Req) {
    const schoolId = requireSchoolAdmin(req.user);
    return { schoolId, yearId: await resolveYearId(this.prisma, schoolId, req.schoolScope), campusId: req.schoolScope?.campusId };
  }

  @Get("catalog")
  catalog(@Req() req: Req) {
    requireSchoolAdmin(req.user);
    return REPORTS;
  }

  @Get("scopes")
  async scopes(@Req() req: Req) {
    return this.reports.scopes(await this.ctx(req));
  }

  @Get("ratios")
  async ratios(@Req() req: Req, @Query() query: ReportParams) {
    return this.reports.ratios(await this.ctx(req), query);
  }

  @Get(":id")
  async run(@Req() req: Req, @Param("id") id: string, @Query() query: ReportParams) {
    const ctx = await this.ctx(req);
    const result = await this.reports.run(ctx, id, query);
    if (query.export === "1") {
      await audit(this.prisma, { schoolId: ctx.schoolId, actorId: req.user.id, action: "report_exported", entity: "report", entityId: id, summary: `${result.total} rows` });
    }
    return result;
  }
}
