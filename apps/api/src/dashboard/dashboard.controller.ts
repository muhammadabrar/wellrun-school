import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolId } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { DashboardService } from "./dashboard.service";

@Controller("console/dashboard")
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(@Inject(DashboardService) private readonly dashboard: DashboardService) {}

  @Get()
  summary(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }) {
    return this.dashboard.summary(requireSchoolId(req.user), req.schoolScope);
  }
}
