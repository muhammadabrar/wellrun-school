import {
  DEFAULT_ATTENDANCE_SETTINGS,
  attendancePct,
  countStatuses,
  isWorkingDay,
  monthBounds,
  withinEditWindow,
  workingDays,
} from "@wellrun/shared";
import { describe, expect, it } from "vitest";
import { buildDays } from "./register.service";
import { dayLockReason } from "./rules";

const settings = DEFAULT_ATTENDANCE_SETTINGS;
const eid = [{ name: "Eid", startsOn: "2026-03-20", endsOn: "2026-03-22" }];

describe("working days", () => {
  it("skips closed weekdays and holidays", () => {
    expect(isWorkingDay("2026-03-15", settings, [])).toBe(false); // Sunday
    expect(isWorkingDay("2026-03-16", settings, [])).toBe(true);
    expect(isWorkingDay("2026-03-21", settings, eid)).toBe(false);
    expect(workingDays("2026-03-16", "2026-03-22", settings, eid)).toEqual(["2026-03-16", "2026-03-17", "2026-03-18", "2026-03-19"]);
  });

  it("builds a month grid with holiday names", () => {
    const days = buildDays("2026-03-01", "2026-03-31", { ...settings, workingWeekdays: [1, 2, 3, 4, 5] }, eid);
    expect(days).toHaveLength(31);
    expect(days.find((d) => d.date === "2026-03-20")).toMatchObject({ working: false, holiday: "Eid" });
    expect(days.find((d) => d.date === "2026-03-14")).toMatchObject({ working: false, holiday: null }); // Saturday closed
  });

  it("knows month lengths", () => {
    expect(monthBounds("2028-02")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
});

describe("attendancePct", () => {
  const counts = countStatuses(["PRESENT", "PRESENT", "LATE", "ABSENT", "LEAVE"]);

  it("counts late as present and leaves leave out by default", () => {
    expect(attendancePct(counts, settings)).toBe(75);
  });

  it("follows the counting switches", () => {
    expect(attendancePct(counts, { lateCountsPresent: false, leaveCountsPresent: false })).toBe(50);
    expect(attendancePct(counts, { lateCountsPresent: true, leaveCountsPresent: true })).toBe(80);
  });

  it("is null with nothing marked", () => {
    expect(attendancePct(countStatuses(["LEAVE"]), settings)).toBeNull();
  });
});

describe("edit window and locks", () => {
  it("allows today plus N previous days, never the future", () => {
    expect(withinEditWindow("2026-09-29", "2026-09-29", 0)).toBe(true);
    expect(withinEditWindow("2026-09-28", "2026-09-29", 0)).toBe(false);
    expect(withinEditWindow("2026-09-27", "2026-09-29", 2)).toBe(true);
    expect(withinEditWindow("2026-09-30", "2026-09-29", 5)).toBe(false);
  });

  it("blocks holidays and closed days for everyone, the edit window for teachers only", () => {
    const today = "2026-03-25";
    expect(dayLockReason("2026-03-21", today, settings, eid, true)).toMatch(/Eid/);
    expect(dayLockReason("2026-03-22", today, settings, [], true)).toMatch(/closed/);
    expect(dayLockReason("2026-03-26", today, settings, [], true)).toMatch(/future/);
    expect(dayLockReason("2026-03-24", today, settings, [], true)).toBeNull();
    expect(dayLockReason("2026-03-24", today, settings, [], false)).toMatch(/today/);
    expect(dayLockReason("2026-03-24", today, { ...settings, teacherEditDays: 1 }, [], false)).toBeNull();
  });
});
