import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import { SetupService } from "./setup.service";

@Controller("console/setup")
@UseGuards(AuthGuard)
export class SetupController {
  constructor(@Inject(SetupService) private readonly setup: SetupService) {}

  @Get()
  overview(@Req() req: { user: CurrentUser }) {
    return this.setup.overview(requireSchoolAdmin(req.user));
  }

  @Post("org")
  org(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.saveOrg(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("campus")
  campus(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.saveCampus(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("campuses")
  addCampus(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.addCampus(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Patch("campuses/:id")
  updateCampus(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.setup.updateCampus(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("years")
  year(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.createYear(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Patch("years/:id")
  updateYear(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.setup.updateYear(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("classes")
  createClass(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.createClass(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Patch("classes/:id")
  updateClass(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.setup.updateClass(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post("classes/apply")
  applyClasses(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.applyClasses(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("subjects")
  subject(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.saveSubject(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("subjects/seed")
  seedSubjects(@Req() req: { user: CurrentUser }) {
    return this.setup.seedSubjects(requireSchoolAdmin(req.user), req.user.id);
  }

  @Post("subjects/apply")
  applySubjects(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.applySubjectTemplate(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("admission-form")
  admission(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.saveAdmissionForm(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("import-students")
  importStudents(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.importStudents(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("fees")
  fees(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.saveFees(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("fees/seed")
  seedFees(@Req() req: { user: CurrentUser }) {
    return this.setup.seedFees(requireSchoolAdmin(req.user));
  }

  @Post("roles")
  role(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.setup.addRole(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("complete")
  complete(@Req() req: { user: CurrentUser }) {
    return this.setup.complete(requireSchoolAdmin(req.user), req.user.id);
  }

  @Post("skip")
  skip(@Req() req: { user: CurrentUser }, @Query("step") step?: string) {
    return this.setup.skipTo(requireSchoolAdmin(req.user), Number(step || 0));
  }

  @Post("media")
  media(@Req() req: { user: CurrentUser }, @Body() body: { kind: "LOGO" | "COVER"; filename?: string; dataUrl: string }) {
    return this.setup.saveMedia(requireSchoolAdmin(req.user), body.kind, body.filename ?? "", body.dataUrl);
  }
}
