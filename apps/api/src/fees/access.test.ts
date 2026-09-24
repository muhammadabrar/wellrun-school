import { describe, expect, it } from "vitest";
import { assertFeeAccess } from "./access";

describe("fee access", () => {
  const admin = { id: "a", role: "SCHOOL_ADMIN" as const, schoolId: "s1", email: "a@x.com", name: "Admin" };
  const teacher = { id: "t", role: "TEACHER" as const, schoolId: "s1", email: "t@x.com", name: "Teacher" };

  it("lets school admins collect and lets teachers only view", () => {
    expect(assertFeeAccess(admin, "fees.collect")).toBe("s1");
    expect(assertFeeAccess(teacher, "fees.view")).toBe("s1");
    expect(() => assertFeeAccess(teacher, "fees.collect")).toThrow(/permission/);
  });
});
