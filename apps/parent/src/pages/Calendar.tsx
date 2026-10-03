import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fmt } from "@wellrun/i18n";
import type { CalendarItem } from "@wellrun/shared";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Chip, Empty, ErrorBox, Loading, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { addMonths, formatDate, formatMonth, todayIso } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { keys, useChild } from "@/lib/queries";

const RANK = { HOLIDAY: 0, EVENT: 1, EXAM: 2 } as const;
const TONE = { HOLIDAY: "orange", EVENT: "indigo", EXAM: "green" } as const;

/** 08:30 as a phone shows it: 8:30. */
const clock = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return Number.isFinite(h) ? `${h}:${String(m ?? 0).padStart(2, "0")}` : v;
};

export function CalendarPage() {
  const { id = "" } = useParams();
  const { m, locale } = useLocale();
  const { child } = useChild(id);
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const first = `${month}-01`;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10);
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({ queryKey: keys.calendar(id, month), queryFn: () => api.calendar(id, first, last), placeholderData: keepPreviousData });

  // One entry per item, under the first day it shows in this month. A long event says when it ends instead of repeating.
  const days = new Map<string, CalendarItem[]>();
  for (const item of data ?? []) {
    const day = item.date < first ? first : item.date;
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  const ordered = [...days].sort(([a], [b]) => a.localeCompare(b));

  const label = (item: CalendarItem) => (item.type === "HOLIDAY" ? m.calendar.holiday : item.type === "EXAM" ? m.calendar.exam : m.calendar.event);
  const when = (item: CalendarItem) => (item.startTime ? (item.endTime ? fmt(m.calendar.timeRange, { from: clock(item.startTime), to: clock(item.endTime) }) : fmt(m.calendar.timeFrom, { from: clock(item.startTime) })) : item.type === "EXAM" ? "" : m.calendar.allDay);

  return (
    <Screen title={child ? `${child.firstName} · ${m.calendar.title}` : m.calendar.title} back={`/child/${id}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label={m.common.previous} className="grid size-14 place-items-center rounded-full bg-white shadow-sm ring-1 ring-line active:bg-paper">
          <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden />
        </button>
        <p className="text-xl font-semibold">{formatMonth(month, locale)}</p>
        <button type="button" onClick={() => setMonth(addMonths(month, 1))} aria-label={m.common.next} className="grid size-14 place-items-center rounded-full bg-white shadow-sm ring-1 ring-line active:bg-paper">
          <ChevronLeft className="size-6 rotate-180 rtl:rotate-0" aria-hidden />
        </button>
      </div>

      {isPending ? (
        <Loading />
      ) : isError || !data ? (
        <ErrorBox error={error} onRetry={() => void refetch()} />
      ) : !ordered.length ? (
        <Empty title={m.calendar.nothing} />
      ) : (
        <ul className={`space-y-4 ${isFetching ? "opacity-70" : ""}`}>
          {ordered.map(([day, items]) => (
            <li key={day}>
              <p className={`mb-2 text-lg font-semibold ${day === today ? "text-indigo" : ""}`}>
                {formatDate(day, locale)}
                {day === today ? ` · ${m.calendar.today}` : ""}
              </p>
              <ul className="space-y-2">
                {[...items]
                  .sort((a, b) => RANK[a.type] - RANK[b.type] || a.startTime.localeCompare(b.startTime))
                  .map((item) => (
                    <li key={item.id}>
                      <Card className="!p-4">
                        <Chip tone={TONE[item.type]}>{label(item)}</Chip>
                        <p dir="auto" className="mt-2 text-xl font-semibold">{item.title}</p>
                        {item.type === "HOLIDAY" ? <p className="text-base text-muted">{m.calendar.closed}</p> : null}
                        {when(item) ? <p className="ltr-num text-base text-muted">{when(item)}</p> : null}
                        {item.subtitle ? <p dir="auto" className="text-base text-muted">{item.subtitle}</p> : null}
                        {item.endDate > item.date ? <p className="text-base font-semibold">{fmt(m.calendar.until, { date: formatDate(item.endDate, locale) })}</p> : null}
                      </Card>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
