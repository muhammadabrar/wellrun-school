import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClassSelect, formatDayShort } from "@/components/exams/exam-ui";
import { Button } from "@/components/ui/button";
import { todayIso } from "@/lib/format";
import { examKeys, examsApi, type CalendarPaper } from "@/lib/exams-api";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const last = new Date(Date.UTC(y, m, 0));
  return { first, last, from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function ExamCalendarPage() {
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? todayIso().slice(0, 7);
  const classId = params.get("classId") ?? "";
  const { first, last, from, to } = monthBounds(month);
  const query = { from, to, classId: classId || undefined };
  const context = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context });
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: examKeys.calendar(query), queryFn: () => examsApi.calendar(query), placeholderData: keepPreviousData });

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarPaper[]>();
    (data ?? []).forEach((p) => map.set(p.date, [...(map.get(p.date) ?? []), p]));
    return map;
  }, [data]);

  const cells: (string | null)[] = [];
  const lead = (first.getUTCDay() + 6) % 7;
  for (let i = 0; i < lead; i += 1) cells.push(null);
  for (let d = 1; d <= last.getUTCDate(); d += 1) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const today = todayIso();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Exam calendar" description="Every paper, quiz and assignment scheduled this academic year." />
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl bg-surface p-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous month" onClick={() => set("month", shiftMonth(month, -1))}>
            <ChevronLeft />
          </Button>
          <h2 className="min-w-44 text-center font-display text-xl" aria-live="polite">
            {first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
          </h2>
          <Button variant="outline" size="icon" aria-label="Next month" onClick={() => set("month", shiftMonth(month, 1))}>
            <ChevronRight />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => set("month", "")}>
            Today
          </Button>
        </div>
        <ClassSelect id="cal-class" value={classId} onChange={(v) => set("classId", v)} classes={context.data?.classes ?? []} allowAll="All classes" />
      </div>
      <FetchingIndicator show={isFetching && !isPending} label="Updating calendar" />
      {isPending ? (
        <LoadingState variant="page" />
      ) : isError ? (
        <ErrorState title="Couldn't load the calendar" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-3xl bg-surface md:block">
            <div className="grid grid-cols-7 border-b border-line text-xs text-muted-foreground">
              {WEEK.map((d) => (
                <div key={d} className="px-3 py-2 font-medium">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                const papers = day ? byDay.get(day) ?? [] : [];
                return (
                  <div key={i} className={`min-h-28 border-b border-r border-line p-1.5 ${day ? "" : "bg-paper/50"}`}>
                    {day ? (
                      <>
                        <span className={`inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums ${day === today ? "bg-indigo text-white" : "text-muted-foreground"}`}>{Number(day.slice(8))}</span>
                        <ul className="mt-1 flex flex-col gap-1">
                          {papers.slice(0, 4).map((p) => (
                            <li key={p.id}>
                              <Link
                                to={`/exams/${p.examId}?tab=schedule`}
                                title={`${p.examName} · ${p.subject} · ${p.className}${p.startTime ? ` · ${p.startTime}` : ""}`}
                                className={`block truncate rounded-md px-1.5 py-0.5 text-xs ${p.kind === "EXAM" ? "bg-indigo/10 text-indigo" : "bg-paper text-ink"}`}
                              >
                                {p.subject} · {p.className}
                              </Link>
                            </li>
                          ))}
                          {papers.length > 4 ? <li className="px-1.5 text-xs text-muted-foreground">+{papers.length - 4} more</li> : null}
                        </ul>
                      </>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
          <ul className="flex flex-col gap-3 md:hidden">
            {[...byDay].map(([day, papers]) => (
              <li key={day} className="rounded-3xl bg-surface p-4">
                <p className="font-medium">{formatDayShort(day)}</p>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {papers.map((p) => (
                    <li key={p.id}>
                      <Link to={`/exams/${p.examId}?tab=schedule`} className="hover:underline">
                        {p.subject} · {p.className}
                      </Link>
                      <span className="text-muted-foreground"> — {p.examName}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
            {!byDay.size ? <li className="rounded-3xl bg-surface p-6 text-center text-sm text-muted-foreground">Nothing scheduled this month.</li> : null}
          </ul>
        </>
      )}
    </div>
  );
}
