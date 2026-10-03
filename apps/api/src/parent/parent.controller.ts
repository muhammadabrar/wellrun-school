import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import type { ParentSession } from "@wellrun/shared";
import { ParentAuthService } from "./parent-auth.service";
import { ParentGuard, type CurrentParent } from "./parent.guard";
import { ParentService } from "./parent.service";

type Req = { parent: CurrentParent };

/** Sign-in for parents: a phone number and a code, like WhatsApp. No password. */
@Controller("parent/auth")
export class ParentAuthController {
  constructor(
    @Inject(ParentAuthService) private readonly auth: ParentAuthService,
    @Inject(ParentService) private readonly parent: ParentService,
  ) {}

  @Post("request-otp")
  @HttpCode(200)
  requestOtp(@Body() body: unknown) {
    return this.auth.requestOtp(body);
  }

  @Post("verify-otp")
  @HttpCode(200)
  async verifyOtp(@Body() body: unknown): Promise<ParentSession> {
    const { token, parentId } = await this.auth.verifyOtp(body);
    const profile = await this.parent.profileById(parentId);
    return { token, ...(await this.parent.me(profile)) };
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(ParentGuard)
  logout(@Req() req: Req) {
    return this.auth.logout(req.parent.deviceId);
  }
}

/** Everything a parent can see about their own children. Each child route is checked against the parent's phone. */
@Controller("parent")
@UseGuards(ParentGuard)
export class ParentController {
  constructor(
    @Inject(ParentAuthService) private readonly auth: ParentAuthService,
    @Inject(ParentService) private readonly parent: ParentService,
  ) {}

  @Get("me")
  me(@Req() req: Req) {
    return this.parent.me(req.parent);
  }

  @Patch("me")
  updateMe(@Req() req: Req, @Body() body: unknown) {
    return this.parent.updateProfile(req.parent, body);
  }

  @Get("devices")
  devices(@Req() req: Req) {
    return this.auth.devices(req.parent.id, req.parent.deviceId);
  }

  @Delete("devices/:id")
  revokeDevice(@Req() req: Req, @Param("id") id: string) {
    return this.auth.revokeDevice(req.parent.id, id);
  }

  @Get("children/:id/summary")
  summary(@Req() req: Req, @Param("id") id: string) {
    return this.parent.summary(req.parent, id);
  }

  @Get("children/:id/attendance")
  attendance(@Req() req: Req, @Param("id") id: string, @Query("month") month?: string) {
    return this.parent.attendance(req.parent, id, month);
  }

  @Get("children/:id/diary")
  diary(@Req() req: Req, @Param("id") id: string, @Query("date") date?: string) {
    return this.parent.diary(req.parent, id, date);
  }

  @Get("children/:id/fees")
  fees(@Req() req: Req, @Param("id") id: string) {
    return this.parent.fees(req.parent, id);
  }

  @Get("children/:id/invoices/:invoiceId/challan")
  challan(@Req() req: Req, @Param("id") id: string, @Param("invoiceId") invoiceId: string, @Res() res: Response) {
    return this.parent.challanPdf(req.parent, id, invoiceId, res);
  }

  @Get("children/:id/payments/:paymentId/receipt")
  receipt(@Req() req: Req, @Param("id") id: string, @Param("paymentId") paymentId: string, @Res() res: Response) {
    return this.parent.receiptPdf(req.parent, id, paymentId, res);
  }

  @Get("children/:id/results")
  results(@Req() req: Req, @Param("id") id: string) {
    return this.parent.results(req.parent, id);
  }

  @Get("children/:id/results/:resultId/report-card")
  reportCard(@Req() req: Req, @Param("id") id: string, @Param("resultId") resultId: string, @Res() res: Response) {
    return this.parent.reportCardPdf(req.parent, id, resultId, res);
  }

  @Get("children/:id/timetable")
  timetable(@Req() req: Req, @Param("id") id: string) {
    return this.parent.timetable(req.parent, id);
  }

  @Get("children/:id/calendar")
  calendar(@Req() req: Req, @Param("id") id: string, @Query("from") from?: string, @Query("to") to?: string) {
    return this.parent.calendar(req.parent, id, from, to);
  }

  @Get("children/:id/notices")
  notices(@Req() req: Req, @Param("id") id: string) {
    return this.parent.notices(req.parent, id);
  }
}
