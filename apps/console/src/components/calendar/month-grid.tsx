import { itemsByDay, type CalendarItem, type CalendarItemType } from "@wellrun/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export const ITEM_STYLE: Record<CalendarItemType, { chip: string; dot: string; label: string }> = {
  HOLIDAY: { chip: "bg-orange/15 text-orange", dot: "bg-orange", label: "Holiday" },
  EVENT: { chip: "bg-indigo/10 text-indigo", dot: "bg-indigo", label: "Event" },
  EXAM: { chip: "bg-success/10 text-success", dot: "bg-success", label: "Exam" },
};

export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0));
  return { from: `${month}-01`, to: `${month}-${String(last.getUTCDate()).padStart(2, "0")}`, first: new Date(Date.UTC(y, m - 1, 1)), last };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function monthTitle(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
}

/** A month at a glance. Each day shows up to two items; select a day to read them all. */
export function MonthGrid({
  month,
  items,
  today,
  selected,
  onSelect,
  onMonth,
}: {
  month: string;
  items: CalendarItem[];
  today: string;
  selected: string | null;
  onSelect: (day: string) => void;
  onMonth: (month: string) => void;
}) {
  const { from, to, first, last } = monthBounds(month);
  const byDay = useMemo(() => itemsByDay(items, from, to), [items, from, to]);
  const cells: (string | null)[] = [];
  for (let i = 0; i < (first.getUTCDay() + 6) % 7; i += 1) cells.push(null);
  for (let d = 1; d <= last.getUTCDate(); d += 1) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);

  return (
    <div className="rounded-3xl bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => onMonth(shiftMonth(month, -1))}>
          <ChevronLeft />
        </Button>
        <h2 className="font-display text-xl">{monthTitle(month)}</h2>
        <Button variant="outline" size="icon" aria-label="Next month" onClick={() => onMonth(shiftMonth(month, 1))}>
          <ChevronRight />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {WEEK.map((d) => (
          <div key={d} className="py-1 font-medium">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`gap-${i}`} className="min-h-20 rounded-xl bg-paper/50" />;
          const list = byDay.get(day) ?? [];
          const isToday = day === today;
          const isSelected = day === selected;
          return (
            <button
              key={day}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${Number(day.slice(8))} ${monthTitle(month)}${list.length ? `, ${list.length} ${list.length === 1 ? "item" : "items"}` : ""}`}
              onClick={() => onSelect(day)}
              className={`flex min-h-20 flex-col items-stretch gap-0.5 rounded-xl p-1.5 text-left transition ${isSelected ? "bg-indigo/10 ring-2 ring-indigo" : "bg-paper hover:bg-indigo/5"}`}
            >
              <span className={`inline-flex size-6 items-center justify-center self-start rounded-full text-xs tabular-nums ${isToday ? "bg-indigo font-semibold text-white" : "text-muted-foreground"}`}>{Number(day.slice(8))}</span>
              {list.slice(0, 2).map((item) => (
                <span key={item.id} className={`truncate rounded px-1 text-[11px] leading-5 ${ITEM_STYLE[item.type].chip}`} title={item.title}>
                  {item.title}
                </span>
              ))}
              {list.length > 2 ? <span className="px-1 text-[11px] text-muted-foreground">+{list.length - 2} more</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
        {(Object.keys(ITEM_STYLE) as CalendarItemType[]).map((type) => (
          <span key={type} className="inline-flex items-center gap-1.5">
            <span className={`size-2.5 rounded-full ${ITEM_STYLE[type].dot}`} aria-hidden /> {ITEM_STYLE[type].label}
          </span>
        ))}
      </p>
    </div>
  );
}
