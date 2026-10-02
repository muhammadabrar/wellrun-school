import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { hashDeviceToken } from "./otp";

export type CurrentParent = { id: string; phoneNorm: string; name: string; locale: string; deviceId: string };

const TOUCH_AFTER_MS = 60 * 60_000;

/** Signs a parent in by their device token. Revoking the device takes effect on the very next request. */
@Injectable()
export class ParentGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; parent?: CurrentParent }>();
    const header = request.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    if (!token.startsWith("wp_")) throw new UnauthorizedException("Please sign in");
    const device = await this.prisma.parentDevice.findUnique({
      where: { tokenHash: hashDeviceToken(token) },
      select: { id: true, revokedAt: true, lastSeenAt: true, parent: { select: { id: true, phoneNorm: true, name: true, locale: true } } },
    });
    if (!device || device.revokedAt) throw new UnauthorizedException("Please sign in again");
    if (Date.now() - device.lastSeenAt.getTime() > TOUCH_AFTER_MS) {
      const now = new Date();
      void this.prisma.parentDevice.update({ where: { id: device.id }, data: { lastSeenAt: now }, select: { id: true } }).catch(() => undefined);
      void this.prisma.parentUser.update({ where: { id: device.parent.id }, data: { lastSeenAt: now }, select: { id: true } }).catch(() => undefined);
    }
    request.parent = { ...device.parent, deviceId: device.id };
    return true;
  }
}
