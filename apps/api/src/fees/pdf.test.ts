import { describe, expect, it } from "vitest";
import { uploadPathOf } from "./pdf";

describe("uploadPathOf", () => {
  it("reads the same file whether the URL is relative or absolute", () => {
    expect(uploadPathOf("/uploads/s1-logo-1.png")).toBe("/uploads/s1-logo-1.png");
    expect(uploadPathOf("http://localhost:3000/uploads/s1-logo-1.png")).toBe("/uploads/s1-logo-1.png");
    expect(uploadPathOf("https://api.example.com/uploads/s1-logo-1.png?v=2")).toBe("/uploads/s1-logo-1.png");
  });

  it("ignores anything outside uploads, including path tricks", () => {
    expect(uploadPathOf(null)).toBeNull();
    expect(uploadPathOf("https://cdn.example.com/logo.png")).toBeNull();
    expect(uploadPathOf("/uploads/../.env")).toBeNull();
  });
});
