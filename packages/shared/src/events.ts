import { z } from "zod";
import { eachDay } from "./attendance";

/** The school calendar: events people write, plus holidays and exam days that already exist elsewhere. */

export const EVENT_KINDS = ["EVENT", "MEETING", "TRIP", "SPORTS", "CULTURAL", "OTHER"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  EVENT: "School event",
  MEETING: "Meeting",
  TRIP: "Trip",
  SPORTS: "Sports",
  CULTURAL: "Cultural",
  OTHER: "Other",
};

export const EVENT_AUDIENCES = ["ALL", "CLASSES", "STAFF"] as const;
export type EventAudience = (typeof EVENT_AUDIENCES)[number];

export const EVENT_AUDIENCE_LABEL: Record<EventAudience, string> = {
  ALL: "Everyone: parents and staff",
  CLASSES: "Chosen classes: their parents and teachers",
  STAFF: "Staff only",
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 09:30").or(z.literal(""));

export const eventSchema = z
  .object({
    title: z.string().trim().min(2, "Give the event a name").max(120, "Keep the name under 120 characters"),
    description: z.string().trim().max(1000, "Keep the details under 1000 characters").default(""),
    kind: z.enum(EVENT_KINDS).default("EVENT"),
    startsOn: isoDate,
    endsOn: isoDate.nullable().optional(),
    allDay: z.boolean().default(true),
    startTime: time.default(""),
    endTime: time.default(""),
    location: z.string().trim().max(120).default(""),
    audience: z.enum(EVENT_AUDIENCES).default("ALL"),
    classIds: z.array(z.string().min(1)).max(200).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.endsOn && v.endsOn < v.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The last day can't be before the first day" });
    if (v.endsOn && eachDay(v.startsOn, v.endsOn).length > 60) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "An event can run for at most 60 days" });
    if (!v.allDay) {
      if (!v.startTime) ctx.addIssue({ code: "custom", path: ["startTime"], message: "When does it start?" });
      if (v.startTime && v.endTime && (!v.endsOn || v.endsOn === v.startsOn) && v.endTime <= v.startTime) ctx.addIssue({ code: "custom", path: ["endTime"], message: "It can't end before it starts" });
    }
    if (v.audience === "CLASSES" && !v.classIds.length) ctx.addIssue({ code: "custom", path: ["classIds"], message: "Pick at least one class, or choose everyone" });
  });

export const eventUpdateSchema = eventSchema;

export type EventInput = z.input<typeof eventSchema>;

export type CalendarItemType = "EVENT" | "HOLIDAY" | "EXAM";

export type CalendarItem = {
  /** Unique within one response; for an event this is the event's id. */
  id: string;
  type: CalendarItemType;
  title: string;
  /** A short second line: the place, or the papers sat. */
  subtitle: string;
  date: string;
  /** Last day for something that runs over several days; the same as `date` for a single day. */
  endDate: string;
  startTime: string;
  endTime: string;
  kind: EventKind | null;
  audience: EventAudience | null;
  classLabels: string[];
  /** Set for events, so an admin can edit or remove them. */
  eventId: string | null;
};

export type CalendarView = { from: string; to: string; items: CalendarItem[]; truncated: boolean };

export type EventView = {
  id: string;
  title: string;
  description: string;
  kind: EventKind;
  startsOn: string;
  endsOn: string | null;
  allDay: boolean;
  startTime: string;
  endTime: string;
  location: string;
  audience: EventAudience;
  classIds: string[];
  classLabels: string[];
  createdBy: string | null;
};

// Pure rules -----------------------------------------------------------------------------------------------------

/** Which people an event is for. Staff-only events never reach parents; class events reach those classes' parents and teachers. */
export type Viewer = { role: "admin" | "teacher" | "parent"; classIds: ReadonlySet<string> };

export function eventVisibleTo(event: { audience: EventAudience; classIds: readonly string[] }, viewer: Viewer) {
  if (viewer.role === "admin") return true;
  if (event.audience === "ALL") return true;
  if (event.audience === "STAFF") return viewer.role === "teacher";
  return event.classIds.some((id) => viewer.classIds.has(id));
}

/** Every day an item covers, clipped to the window being shown. */
export function daysCovered(item: { date: string; endDate: string }, from: string, to: string) {
  const start = item.date < from ? from : item.date;
  const end = item.endDate > to ? to : item.endDate;
  return start > end ? [] : eachDay(start, end);
}

/** Items grouped by the days they fall on, for a month grid. A three-day trip appears on all three days. */
export function itemsByDay(items: CalendarItem[], from: string, to: string) {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) for (const day of daysCovered(item, from, to)) map.set(day, [...(map.get(day) ?? []), item]);
  const rank: Record<CalendarItemType, number> = { HOLIDAY: 0, EVENT: 1, EXAM: 2 };
  for (const list of map.values()) list.sort((a, b) => rank[a.type] - rank[b.type] || a.startTime.localeCompare(b.startTime) || a.title.localeCompare(b.title));
  return map;
}
