import { Controller, Get, Inject, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolAdmin } from "../common/roles";
import type { SchoolScope } from "../common/school-scope";
import { resolveYearId } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { IdCardsService, type IdCardQuery } from "./id-cards.service";

type Req = { user: CurrentUser; schoolScope?: SchoolScope };

@Controller("console/id-cards")
@UseGuards(AuthGuard)
export class IdCardsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(IdCardsService) private readonly cards: IdCardsService,
  ) {}

  @Get("people")
  async people(@Req() req: Req, @Query() query: IdCardQuery) {
    const schoolId = requireSchoolAdmin(req.user);
    return this.cards.list(schoolId, await resolveYearId(this.prisma, schoolId, req.schoolScope), req.schoolScope?.campusId, query);
  }

  @Get("pdf")
  async pdf(@Req() req: Req, @Query() query: IdCardQuery, @Res() res: Response) {
    const schoolId = requireSchoolAdmin(req.user);
    return this.cards.pdf(schoolId, await resolveYearId(this.prisma, schoolId, req.schoolScope), req.schoolScope?.campusId, query, res);
  }
}
