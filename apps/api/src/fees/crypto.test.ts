import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "../common/crypto";

describe("fbr credentials", () => {
  it("encrypts credentials so they are not stored in plain text", () => {
    const secret = "test-fbr-key";
    const enc = encryptSecret("fbr-secret", secret);
    expect(enc.startsWith("v1:")).toBe(true);
    expect(enc).not.toContain("fbr-secret");
    expect(decryptSecret(enc, secret)).toBe("fbr-secret");
  });
});
