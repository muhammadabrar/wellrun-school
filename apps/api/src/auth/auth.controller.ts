import { Body, Controller, Get, Inject, Post, Req, Res, UseGuards } from "@nestjs/common";
import { forgotSchema, loginSchema, registerSchoolSchema, resetSchema, signupSchema } from "@wellrun/shared";
import type { Response } from "express";
import { clearTokenCookie, tokenCookie } from "../common/cookies";
import { AuthGuard } from "./auth.guard";
import { AuthService } from "./auth.service";

@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  private setAuth(res: Response, session: { token: string; user: unknown }) {
    res.setHeader("Set-Cookie", tokenCookie(session.token));
    return session;
  }

  @Post("signup")
  async signup(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const data = signupSchema.parse(body);
    return this.setAuth(res, await this.auth.signup(data.name, data.email, data.password));
  }

  @Post("register-school")
  async registerSchool(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const data = registerSchoolSchema.parse(body);
    return this.setAuth(res, await this.auth.registerSchool(data.name, data.email, data.password, data.schoolName));
  }

  @Post("login")
  async login(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const { email, password } = loginSchema.parse(body);
    return this.setAuth(res, await this.auth.login(email, password));
  }

  @Post("logout")
  logout(@Res({ passthrough: true }) res: Response) {
    res.setHeader("Set-Cookie", clearTokenCookie());
    return { ok: true };
  }

  @Post("forgot")
  forgot(@Body() body: unknown) {
    return this.auth.forgot(forgotSchema.parse(body).email);
  }

  @Post("reset")
  reset(@Body() body: unknown) {
    const data = resetSchema.parse(body);
    return this.auth.reset(data.token, data.password);
  }

  @Post("invite/accept")
  async accept(@Body() body: { token: string; password?: string; name?: string }, @Res({ passthrough: true }) res: Response) {
    return this.setAuth(res, await this.auth.acceptInvite(body.token, body.password, body.name));
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() req: { user: unknown }) {
    return req.user;
  }
}
