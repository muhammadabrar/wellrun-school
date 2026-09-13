import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requirePlatform } from "../common/roles";
import { ClaimsService } from "./claims.service";

@Controller()
export class ClaimsController {
  constructor(@Inject(ClaimsService) private readonly claims: ClaimsService) {}

  @Post("claims")
  @UseGuards(AuthGuard)
  submit(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.claims.submit(req.user.id, body);
  }

  @Get("claims/mine")
  @UseGuards(AuthGuard)
  mine(@Req() req: { user: CurrentUser }) {
    return this.claims.mine(req.user.id);
  }

  @Get("admin/claims")
  @UseGuards(AuthGuard)
  queue(@Req() req: { user: CurrentUser }) {
    requirePlatform(req.user);
    return this.claims.queue();
  }

  @Post("admin/claims/:id/approve")
  @UseGuards(AuthGuard)
  approve(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    requirePlatform(req.user);
    return this.claims.decide(req.user.id, id, "APPROVED");
  }

  @Post("admin/claims/:id/reject")
  @UseGuards(AuthGuard)
  reject(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: { reason?: string }) {
    requirePlatform(req.user);
    return this.claims.decide(req.user.id, id, "REJECTED", body.reason);
  }
}
