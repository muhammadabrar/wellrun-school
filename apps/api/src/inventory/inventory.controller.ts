import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import { InventoryService, type InventoryListQuery } from "./inventory.service";

type Req = { user: CurrentUser };

@Controller("console/inventory")
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(@Inject(InventoryService) private readonly inventory: InventoryService) {}

  @Get("summary")
  summary(@Req() req: Req) {
    return this.inventory.summary(requireSchoolAdmin(req.user));
  }

  @Get("items")
  list(@Req() req: Req, @Query() query: InventoryListQuery) {
    return this.inventory.list(requireSchoolAdmin(req.user), query);
  }

  @Post("items")
  create(@Req() req: Req, @Body() body: unknown) {
    return this.inventory.createItem(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Get("items/:id")
  detail(@Req() req: Req, @Param("id") id: string) {
    return this.inventory.detail(requireSchoolAdmin(req.user), id);
  }

  @Patch("items/:id")
  update(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.inventory.updateItem(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("items/:id/movements")
  addMovement(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.inventory.addMovement(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("movements/:id/void")
  @HttpCode(200)
  voidMovement(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.inventory.voidMovement(requireSchoolAdmin(req.user), req.user.id, id, body);
  }
}
