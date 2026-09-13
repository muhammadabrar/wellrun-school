import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { readCookie } from "../common/cookies";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(JwtService) private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization as string | undefined;
    const bearer = header?.startsWith("Bearer ") ? header.slice(7) : null;
    const cookie = readCookie(request.headers.cookie, "wellrun_token");
    const token = bearer ?? cookie;
    if (!token) throw new UnauthorizedException("Sign in required");
    try {
      request.user = await this.jwt.verifyAsync(token);
      return true;
    } catch {
      throw new UnauthorizedException("Session expired");
    }
  }
}
