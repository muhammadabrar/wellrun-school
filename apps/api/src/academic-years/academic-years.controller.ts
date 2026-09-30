import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import { AcademicYearsService } from "./academic-years.service";
import { RolloverService } from "./rollover.service";

type YearReq = { user: CurrentUser };

@Controller("console/academic-years")
@UseGuards(AuthGuard)
export class AcademicYearsController {
  constructor(
    @Inject(AcademicYearsService) private readonly years: AcademicYearsService,
    @Inject(RolloverService) private readonly rollover: RolloverService,
  ) {}

  @Get()
  list(@Req() req: YearReq) {
    return this.years.list(requireSchoolAdmin(req.user));
  }

  @Post()
  create(@Req() req: YearReq, @Body() body: unknown) {
    return this.years.create(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Patch(":id")
  update(@Req() req: YearReq, @Param("id") id: string, @Body() body: unknown) {
    return this.years.update(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Delete(":id")
  remove(@Req() req: YearReq, @Param("id") id: string) {
    return this.years.remove(requireSchoolAdmin(req.user), req.user.id, id);
  }

  @Get(":id/close-check")
  closeCheck(@Req() req: YearReq, @Param("id") id: string) {
    return this.years.closeCheck(requireSchoolAdmin(req.user), id);
  }

  @Post(":id/activate")
  activate(@Req() req: YearReq, @Param("id") id: string, @Body() body: unknown) {
    return this.years.activate(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/close")
  close(@Req() req: YearReq, @Param("id") id: string) {
    return this.years.close(requireSchoolAdmin(req.user), req.user.id, id);
  }

  @Post(":id/reopen")
  reopen(@Req() req: YearReq, @Param("id") id: string) {
    return this.years.reopen(requireSchoolAdmin(req.user), req.user.id, id);
  }

  @Post(":id/copy-setup")
  copySetup(@Req() req: YearReq, @Param("id") id: string, @Body() body: unknown) {
    return this.rollover.copySetup(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Get(":id/promotion-preview")
  promotionPreview(@Req() req: YearReq, @Param("id") id: string, @Query("fromYearId") fromYearId?: string) {
    return this.rollover.promotionPreview(requireSchoolAdmin(req.user), id, fromYearId);
  }

  @Post(":id/promotion")
  promote(@Req() req: YearReq, @Param("id") id: string, @Body() body: unknown) {
    return this.rollover.promote(requireSchoolAdmin(req.user), req.user.id, id, body);
  }
}
