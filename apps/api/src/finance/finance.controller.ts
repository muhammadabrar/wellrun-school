import { Body, Controller, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import { PrismaService } from "../prisma/prisma.service";
import { FinanceService, type LedgerQuery, type VoucherListQuery } from "./finance.service";

type Req = { user: CurrentUser };

/** The books are for the school admin only. Nothing here edits a voucher: a mistake is cancelled and written again. */
@Controller("console/finance")
@UseGuards(AuthGuard)
export class FinanceController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FinanceService) private readonly finance: FinanceService,
  ) {}

  @Get("overview")
  overview(@Req() req: Req) {
    return this.finance.overview(requireSchoolAdmin(req.user));
  }

  @Get("accounts")
  accounts(@Req() req: Req) {
    return this.finance.accounts(requireSchoolAdmin(req.user));
  }

  @Post("accounts")
  createAccount(@Req() req: Req, @Body() body: unknown) {
    return this.finance.createAccount(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Patch("accounts/:id")
  updateAccount(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.finance.updateAccount(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Get("categories")
  categories(@Req() req: Req) {
    return this.finance.categories(requireSchoolAdmin(req.user));
  }

  @Post("categories")
  createCategory(@Req() req: Req, @Body() body: unknown) {
    return this.finance.createCategory(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Patch("categories/:id")
  updateCategory(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.finance.updateCategory(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Get("vouchers")
  vouchers(@Req() req: Req, @Query() query: VoucherListQuery) {
    return this.finance.vouchers(requireSchoolAdmin(req.user), query);
  }

  @Post("vouchers")
  createVoucher(@Req() req: Req, @Body() body: unknown) {
    return this.finance.createVoucher(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Get("vouchers/:id")
  voucher(@Req() req: Req, @Param("id") id: string) {
    return this.finance.voucher(requireSchoolAdmin(req.user), id);
  }

  @Post("vouchers/:id/void")
  @HttpCode(200)
  voidVoucher(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.finance.voidVoucher(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Get("ledger")
  async ledger(@Req() req: Req, @Query() query: LedgerQuery) {
    const schoolId = requireSchoolAdmin(req.user);
    const result = await this.finance.ledger(schoolId, query);
    if (query.export === "1") await audit(this.prisma, { schoolId, actorId: req.user.id, action: "ledger_exported", entity: "finance_account", entityId: result.accountId ?? "all", summary: `${result.total} rows` });
    return result;
  }
}
