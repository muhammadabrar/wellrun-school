import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requirePlatform } from "../common/roles";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(AuthGuard)
export class AdminController {
  constructor(@Inject(AdminService) private readonly admin: AdminService) {}

  @Get("taxonomy")
  taxonomy(@Req() req: { user: CurrentUser }) {
    requirePlatform(req.user);
    return this.admin.taxonomy();
  }

  @Get("schools")
  schools(@Req() req: { user: CurrentUser }) {
    requirePlatform(req.user);
    return this.admin.schools();
  }

  @Post("schools")
  create(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    requirePlatform(req.user);
    return this.admin.create(req.user.id, body);
  }

  @Patch("schools/:id")
  update(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    requirePlatform(req.user);
    return this.admin.update(req.user.id, id, body);
  }

  @Delete("schools/:id")
  remove(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    requirePlatform(req.user);
    return this.admin.remove(req.user.id, id);
  }
}
