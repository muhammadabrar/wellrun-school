import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Empty, ErrorBox, Loading, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { keys, useChild } from "@/lib/queries";

const DAYS = [1, 2, 3, 4, 5, 6] as const;

/** 24-hour "08:30" as a phone shows it: 8:30. */
const clock = (value: string) => {
  const [h, min] = value.split(":").map(Number);
  return Number.isFinite(h) ? `${h}:${String(min ?? 0).padStart(2, "0")}` : value;
};

export function TimetablePage() {
  const { id = "" } = useParams();
  const { m } = useLocale();
  const { child } = useChild(id);
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: keys.timetable(id), queryFn: () => api.timetable(id) });
  const todayWeekday = new Date(`${todayIso()}T00:00:00Z`).getUTCDay();
  const [day, setDay] = useState<number>(todayWeekday >= 1 && todayWeekday <= 6 ? todayWeekday : 1);

  const lessons = new Map((data?.lessons ?? []).filter((lesson) => lesson.weekday === day).map((lesson) => [lesson.periodId, lesson]));
  const hasAny = Boolean(data?.lessons.length);

  return (
    <Screen title={child ? `${child.firstName} · ${m.timetable.title}` : m.timetable.title} back={`/child/${id}`}>
      {isPending ? (
        <Loading />
      ) : isError || !data ? (
        <ErrorBox error={error} onRetry={() => void refetch()} />
      ) : !data.periods.length || !hasAny ? (
        <Empty title={m.timetable.none} />
      ) : (
        <>
          <div className="grid grid-cols-6 gap-1.5" role="tablist">
            {DAYS.map((weekday) => (
              <button
                key={weekday}
                type="button"
                role="tab"
                aria-selected={day === weekday}
                onClick={() => setDay(weekday)}
                className={`min-h-14 rounded-2xl text-base font-semibold ${day === weekday ? "bg-indigo text-white" : "bg-white text-ink ring-1 ring-line"}`}
              >
                {m.timetable.days[String(weekday) as "1"]}
              </button>
            ))}
          </div>
          {lessons.size ? (
            <ul className="space-y-3">
              {data.periods.map((period) => {
                const lesson = lessons.get(period.id);
                if (period.isBreak) {
                  return (
                    <li key={period.id} className="rounded-2xl bg-paper px-4 py-3 text-center text-lg text-muted ring-1 ring-line">
                      {period.label || m.timetable.break} · <span className="ltr-num">{clock(period.startTime)}</span>
                    </li>
                  );
                }
                if (!lesson) return null;
                return (
                  <li key={period.id}>
                    <Card className="flex items-center gap-4 !p-4">
                      <div className="w-20 shrink-0 text-center">
                        <p className="ltr-num text-xl font-semibold">{clock(period.startTime)}</p>
                        <p className="ltr-num text-sm text-muted">{clock(period.endTime)}</p>
                      </div>
                      <div className="min-w-0">
                        <p dir="auto" className="truncate text-xl font-semibold">
                          {lesson.subject}
                        </p>
                        {lesson.teacher ? (
                          <p dir="auto" className="truncate text-base text-muted">
                            {lesson.teacher}
                          </p>
                        ) : null}
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty title={m.timetable.freeDay} />
          )}
        </>
      )}
    </Screen>
  );
}
