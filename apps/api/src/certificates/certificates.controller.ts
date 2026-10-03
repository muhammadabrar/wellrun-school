import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import { CertificatesService, type CertificateListQuery } from "./certificates.service";

type Req = { user: CurrentUser };

/** Certificates are issued and withdrawn by the school admin. */
@Controller("console/certificates")
@UseGuards(AuthGuard)
export class CertificatesController {
  constructor(@Inject(CertificatesService) private readonly certificates: CertificatesService) {}

  @Get("templates")
  templates(@Req() req: Req) {
    return this.certificates.templates(requireSchoolAdmin(req.user));
  }

  @Put("templates/:type")
  saveTemplate(@Req() req: Req, @Param("type") type: string, @Body() body: unknown) {
    return this.certificates.saveTemplate(requireSchoolAdmin(req.user), req.user.id, type, body);
  }

  @Delete("templates/:type")
  resetTemplate(@Req() req: Req, @Param("type") type: string) {
    return this.certificates.resetTemplate(requireSchoolAdmin(req.user), req.user.id, type);
  }

  @Post("preview")
  @HttpCode(200)
  preview(@Req() req: Req, @Body() body: unknown) {
    return this.certificates.preview(requireSchoolAdmin(req.user), body);
  }

  @Post()
  issue(@Req() req: Req, @Body() body: unknown) {
    return this.certificates.issue(requireSchoolAdmin(req.user), req.user, body);
  }

  @Get()
  list(@Req() req: Req, @Query() query: CertificateListQuery) {
    return this.certificates.list(requireSchoolAdmin(req.user), query);
  }

  @Get(":id/pdf")
  pdf(@Req() req: Req, @Param("id") id: string, @Res() res: Response) {
    return this.certificates.pdf(requireSchoolAdmin(req.user), id, res);
  }

  @Post(":id/revoke")
  @HttpCode(200)
  revoke(@Req() req: Req, @Param("id") id: string, @Body() body: unknown) {
    return this.certificates.revoke(requireSchoolAdmin(req.user), req.user, id, body);
  }
}
