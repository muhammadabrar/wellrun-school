import { describe, expect, it } from "vitest";
import { normalizeCnic, normalizePhone, waDigits } from "./phone";

describe("normalizePhone", () => {
  it("treats every way of writing one mobile number as the same number", () => {
    const forms = ["0300 1234567", "+92 300 1234567", "92-300-1234567", "(0300) 123-4567", "3001234567"];
    for (const form of forms) expect(normalizePhone(form)).toBe("923001234567");
  });

  it("rejects text that cannot be a phone number", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("n/a")).toBeNull();
  });

  it("agrees with the WhatsApp link formatter", () => {
    expect(normalizePhone("03001234567")).toBe(waDigits("03001234567"));
  });
});

describe("normalizeCnic", () => {
  it("formats 13 digits the same way however they were typed", () => {
    expect(normalizeCnic("3520212345671")).toBe("35202-1234567-1");
    expect(normalizeCnic("35202-1234567-1")).toBe("35202-1234567-1");
    expect(normalizeCnic(" 35202 1234567 1 ")).toBe("35202-1234567-1");
  });

  it("returns null when nothing was entered, so blank CNICs never collide", () => {
    expect(normalizeCnic("")).toBeNull();
    expect(normalizeCnic("   ")).toBeNull();
    expect(normalizeCnic(undefined)).toBeNull();
  });

  it("keeps odd values as typed rather than guessing", () => {
    expect(normalizeCnic("12345-678")).toBe("12345-678");
  });
});
