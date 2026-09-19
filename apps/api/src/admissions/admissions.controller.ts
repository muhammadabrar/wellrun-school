import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { AdmissionsService } from "./admissions.service";

@Controller("console/admissions")
@UseGuards(AuthGuard)
export class AdmissionsController {
  constructor(@Inject(AdmissionsService) private readonly admissions: AdmissionsService) {}

  @Get()
  list(
    @Req() req: { user: CurrentUser; schoolScope?: SchoolScope },
    @Query() query: Record<string, string | undefined>,
  ) {
    return this.admissions.list(requireSchoolAdmin(req.user), query, req.schoolScope);
  }

  @Get("summary")
  summary(@Req() req: { user: CurrentUser }) {
    return this.admissions.summary(requireSchoolAdmin(req.user));
  }

  @Get("duplicates")
  duplicates(@Req() req: { user: CurrentUser }, @Query() query: Record<string, string | undefined>) {
    return this.admissions.duplicates(requireSchoolAdmin(req.user), query);
  }

  @Post()
  create(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }, @Body() body: unknown) {
    return this.admissions.create(requireSchoolAdmin(req.user), req.user.id, body, req.schoolScope);
  }

  @Get(":id")
  byId(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.admissions.byId(requireSchoolAdmin(req.user), id);
  }

  @Patch(":id")
  patch(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.admissions.patch(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/submit")
  submit(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.admissions.submit(requireSchoolAdmin(req.user), req.user.id, id);
  }

  @Post(":id/review")
  review(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.admissions.review(requireSchoolAdmin(req.user), req.user.id, id);
  }

  @Post(":id/accept")
  accept(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.admissions.accept(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/waitlist")
  waitlist(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.admissions.waitlist(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/reject")
  reject(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.admissions.reject(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/withdraw")
  withdraw(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.admissions.withdraw(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/confirm")
  confirm(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.admissions.confirm(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/documents")
  uploadDocument(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.admissions.uploadDocument(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Delete(":id/documents/:documentId")
  removeDocument(
    @Req() req: { user: CurrentUser },
    @Param("id") id: string,
    @Param("documentId") documentId: string,
  ) {
    return this.admissions.removeDocument(requireSchoolAdmin(req.user), req.user.id, id, documentId);
  }

  @Post(":id/refresh")
  refresh(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.admissions.refreshStatus(requireSchoolAdmin(req.user), id);
  }
}
