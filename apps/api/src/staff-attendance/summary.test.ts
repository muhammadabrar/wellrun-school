import {
  LEAVE_MAX_DAYS,
  checkInResult,
  deriveStaffDay,
  emptyStaffCounts,
  karachiClockText,
  karachiMinutes,
  leaveCovers,
  leaveRequestProblem,
  leaveRequestSchema,
  leaveWorkingDays,
  minutesOfTime,
  rangesOverlap,
  staffAttendancePct,
} from "@wellrun/shared";
import { describe, expect, it } from "vitest";
import { summariseStaff, tallyDay, type StaffLeaveSpan } from "./summary";

const weekdays = { workingWeekdays: [1, 2, 3, 4, 5, 6] };

describe("check-in time", () => {
  it("reads the clock in Pakistan time", () => {
    // 03:05 UTC is 08:05 in Pakistan.
    expect(karachiMinutes(new Date("2026-10-12T03:05:00Z"))).toBe(8 * 60 + 5);
    expect(karachiClockText(new Date("2026-10-12T03:05:00Z"))).toBe("08:05");
    // 19:30 UTC is 00:30 the next morning there.
    expect(karachiClockText(new Date("2026-10-11T19:30:00Z"))).toBe("00:30");
  });

  it("treats arrival up to start plus grace as on time", () => {
    const start = "08:00";
    expect(checkInResult(minutesOfTime("07:30"), start, 15)).toEqual({ status: "PRESENT", lateMinutes: 0 });
    expect(checkInResult(minutesOfTime("08:15"), start, 15)).toEqual({ status: "PRESENT", lateMinutes: 0 });
  });

  it("counts lateness from the start time, not from the end of the grace period", () => {
    expect(checkInResult(minutesOfTime("08:16"), "08:00", 15)).toEqual({ status: "LATE", lateMinutes: 16 });
    expect(checkInResult(minutesOfTime("09:30"), "08:00", 15)).toEqual({ status: "LATE", lateMinutes: 90 });
  });

  it("with no grace period, one minute past start is late", () => {
    expect(checkInResult(minutesOfTime("08:01"), "08:00", 0).status).toBe("LATE");
    expect(checkInResult(minutesOfTime("08:00"), "08:00", 0).status).toBe("PRESENT");
  });
});

describe("leave", () => {
  const leaves: StaffLeaveSpan[] = [
    { fromOn: "2026-10-12", toOn: "2026-10-14", status: "APPROVED" },
    { fromOn: "2026-10-20", toOn: "2026-10-21", status: "PENDING" },
    { fromOn: "2026-10-25", toOn: "2026-10-26", status: "REJECTED" },
  ];

  it("covers only days of approved leave", () => {
    expect(leaveCovers(leaves, "2026-10-12")).toBe(true);
    expect(leaveCovers(leaves, "2026-10-14")).toBe(true);
    expect(leaveCovers(leaves, "2026-10-15")).toBe(false);
    expect(leaveCovers(leaves, "2026-10-20")).toBe(false); // still waiting
    expect(leaveCovers(leaves, "2026-10-25")).toBe(false); // refused
  });

  it("spots overlapping ranges, including touching ends", () => {
    expect(rangesOverlap("2026-10-12", "2026-10-14", "2026-10-14", "2026-10-16")).toBe(true);
    expect(rangesOverlap("2026-10-12", "2026-10-14", "2026-10-15", "2026-10-16")).toBe(false);
    expect(rangesOverlap("2026-10-10", "2026-10-20", "2026-10-12", "2026-10-13")).toBe(true);
  });

  it("charges only school days to a leave", () => {
    // Thu 8 Oct to Wed 14 Oct spans a Sunday; the 12th is a holiday.
    expect(leaveWorkingDays("2026-10-08", "2026-10-14", weekdays, [])).toBe(6);
    expect(leaveWorkingDays("2026-10-08", "2026-10-14", weekdays, [{ name: "Eid", startsOn: "2026-10-12", endsOn: "2026-10-12" }])).toBe(5);
    expect(leaveWorkingDays("2026-10-11", "2026-10-11", weekdays, [])).toBe(0); // a Sunday
  });

  it("rejects a request that starts too long ago, runs too long, or uses no school days", () => {
    const today = "2026-10-15";
    expect(leaveRequestProblem({ fromOn: "2026-10-08", toOn: "2026-10-09" }, today, 2)).toBeNull();
    expect(leaveRequestProblem({ fromOn: "2026-10-07", toOn: "2026-10-09" }, today, 2)).toMatch(/7 days ago/);
    expect(leaveRequestProblem({ fromOn: "2026-10-15", toOn: "2027-01-15" }, today, 70)).toMatch(new RegExp(String(LEAVE_MAX_DAYS)));
    expect(leaveRequestProblem({ fromOn: "2026-10-18", toOn: "2026-10-18" }, today, 0)).toMatch(/holidays/);
  });

  it("validates a request form", () => {
    const ok = { type: "SICK", fromOn: "2026-10-15", toOn: "2026-10-16", reason: "Fever" };
    expect(leaveRequestSchema.safeParse(ok).success).toBe(true);
    expect(leaveRequestSchema.safeParse({ ...ok, toOn: "2026-10-14" }).success).toBe(false);
    expect(leaveRequestSchema.safeParse({ ...ok, reason: "  " }).success).toBe(false);
    expect(leaveRequestSchema.safeParse({ ...ok, type: "HOLIDAY" }).success).toBe(false);
  });
});

describe("deriveStaffDay", () => {
  const base = { today: "2026-10-15", working: true, record: null, leaves: [] as StaffLeaveSpan[] };

  it("trusts a saved record over anything we could work out", () => {
    expect(deriveStaffDay({ ...base, day: "2026-10-13", record: { status: "LATE" } })).toBe("LATE");
    expect(deriveStaffDay({ ...base, day: "2026-10-18", working: false, record: { status: "PRESENT" } })).toBe("PRESENT");
  });

  it("calls a day off a day off", () => {
    expect(deriveStaffDay({ ...base, day: "2026-10-11", working: false })).toBe("OFF");
  });

  it("calls a past school day with nothing saved absent, unless leave covers it", () => {
    expect(deriveStaffDay({ ...base, day: "2026-10-13" })).toBe("ABSENT");
    expect(deriveStaffDay({ ...base, day: "2026-10-13", leaves: [{ fromOn: "2026-10-12", toOn: "2026-10-14", status: "APPROVED" }] })).toBe("ON_LEAVE");
    expect(deriveStaffDay({ ...base, day: "2026-10-13", leaves: [{ fromOn: "2026-10-12", toOn: "2026-10-14", status: "PENDING" }] })).toBe("ABSENT");
  });

  it("waits for today and the future", () => {
    expect(deriveStaffDay({ ...base, day: "2026-10-15" })).toBe("NOT_YET");
    expect(deriveStaffDay({ ...base, day: "2026-10-20" })).toBe("NOT_YET");
  });
});

describe("staffAttendancePct", () => {
  it("leaves approved leave out so it never counts against anyone", () => {
    expect(staffAttendancePct({ PRESENT: 16, LATE: 2, ABSENT: 2, ON_LEAVE: 5 })).toBe(90);
  });

  it("has nothing to say before any day is counted", () => {
    expect(staffAttendancePct(emptyStaffCounts())).toBeNull();
    expect(staffAttendancePct({ PRESENT: 0, LATE: 0, ABSENT: 0, ON_LEAVE: 4 })).toBeNull();
  });

  it("counts a late arrival as turning up", () => {
    expect(staffAttendancePct({ PRESENT: 0, LATE: 4, ABSENT: 0, ON_LEAVE: 0 })).toBe(100);
  });
});

describe("summariseStaff", () => {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"];
  const run = (over: Partial<Parameters<typeof summariseStaff>[0]> = {}) =>
    summariseStaff({ days, today: "2026-10-15", joinedOn: "2020-01-01", working: () => true, records: new Map(), leaves: [], ...over });

  it("counts saved days, absent days with no record, and leaves today and later uncounted", () => {
    const result = run({ records: new Map([["2026-10-12", { status: "PRESENT" as const }], ["2026-10-13", { status: "LATE" as const }]]) });
    expect(result.counts).toEqual({ PRESENT: 1, LATE: 1, ABSENT: 1, ON_LEAVE: 0 }); // the 14th has no record
    expect(result.workingDays).toBe(3);
    expect(result.statuses.get("2026-10-15")).toBe("NOT_YET");
    expect(result.pct).toBe(66.7);
  });

  it("turns approved leave into leave days that do not hurt the percentage", () => {
    const result = run({ leaves: [{ fromOn: "2026-10-13", toOn: "2026-10-14", status: "APPROVED" }], records: new Map([["2026-10-12", { status: "PRESENT" as const }]]) });
    expect(result.counts).toEqual({ PRESENT: 1, LATE: 0, ABSENT: 0, ON_LEAVE: 2 });
    expect(result.pct).toBe(100);
  });

  it("skips days before the person joined and days the school was closed", () => {
    const result = run({ joinedOn: "2026-10-14", working: (day) => day !== "2026-10-14" });
    expect(result.counts).toEqual({ PRESENT: 0, LATE: 0, ABSENT: 0, ON_LEAVE: 0 });
    expect(result.statuses.has("2026-10-12")).toBe(false);
    expect(result.statuses.get("2026-10-14")).toBe("OFF");
  });
});

describe("tallyDay", () => {
  it("counts people in each state", () => {
    expect(tallyDay(["PRESENT", "PRESENT", "LATE", "NOT_YET", "ON_LEAVE", "OFF"])).toEqual({ PRESENT: 2, LATE: 1, ABSENT: 0, ON_LEAVE: 1, NOT_YET: 1, OFF: 1 });
  });
});
