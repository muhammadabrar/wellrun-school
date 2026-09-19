import { Body, Controller, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { teacherClassIds } from "../common/access";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin, requireSchoolId } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { PrismaService } from "../prisma/prisma.service";
import { StudentsService } from "./students.service";

@Controller("console/students")
@UseGuards(AuthGuard)
export class StudentsController {
  constructor(
    @Inject(StudentsService) private readonly students: StudentsService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(
    @Req() req: { user: CurrentUser; schoolScope?: SchoolScope },
    @Query() query: Record<string, string | undefined>,
  ) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.list(schoolId, query, classIds, req.schoolScope);
  }

  @Get("guardians")
  guardians(@Req() req: { user: CurrentUser }, @Query("q") q?: string) {
    return this.students.guardians(requireSchoolId(req.user), q);
  }

  @Post()
  create(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    const payload = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    if (payload.className || payload.guardianId || payload.guardian) {
      return this.students.admit(requireSchoolAdmin(req.user), req.user.id, body);
    }
    return this.students.create(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("admit")
  admit(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.students.admit(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post("bulk")
  bulk(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.students.bulk(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post(":id/photo")
  photo(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: { dataUrl?: string }) {
    return this.students.savePhoto(requireSchoolAdmin(req.user), req.user.id, id, String(body.dataUrl || ""));
  }

  @Post(":id/guardians")
  guardian(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.linkGuardian(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/promote")
  promote(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.promote(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/transfer")
  transfer(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.transfer(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/deactivate")
  deactivate(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.deactivate(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/documents")
  documents(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.uploadStudentDocument(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Post(":id/communications")
  communications(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.addCommunication(requireSchoolAdmin(req.user), req.user.id, id, body);
  }

  @Get(":id/enrollments")
  async enrollments(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.enrollments(schoolId, id, classIds);
  }

  @Get(":id/attendance")
  async attendance(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.attendanceTab(schoolId, id, classIds);
  }

  @Get(":id/fees")
  async fees(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.feesTab(schoolId, id, classIds);
  }

  @Get(":id/results")
  async results(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.resultsTab(schoolId, id, classIds);
  }

  @Get(":id/documents")
  async studentDocuments(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.documentsTab(schoolId, id, classIds);
  }

  @Get(":id/family")
  async family(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.familyTab(schoolId, id, classIds);
  }

  @Get(":id/activity")
  async activity(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.activityTab(schoolId, id, classIds);
  }

  @Get(":id/communications")
  async studentCommunications(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.communicationsTab(schoolId, id, classIds);
  }

  @Get(":id")
  async byId(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    const { schoolId, classIds } = await teacherClassIds(this.prisma, req.user);
    return this.students.byId(schoolId, id, classIds);
  }

  @Patch(":id")
  update(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.update(requireSchoolAdmin(req.user), req.user.id, id, body);
  }
}

@Controller("console/exams")
@UseGuards(AuthGuard)
export class ExamsController {
  constructor(@Inject(StudentsService) private readonly students: StudentsService) {}

  @Get()
  list(@Req() req: { user: CurrentUser }) {
    return this.students.exams(requireSchoolId(req.user));
  }

  @Post()
  create(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.students.createExam(requireSchoolAdmin(req.user), req.user.id, body);
  }

  @Post(":id/results")
  results(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.students.writeExamResult(requireSchoolAdmin(req.user), req.user.id, id, body);
  }
}
