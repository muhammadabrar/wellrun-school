import { describe, expect, it } from "vitest";
import { duesSummary, monthDays, monthOrCurrent } from "./rules";

describe("monthDays", () => {
  const week = [1, 2, 3, 4, 5, 6]; // Monday to Saturday; Sunday is off

  it("lists every day of the month, marking Sundays off and unmarked school days empty", () => {
    const days = monthDays("2026-10", [], [], week);
    expect(days).toHaveLength(31);
    expect(days[0]).toEqual({ date: "2026-10-01", status: null, holiday: null }); // Thursday
    expect(days[3]).toEqual({ date: "2026-10-04", status: "OFF", holiday: null }); // Sunday
  });

  it("shows marks, and a holiday as off unless attendance was taken that day", () => {
    const days = monthDays(
      "2026-10",
      [
        { date: "2026-10-01", status: "ABSENT" },
        { date: "2026-10-06", status: "PRESENT" },
      ],
      [{ name: "Eid", startsOn: "2026-10-06", endsOn: "2026-10-07" }],
      week,
    );
    expect(days[0]!.status).toBe("ABSENT");
    expect(days[5]).toEqual({ date: "2026-10-06", status: "PRESENT", holiday: "Eid" });
    expect(days[6]).toEqual({ date: "2026-10-07", status: "OFF", holiday: "Eid" });
  });

  it("handles February in a leap year", () => {
    expect(monthDays("2028-02", [], [], week)).toHaveLength(29);
  });
});

describe("duesSummary", () => {
  const invoices = [
    { balancePkr: 5000, dueOn: "2026-10-10", status: "OVERDUE" },
    { balancePkr: 3000, dueOn: "2026-11-10", status: "ISSUED" },
    { balancePkr: 1200, dueOn: "2026-10-20", status: "PARTIALLY_PAID" },
    { balancePkr: 0, dueOn: "2026-09-10", status: "PAID" },
    { balancePkr: 9999, dueOn: "2026-09-10", status: "CANCELLED" },
    { balancePkr: 4000, dueOn: "2026-12-10", status: "DRAFT" },
  ];

  it("adds up only what is genuinely owed", () => {
    expect(duesSummary(invoices, "2026-10-15")).toEqual({ dueTotalPkr: 9200, openCount: 3, overdueCount: 1, nextDueOn: "2026-10-10" });
  });

  it("is empty when nothing is owed", () => {
    expect(duesSummary([], "2026-10-15")).toEqual({ dueTotalPkr: 0, openCount: 0, overdueCount: 0, nextDueOn: null });
  });
});

describe("monthOrCurrent", () => {
  it("accepts a valid month and falls back otherwise", () => {
    expect(monthOrCurrent("2026-03", "2026-10-15")).toBe("2026-03");
    expect(monthOrCurrent("2026-13", "2026-10-15")).toBe("2026-10");
    expect(monthOrCurrent("garbage", "2026-10-15")).toBe("2026-10");
    expect(monthOrCurrent(undefined, "2026-10-15")).toBe("2026-10");
  });
});
