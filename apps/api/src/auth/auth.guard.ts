import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { readCookie } from "../common/cookies";
import { PrismaService } from "../prisma/prisma.service";
import { atMs, getRequestTrace } from "../trace/request-context";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(JwtService) private readonly jwt: JwtService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const started = performance.now();
    const trace = getRequestTrace();
    const queryStart = trace?.queries.length ?? 0;
    try {
      return await this.authenticate(request);
    } finally {
      const authMs = Math.max(0, Math.round(performance.now() - started));
      if (trace) {
        trace.authMs = authMs;
        trace.steps.push({ name: "auth", atMs: atMs(trace), durationMs: authMs });
        for (let i = queryStart; i < trace.queries.length; i += 1) {
          trace.queries[i].step = "auth";
        }
      }
    }
  }

  private async authenticate(request: {
    headers: { authorization?: string; cookie?: string };
    user?: {
      id: string;
      email: string;
      name: string;
      role: string;
      schoolId: string | null;
    };
  }) {
    const header = request.headers.authorization as string | undefined;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const cookie = readCookie(request.headers.cookie, "wellrun_token");
    const token = bearer ?? cookie;
    if (!token) throw new UnauthorizedException("Sign in required");
    try {
      const payload = await this.jwt.verifyAsync<{ id?: string }>(token);
      if (!payload.id) throw new UnauthorizedException("Session expired");
      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          schoolId: true,
          disabled: true,
          school: { select: { id: true } },
        },
      });
      if (!user || user.disabled) throw new UnauthorizedException("Session expired");
      if (user.schoolId && !user.school) throw new UnauthorizedException("Session expired");
      request.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        schoolId: user.schoolId,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Session expired");
    }
  }
}
