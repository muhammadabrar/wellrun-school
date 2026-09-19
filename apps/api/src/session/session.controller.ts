import { Controller, Get, Inject, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { SessionService } from "./session.service";

@Controller("console/session")
@UseGuards(AuthGuard)
export class SessionController {
  constructor(@Inject(SessionService) private readonly session: SessionService) {}

  @Get()
  load(@Req() req: { user: CurrentUser }) {
    return this.session.forSchool(req.user.schoolId);
  }
}
