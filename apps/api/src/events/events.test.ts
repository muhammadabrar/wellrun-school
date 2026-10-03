import { eventSchema, eventVisibleTo, daysCovered, itemsByDay, type CalendarItem, type Viewer } from "@wellrun/shared";
import { describe, expect, it } from "vitest";

const item = (over: Partial<CalendarItem>): CalendarItem => ({ id: "i", type: "EVENT", title: "Event", subtitle: "", date: "2026-10-10", endDate: "2026-10-10", startTime: "", endTime: "", kind: "EVENT", audience: "ALL", classLabels: [], eventId: "e", ...over });

describe("eventSchema", () => {
  const base = { title: " Sports day ", startsOn: "2026-11-05" };

  it("trims and fills in the defaults", () => {
    expect(eventSchema.parse(base)).toMatchObject({ title: "Sports day", kind: "EVENT", allDay: true, audience: "ALL", classIds: [], location: "" });
  });

  it("refuses an end before the start, or an event of more than sixty days", () => {
    expect(eventSchema.safeParse({ ...base, endsOn: "2026-11-04" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, endsOn: "2026-11-05" }).success).toBe(true);
    expect(eventSchema.safeParse({ ...base, endsOn: "2027-02-01" }).success).toBe(false);
  });

  it("needs a start time when it isn't all day, and an end after the start on a single day", () => {
    expect(eventSchema.safeParse({ ...base, allDay: false }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, allDay: false, startTime: "09:00", endTime: "08:00" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, allDay: false, startTime: "09:00", endTime: "11:30" }).success).toBe(true);
    expect(eventSchema.safeParse({ ...base, allDay: false, startTime: "09:00", endsOn: "2026-11-06", endTime: "08:00" }).success).toBe(true);
  });

  it("needs classes when it is for chosen classes", () => {
    expect(eventSchema.safeParse({ ...base, audience: "CLASSES" }).success).toBe(false);
    expect(eventSchema.safeParse({ ...base, audience: "CLASSES", classIds: ["c1"] }).success).toBe(true);
  });

  it("rejects a badly written time", () => {
    expect(eventSchema.safeParse({ ...base, allDay: false, startTime: "9am" }).success).toBe(false);
  });
});

describe("eventVisibleTo", () => {
  const viewer = (role: Viewer["role"], ...classIds: string[]): Viewer => ({ role, classIds: new Set(classIds) });
  const all = { audience: "ALL" as const, classIds: [] };
  const staff = { audience: "STAFF" as const, classIds: [] };
  const grade5 = { audience: "CLASSES" as const, classIds: ["c5a", "c5b"] };

  it("shows an admin everything", () => {
    for (const e of [all, staff, grade5]) expect(eventVisibleTo(e, viewer("admin"))).toBe(true);
  });

  it("keeps staff-only events away from parents", () => {
    expect(eventVisibleTo(staff, viewer("parent", "c5a"))).toBe(false);
    expect(eventVisibleTo(staff, viewer("teacher"))).toBe(true);
  });

  it("shows a class event only to people connected to one of those classes", () => {
    expect(eventVisibleTo(grade5, viewer("parent", "c5b"))).toBe(true);
    expect(eventVisibleTo(grade5, viewer("parent", "c6a"))).toBe(false);
    expect(eventVisibleTo(grade5, viewer("teacher", "c6a", "c5a"))).toBe(true);
    expect(eventVisibleTo(grade5, viewer("teacher"))).toBe(false);
  });

  it("shows everyone's events to everyone", () => {
    expect(eventVisibleTo(all, viewer("parent"))).toBe(true);
    expect(eventVisibleTo(all, viewer("teacher"))).toBe(true);
  });
});

describe("daysCovered and itemsByDay", () => {
  const trip = item({ id: "trip", title: "Museum trip", date: "2026-10-08", endDate: "2026-10-10" });

  it("covers every day of a multi-day item", () => {
    expect(daysCovered(trip, "2026-10-01", "2026-10-31")).toEqual(["2026-10-08", "2026-10-09", "2026-10-10"]);
  });

  it("clips to the window, including an item that began before it and ends after it", () => {
    expect(daysCovered(trip, "2026-10-09", "2026-10-31")).toEqual(["2026-10-09", "2026-10-10"]);
    expect(daysCovered(trip, "2026-10-01", "2026-10-08")).toEqual(["2026-10-08"]);
    expect(daysCovered(item({ date: "2026-09-28", endDate: "2026-10-02" }), "2026-10-01", "2026-10-31")).toEqual(["2026-10-01", "2026-10-02"]);
  });

  it("covers nothing for an item outside the window", () => {
    expect(daysCovered(trip, "2026-11-01", "2026-11-30")).toEqual([]);
  });

  it("lists a multi-day item on each of its days, holidays first then events then exams", () => {
    const map = itemsByDay(
      [item({ id: "x", type: "EXAM", title: "Mid-term", date: "2026-10-09", endDate: "2026-10-09" }), trip, item({ id: "h", type: "HOLIDAY", title: "Iqbal Day", date: "2026-10-09", endDate: "2026-10-09", eventId: null })],
      "2026-10-01",
      "2026-10-31",
    );
    expect(map.get("2026-10-08")?.map((i) => i.id)).toEqual(["trip"]);
    expect(map.get("2026-10-09")?.map((i) => i.id)).toEqual(["h", "trip", "x"]);
    expect(map.get("2026-10-10")?.map((i) => i.id)).toEqual(["trip"]);
    expect(map.has("2026-10-11")).toBe(false);
  });

  it("orders events on one day by start time", () => {
    const map = itemsByDay([item({ id: "late", title: "B", startTime: "14:00" }), item({ id: "early", title: "A", startTime: "09:00" })], "2026-10-01", "2026-10-31");
    expect(map.get("2026-10-10")?.map((i) => i.id)).toEqual(["early", "late"]);
  });
});
