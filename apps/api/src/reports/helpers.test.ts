import { describe, expect, it } from "vitest";
import { byLabel, dateRange, daySpan, endOf, firstOfMonth, karachiDay, karachiMonth, monthsBetween, percentOf, shiftMonth, startOf } from "./helpers";

describe("karachiDay", () => {
  it("puts a late-evening payment on the day the school saw it", () => {
    // 20:30 UTC on the 31st is 01:30 on the 1st in Pakistan.
    expect(karachiDay(new Date("2026-10-31T20:30:00Z"))).toBe("2026-11-01");
    expect(karachiMonth(new Date("2026-10-31T20:30:00Z"))).toBe("2026-11");
    expect(karachiDay(new Date("2026-10-31T18:00:00Z"))).toBe("2026-10-31");
  });
});

describe("dateRange", () => {
  const today = "2026-10-15";

  it("defaults to the month so far", () => {
    expect(dateRange({}, today)).toEqual({ from: "2026-10-01", to: "2026-10-15" });
  });

  it("accepts a chosen range and a different default start", () => {
    expect(dateRange({ from: "2026-09-01", to: "2026-09-30" }, today)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(dateRange({}, today, "2026-05-01")).toEqual({ from: "2026-05-01", to: "2026-10-15" });
  });

  it("refuses a backwards, malformed or enormous range", () => {
    expect(() => dateRange({ from: "2026-10-10", to: "2026-10-01" }, today)).toThrow(/after/);
    expect(() => dateRange({ from: "10/10/2026" }, today)).toThrow(/valid/);
    expect(() => dateRange({ from: "2020-01-01", to: "2026-01-01" }, today)).toThrow(/two years/);
  });
});

describe("range instants", () => {
  it("cover whole Pakistan days", () => {
    expect(startOf("2026-10-01").toISOString()).toBe("2026-09-30T19:00:00.000Z");
    expect(endOf("2026-10-01").toISOString()).toBe("2026-10-01T18:59:59.999Z");
  });
});

describe("months", () => {
  it("moves across year ends in both directions", () => {
    expect(shiftMonth("2026-11", 2)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-05", 0)).toBe("2026-05");
  });

  it("lists every month in a range, including the first and last", () => {
    expect(monthsBetween("2026-11-20", "2027-02-03")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
    expect(monthsBetween("2026-10-01", "2026-10-31")).toEqual(["2026-10"]);
  });

  it("finds the first of a month", () => {
    expect(firstOfMonth("2026-10-15")).toBe("2026-10-01");
  });
});

describe("small helpers", () => {
  it("gives a percentage to one decimal, or nothing when there is nothing to divide by", () => {
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(5, 0)).toBeNull();
  });

  it("sorts classes the way people read them", () => {
    expect(["Grade 10 A", "Grade 2 A", "Grade 2 B"].sort(byLabel)).toEqual(["Grade 2 A", "Grade 2 B", "Grade 10 A"]);
  });

  it("counts the days a range spans, inclusive", () => {
    expect(daySpan("2026-10-01", "2026-10-01")).toBe(1);
    expect(daySpan("2026-10-01", "2026-10-31")).toBe(31);
  });
});
