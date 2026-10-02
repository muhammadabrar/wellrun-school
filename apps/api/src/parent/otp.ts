import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 5 * 60_000;
export const OTP_COOLDOWN_SECONDS = 60;
export const OTP_MAX_PER_HOUR = 5;
export const OTP_MAX_ATTEMPTS = 5;

/** Six digits. `devCode` lets a developer fix the code locally so no SMS provider is needed to try the portal. */
export function generateOtp(devCode?: string) {
  if (devCode && /^\d{6}$/.test(devCode)) return devCode;
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** The code is bound to the phone, so a code sent to one number never works for another. */
export function hashOtp(secret: string, phoneNorm: string, code: string) {
  return createHmac("sha256", secret).update(`${phoneNorm}:${code}`).digest("hex");
}

export function otpMatches(secret: string, phoneNorm: string, code: string, expectedHash: string) {
  const actual = Buffer.from(hashOtp(secret, phoneNorm, code));
  const expected = Buffer.from(expectedHash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export type OtpRequestVerdict = { ok: true } | { ok: false; reason: "cooldown" | "hourly"; retryAfter: number };

/** `recent` is when each code was requested for this phone in the last hour. */
export function otpRequestVerdict(recent: Date[], now: Date): OtpRequestVerdict {
  if (!recent.length) return { ok: true };
  const times = recent.map((date) => date.getTime()).sort((a, b) => b - a);
  const sinceLast = (now.getTime() - times[0]!) / 1000;
  if (sinceLast < OTP_COOLDOWN_SECONDS) return { ok: false, reason: "cooldown", retryAfter: Math.ceil(OTP_COOLDOWN_SECONDS - sinceLast) };
  if (times.length >= OTP_MAX_PER_HOUR) {
    // The hour window frees up when the oldest of the counted requests is an hour old.
    const oldestCounted = times[OTP_MAX_PER_HOUR - 1]!;
    return { ok: false, reason: "hourly", retryAfter: Math.max(1, Math.ceil((oldestCounted + 3_600_000 - now.getTime()) / 1000)) };
  }
  return { ok: true };
}

export type OtpVerifyVerdict = "ok" | "none" | "expired" | "locked" | "wrong";

export function otpVerifyVerdict(challenge: { expiresAt: Date; attempts: number; consumedAt: Date | null } | null, now: Date, matches: boolean): OtpVerifyVerdict {
  if (!challenge || challenge.consumedAt) return "none";
  if (challenge.expiresAt.getTime() <= now.getTime()) return "expired";
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) return "locked";
  return matches ? "ok" : "wrong";
}

export const hashDeviceToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** An opaque device token. It is long and random, so a plain hash is enough to store. */
export function newDeviceToken() {
  const token = `wp_${randomBytes(32).toString("base64url")}`;
  return { token, hash: hashDeviceToken(token) };
}
