import { describe, expect, it } from "vitest";
import { OTP_MAX_ATTEMPTS, OTP_MAX_PER_HOUR, generateOtp, hashDeviceToken, hashOtp, newDeviceToken, otpMatches, otpRequestVerdict, otpVerifyVerdict } from "./otp";

const now = new Date("2026-10-10T10:00:00.000Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000);

describe("generateOtp", () => {
  it("is always six digits, keeping leading zeros", () => {
    for (let i = 0; i < 200; i += 1) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it("uses a fixed code only when it is six digits", () => {
    expect(generateOtp("123456")).toBe("123456");
    expect(generateOtp("12")).toMatch(/^\d{6}$/);
  });
});

describe("otpMatches", () => {
  const hash = hashOtp("secret", "923001234567", "482913");

  it("accepts the right code for the right phone", () => {
    expect(otpMatches("secret", "923001234567", "482913", hash)).toBe(true);
  });

  it("rejects a wrong code, another phone, or another secret", () => {
    expect(otpMatches("secret", "923001234567", "482914", hash)).toBe(false);
    expect(otpMatches("secret", "923009999999", "482913", hash)).toBe(false);
    expect(otpMatches("other", "923001234567", "482913", hash)).toBe(false);
    expect(otpMatches("secret", "923001234567", "482913", "short")).toBe(false);
  });
});

describe("otpRequestVerdict", () => {
  it("allows the first request", () => {
    expect(otpRequestVerdict([], now)).toEqual({ ok: true });
  });

  it("makes people wait a minute between codes, and says how long", () => {
    expect(otpRequestVerdict([ago(20)], now)).toEqual({ ok: false, reason: "cooldown", retryAfter: 40 });
    expect(otpRequestVerdict([ago(61)], now)).toEqual({ ok: true });
  });

  it("stops at five codes an hour and says when the hour frees up", () => {
    const five = [ago(3500), ago(2900), ago(2000), ago(900), ago(120)];
    expect(five).toHaveLength(OTP_MAX_PER_HOUR);
    expect(otpRequestVerdict(five, now)).toEqual({ ok: false, reason: "hourly", retryAfter: 100 });
    expect(otpRequestVerdict(five.slice(1), now)).toEqual({ ok: true });
  });
});

describe("otpVerifyVerdict", () => {
  const live = { expiresAt: new Date(now.getTime() + 60_000), attempts: 0, consumedAt: null };

  it("accepts a live, matching code once", () => {
    expect(otpVerifyVerdict(live, now, true)).toBe("ok");
    expect(otpVerifyVerdict({ ...live, consumedAt: now }, now, true)).toBe("none");
  });

  it("treats a missing challenge as none, an old one as expired", () => {
    expect(otpVerifyVerdict(null, now, true)).toBe("none");
    expect(otpVerifyVerdict({ ...live, expiresAt: ago(1) }, now, true)).toBe("expired");
  });

  it("locks the code after too many wrong guesses, even when the guess is right", () => {
    expect(otpVerifyVerdict({ ...live, attempts: OTP_MAX_ATTEMPTS }, now, true)).toBe("locked");
    expect(otpVerifyVerdict({ ...live, attempts: OTP_MAX_ATTEMPTS - 1 }, now, false)).toBe("wrong");
  });
});

describe("device tokens", () => {
  it("are unique, long, and stored only as a hash", () => {
    const a = newDeviceToken();
    const b = newDeviceToken();
    expect(a.token).toMatch(/^wp_[A-Za-z0-9_-]{40,}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashDeviceToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});
