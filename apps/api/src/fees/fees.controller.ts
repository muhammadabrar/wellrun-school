import { Body, Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import { createPaymentSchema } from "@wellrun/shared";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { FeesService } from "./fees.service";

@Controller("console")
@UseGuards(AuthGuard)
export class FeesController {
  constructor(@Inject(FeesService) private readonly fees: FeesService) {}

  @Get("invoices")
  invoices(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }) {
    return this.fees.invoices(requireSchoolAdmin(req.user), req.schoolScope);
  }

  @Post("payments")
  pay(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.fees.pay(requireSchoolAdmin(req.user), createPaymentSchema.parse(body));
  }

  @Get("payments/:id")
  receipt(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.fees.receipt(requireSchoolAdmin(req.user), id);
  }
}
