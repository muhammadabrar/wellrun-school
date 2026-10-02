import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fmt } from "@wellrun/i18n";
import type { AttendanceStatus } from "@wellrun/shared";
import { ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Empty, ErrorBox, Loading, SOLID_TONES, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { addMonths, formatMonth, todayIso } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { keys, useChild } from "@/lib/queries";

const CELL: Record<AttendanceStatus | "OFF", string> = {
  PRESENT: SOLID_TONES.green,
  ABSENT: SOLID_TONES.red,
  LATE: SOLID_TONES.orange,
  LEAVE: SOLID_TONES.indigo,
  EXCUSED: SOLID_TONES.indigo,
  OFF: "bg-transparent text-muted/60",
};

export function AttendancePage() {
  const { id = "" } = useParams();
  const { m, locale } = useLocale();
  const { child } = useChild(id);
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: keys.attendance(id, month),
    queryFn: () => api.attendance(id, month),
    placeholderData: keepPreviousData,
  });

  // The week starts on Monday; the first of the month sits under its own weekday.
  const lead = data ? (new Date(`${data.days[0]!.date}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((day) => new Intl.DateTimeFormat(locale === "ur" ? "ur-PK-u-nu-latn" : "en-GB", { weekday: "narrow", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 4 + day))));

  return (
    <Screen title={child ? `${child.firstName} · ${m.attendance.title}` : m.attendance.title} back={`/child/${id}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setMonth(addMonths(month, -1))} aria-label={m.common.previous} className="grid size-14 place-items-center rounded-full bg-white shadow-sm ring-1 ring-line active:bg-paper">
          <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden />
        </button>
        <p className="text-xl font-semibold">{formatMonth(month, locale)}</p>
        <button type="button" onClick={() => setMonth(addMonths(month, 1))} disabled={month >= today.slice(0, 7)} aria-label={m.common.next} className="grid size-14 place-items-center rounded-full bg-white shadow-sm ring-1 ring-line active:bg-paper disabled:opacity-30">
          <ChevronLeft className="size-6 rotate-180 rtl:rotate-0" aria-hidden />
        </button>
      </div>

      {isPending ? (
        <Loading />
      ) : isError || !data ? (
        <ErrorBox error={error} onRetry={() => void refetch()} />
      ) : (
        <div className={isFetching ? "opacity-70" : ""}>
          <Card className="text-center">
            {data.pct === null ? <p className="text-lg text-muted">{m.attendance.noPercent}</p> : <p className="text-5xl font-semibold text-success">{fmt(m.attendance.percent, { pct: data.pct })}</p>}
            <div className="mt-4 grid grid-cols-4 gap-2 text-center">
              {([
                ["PRESENT", m.attendance.present, data.counts.PRESENT],
                ["ABSENT", m.attendance.absent, data.counts.ABSENT],
                ["LATE", m.attendance.late, data.counts.LATE],
                ["LEAVE", m.attendance.leave, data.counts.LEAVE + data.counts.EXCUSED],
              ] as const).map(([status, label, count]) => (
                <div key={status} className="rounded-2xl bg-paper px-1 py-2">
                  <p className="ltr-num text-2xl font-semibold">{count}</p>
                  <p className="text-sm text-muted">{label}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="mt-4">
            <div className="grid grid-cols-7 gap-1.5 text-center" role="grid">
              {weekdays.map((name, index) => (
                <span key={index} className="pb-1 text-sm font-semibold text-muted">
                  {name}
                </span>
              ))}
              {Array.from({ length: lead }).map((_, index) => (
                <span key={`gap-${index}`} />
              ))}
              {data.days.map((day) => {
                const status = day.status ?? "NONE";
                return (
                  <span
                    key={day.date}
                    role="gridcell"
                    aria-label={`${day.date}: ${status === "NONE" ? m.status.NONE : m.status[status]}`}
                    className={`ltr-num grid aspect-square place-items-center rounded-xl text-base font-semibold ${day.status ? CELL[day.status] : day.date > today ? "text-muted/50" : "bg-paper text-muted ring-1 ring-line"} ${day.date === today ? "outline outline-2 outline-offset-2 outline-indigo" : ""}`}
                  >
                    {Number(day.date.slice(8))}
                  </span>
                );
              })}
            </div>
            <p className="mt-4 text-base font-semibold text-muted">{m.attendance.legend}</p>
            <ul className="mt-2 grid grid-cols-2 gap-2 text-base">
              {([
                ["PRESENT", m.attendance.present],
                ["ABSENT", m.attendance.absent],
                ["LATE", m.attendance.late],
                ["LEAVE", m.attendance.leave],
              ] as const).map(([status, label]) => (
                <li key={status} className="flex items-center gap-2">
                  <span className={`size-5 rounded-md ${CELL[status]}`} aria-hidden />
                  {label}
                </li>
              ))}
            </ul>
          </Card>
          {!data.days.some((day) => day.status && day.status !== "OFF") && data.pct === null ? <div className="mt-4"><Empty title={m.attendance.noPercent} /></div> : null}
        </div>
      )}
    </Screen>
  );
}
