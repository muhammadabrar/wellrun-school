import { describe, expect, it } from "vitest";
import { currentContract, payLines } from "./staff.service";

const d = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("currentContract", () => {
  const old = { id: "old", startDate: d("2024-01-01"), endDate: d("2025-12-31") };
  const now = { id: "now", startDate: d("2026-01-01"), endDate: null };
  const future = { id: "future", startDate: d("2027-01-01"), endDate: null };

  it("picks the contract in force on the date", () => {
    expect(currentContract([old, now, future], d("2026-09-29"))?.id).toBe("now");
    expect(currentContract([old, now, future], d("2025-06-01"))?.id).toBe("old");
  });

  it("falls back to the most recent contract when none is in force", () => {
    expect(currentContract([old], d("2026-09-29"))?.id).toBe("old");
    expect(currentContract([], d("2026-09-29"))).toBeNull();
  });
});

describe("payLines", () => {
  it("keeps labelled, whole, non-negative amounts only", () => {
    expect(payLines([{ label: "House rent", amountPkr: 5000.4 }, { label: "", amountPkr: 1 }, { label: "Advance", amountPkr: -20 }, "junk"])).toEqual([
      { label: "House rent", amountPkr: 5000 },
      { label: "Advance", amountPkr: 0 },
    ]);
    expect(payLines(null)).toEqual([]);
  });
});
