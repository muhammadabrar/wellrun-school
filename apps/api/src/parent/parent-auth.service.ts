import { HttpException, HttpStatus, Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { requestOtpSchema, verifyOtpSchema, type OtpRequested, type ParentDevice } from "@wellrun/shared";
import { normalizePhone } from "../common/phone";
import { PrismaService } from "../prisma/prisma.service";
import {
  OTP_COOLDOWN_SECONDS,
  OTP_TTL_MS,
  generateOtp,
  hashOtp,
  newDeviceToken,
  otpMatches,
  otpRequestVerdict,
  otpVerifyVerdict,
} from "./otp";
import { SMS_SENDER, type SmsSender } from "./sms";

const secret = () => process.env.OTP_SECRET ?? process.env.JWT_SECRET ?? "wellrun-school-dev";
const devCode = () => (process.env.NODE_ENV === "production" ? undefined : process.env.PARENT_DEV_OTP);

function tooMany(verdict: { reason: "cooldown" | "hourly"; retryAfter: number }) {
  const message =
    verdict.reason === "cooldown"
      ? `Please wait ${verdict.retryAfter} seconds before asking for another code.`
      : "Too many codes were requested for this number. Please try again later.";
  return new HttpException({ message, retryAfter: verdict.retryAfter }, HttpStatus.TOO_MANY_REQUESTS);
}

@Injectable()
export class ParentAuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(SMS_SENDER) private readonly sms: SmsSender,
  ) {}

  /**
   * Texts a code, but only when the number belongs to a guardian. The answer is the same either way so the
   * form can't be used to find out which numbers a school has on file, and nobody can make us text strangers.
   */
  async requestOtp(body: unknown): Promise<OtpRequested> {
    const { phone } = requestOtpSchema.parse(body);
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) throw new HttpException("Enter a valid mobile number", HttpStatus.BAD_REQUEST);
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 3_600_000);
    const recent = await this.prisma.otpChallenge.findMany({ where: { phoneNorm, createdAt: { gt: hourAgo } }, select: { createdAt: true } });
    const verdict = otpRequestVerdict(recent.map((row) => row.createdAt), now);
    if (!verdict.ok) throw tooMany(verdict);

    const known = (await this.prisma.guardian.count({ where: { phoneNorm } })) > 0;
    const code = generateOtp(devCode());
    const challenge = await this.prisma.otpChallenge.create({
      data: { phoneNorm, codeHash: hashOtp(secret(), phoneNorm, code), sent: known, expiresAt: new Date(now.getTime() + OTP_TTL_MS) },
      select: { id: true },
    });
    if (known) {
      try {
        await this.sms.send(phoneNorm, `${code} is your Wellrun sign-in code. It works for 5 minutes. Don't share it with anyone.`);
      } catch (error) {
        // The code never reached the phone, so it must not count against the person's limits.
        await this.prisma.otpChallenge.delete({ where: { id: challenge.id } }).catch(() => undefined);
        throw error;
      }
    }
    // Old codes are only noise: tidy this number's history as we go.
    void this.prisma.otpChallenge.deleteMany({ where: { phoneNorm, createdAt: { lt: new Date(now.getTime() - 86_400_000) } } }).catch(() => undefined);
    return { ok: true, resendAfter: OTP_COOLDOWN_SECONDS };
  }

  async verifyOtp(body: unknown) {
    const { phone, code, deviceLabel } = verifyOtpSchema.parse(body);
    const phoneNorm = normalizePhone(phone);
    if (!phoneNorm) throw new UnauthorizedException("That code didn't work. Check it and try again.");
    const now = new Date();
    const challenge = await this.prisma.otpChallenge.findFirst({
      where: { phoneNorm, sent: true, consumedAt: null },
      orderBy: { createdAt: "desc" },
    });
    const verdict = otpVerifyVerdict(challenge, now, challenge ? otpMatches(secret(), phoneNorm, code, challenge.codeHash) : false);
    if (verdict === "none" || verdict === "expired") throw new UnauthorizedException("That code has expired. Ask for a new one.");
    if (verdict === "locked") throw new UnauthorizedException("Too many wrong tries. Ask for a new code.");
    if (verdict === "wrong") {
      await this.prisma.otpChallenge.update({ where: { id: challenge!.id }, data: { attempts: { increment: 1 } }, select: { id: true } });
      throw new UnauthorizedException("That code didn't work. Check it and try again.");
    }
    // Consume first, so two requests with the same code can't both sign in.
    const consumed = await this.prisma.otpChallenge.updateMany({ where: { id: challenge!.id, consumedAt: null }, data: { consumedAt: now } });
    if (!consumed.count) throw new UnauthorizedException("That code has already been used. Ask for a new one.");

    const parent = await this.prisma.parentUser.upsert({
      where: { phoneNorm },
      create: { phoneNorm, lastSeenAt: now },
      update: { lastSeenAt: now },
      select: { id: true },
    });
    const { token, hash } = newDeviceToken();
    await this.prisma.parentDevice.create({ data: { parentId: parent.id, tokenHash: hash, label: deviceLabel ?? "" }, select: { id: true } });
    return { token, parentId: parent.id };
  }

  async logout(deviceId: string) {
    await this.prisma.parentDevice.updateMany({ where: { id: deviceId, revokedAt: null }, data: { revokedAt: new Date() } });
    return { ok: true };
  }

  async devices(parentId: string, currentDeviceId: string): Promise<ParentDevice[]> {
    const rows = await this.prisma.parentDevice.findMany({ where: { parentId, revokedAt: null }, orderBy: { lastSeenAt: "desc" }, take: 20 });
    return rows.map((row) => ({
      id: row.id,
      label: row.label || "Phone or browser",
      lastSeenAt: row.lastSeenAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      current: row.id === currentDeviceId,
    }));
  }

  async revokeDevice(parentId: string, deviceId: string) {
    const done = await this.prisma.parentDevice.updateMany({ where: { id: deviceId, parentId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!done.count) throw new NotFoundException("Device not found");
    return { ok: true };
  }
}
