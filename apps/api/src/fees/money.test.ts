import { describe, expect, it } from "vitest";
import { addPkr, clampPkr, percentOfPkr, subPkr, toPkr } from "./money";

describe("money", () => {
  it("keeps integer PKR addition exact", () => {
    expect(addPkr(1000, 250, 3)).toBe(1253);
  });

  it("truncates fractional input instead of storing floats", () => {
    expect(toPkr(10.9)).toBe(10);
    expect(subPkr(100, 40.2)).toBe(60);
  });

  it("rounds percent half-up to the nearest rupee", () => {
    expect(percentOfPkr(1000, 10)).toBe(100);
    expect(percentOfPkr(1001, 10)).toBe(100);
    expect(percentOfPkr(1005, 10)).toBe(101);
    expect(percentOfPkr(1, 50)).toBe(1);
  });

  it("never returns a negative clamp", () => {
    expect(clampPkr(-20)).toBe(0);
  });
});
