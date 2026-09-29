import { useQuery } from "@tanstack/react-query";
import { WEEKDAY_LABELS } from "@wellrun/shared";
import { Badge, EmptyState, ErrorState, LoadingState } from "@wellrun/ui";
import { Download } from "lucide-react";
import { MARK_SOFT, PctBar, PctText, markCode, markLabel, monthName } from "@/components/attendance/attendance-ui";
import { Stat, TrendLine, formatDay } from "@/components/exams/exam-ui";
import { Button } from "@/components/ui/button";
import { attendanceApi, attendanceKeys, type StudentAttendanceSummary } from "@/lib/attendance-api";
import { downloadXlsx } from "@/lib/export";
import { cn } from "@/lib/utils";

const shortMonth = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });

function exportStudent(name: string, data: StudentAttendanceSummary) {
  const t = data.thresholdPct;
  const periods = [
    ...(data.year ? [{ label: `Academic year ${data.year.name}`, from: data.year.from, to: data.year.to, counts: data.year.counts, pct: data.year.pct }] : []),
    ...data.terms.map((term) => ({ label: term.name, from: term.from, to: term.to, counts: term.counts, pct: term.pct })),
    ...data.months.map((m) => ({ label: monthName(m.month), from: `${m.month}-01`, to: "", counts: m.counts, pct: m.pct })),
  ];
  return downloadXlsx(`Attendance ${name}`, [
    {
      name: "Summary",
      rows: [
        ["Student", name],
        ["Low-attendance threshold", `${t}%`],
        [],
        ["Period", "From", "To", "Present", "Absent", "Late", "Leave", "Excused", "%"],
        ...periods.map((p) => [p.label, p.from, p.to, p.counts.PRESENT, p.counts.ABSENT, p.counts.LATE, p.counts.LEAVE, p.counts.EXCUSED, p.pct ?? ""]),
      ],
      widths: [24, 12, 12, 9, 9, 9, 9, 9, 7],
    },
    { name: "Absences and late", rows: [["Date", "Status", "Class"], ...data.recent.map((r) => [r.date, markLabel(r.status), r.className])], widths: [12, 10, 16] },
  ]);
}

/** Year and term %, the monthly trend, this month's calendar and recent absences for one student. */
export function StudentAttendancePanel({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: attendanceKeys.student(studentId),
    queryFn: () => attendanceApi.student(studentId),
  });

  if (isPending) return <LoadingState variant="metrics" />;
  if (isError || !data) return <ErrorState title="Couldn't load attendance" description="Check your connection and try again." onRetry={() => void refetch()} />;

  const t = data.thresholdPct;
  const year = data.year;
  const currentTerm = data.terms.find((term) => term.current);
  const marked = year ? Object.values(year.counts).reduce((a, b) => a + b, 0) : 0;
  if (!year || !marked) {
    return <EmptyState title="No attendance marked" description="Attendance appears here once this student's class is marked for the selected academic year." />;
  }
  const below = year.pct != null && year.pct < t;
  const leadingBlanks = data.calendar.days.length ? (data.calendar.days[0]!.weekday + 6) % 7 : 0; // Monday-first grid

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="font-medium">Academic year {year.name}</h2>
          {below ? <Badge tone="danger">Below {t}%</Badge> : null}
        </div>
        <Button variant="outline" size="sm" icon={<Download />} onClick={() => void exportStudent(studentName, data)}>
          Excel
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Academic year" value={<PctText value={year.pct} threshold={t} />} hint={`${marked} of ${year.workingDays} school days marked`} />
        <Stat
          label={currentTerm ? currentTerm.name : "Current term"}
          value={currentTerm ? <PctText value={currentTerm.pct} threshold={t} /> : "—"}
          hint={currentTerm ? `${formatDay(currentTerm.from)} – ${formatDay(currentTerm.to)}` : "No term running today"}
        />
        <Stat label="Days absent" value={year.counts.ABSENT} tone={year.counts.ABSENT ? "warning" : undefined} hint={`${year.counts.PRESENT} present`} />
        <Stat label="Late / leave" value={`${year.counts.LATE} / ${year.counts.LEAVE + year.counts.EXCUSED}`} hint="This academic year" />
      </dl>

      {data.terms.length ? (
        <section aria-labelledby="terms-title">
          <h3 id="terms-title" className="mb-3 text-sm font-medium text-muted-foreground">
            By term
          </h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.terms.map((term) => (
              <li key={term.id} className={cn("rounded-3xl bg-surface p-4", term.current && "ring-2 ring-indigo/30")}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-medium">
                    {term.name}
                    {term.current ? <span className="ml-2 text-xs text-indigo">Now</span> : null}
                  </p>
                  <PctText value={term.pct} threshold={t} />
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  {formatDay(term.from)} – {formatDay(term.to)} · {term.counts.ABSENT} absent
                </p>
                <PctBar value={term.pct} threshold={t} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="rounded-3xl bg-surface p-5" aria-labelledby="trend-title">
          <h3 id="trend-title" className="mb-3 font-medium">
            Monthly trend
          </h3>
          <TrendLine points={data.months.map((m) => ({ label: shortMonth(m.month), value: m.pct }))} emptyText="The trend appears after two months of attendance." />
        </section>

        <section className="rounded-3xl bg-surface p-5" aria-labelledby="cal-title">
          <h3 id="cal-title" className="mb-3 font-medium">
            {monthName(data.calendar.month)}
          </h3>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px]">
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <div key={d} className="pb-1 text-muted-foreground">
                {WEEKDAY_LABELS[d]!.slice(0, 2)}
              </div>
            ))}
            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`b${i}`} />
            ))}
            {data.calendar.days.map((d) => {
              const label = `${formatDay(d.date)}: ${d.status ? markLabel(d.status) : d.holiday ?? (d.working ? "Not marked" : "Closed")}`;
              return (
                <div
                  key={d.date}
                  title={label}
                  aria-label={label}
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-lg",
                    d.status ? MARK_SOFT[d.status] : !d.working ? "bg-line/50 text-muted-foreground" : "bg-paper text-muted-foreground",
                  )}
                >
                  <span className="tabular-nums">{Number(d.date.slice(8))}</span>
                  {d.status && d.status !== "PRESENT" ? <span className="text-[9px] font-semibold">{markCode(d.status)}</span> : null}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section aria-labelledby="recent-title">
        <h3 id="recent-title" className="mb-3 text-sm font-medium text-muted-foreground">
          Recent absences, late and leave
        </h3>
        {data.recent.length ? (
          <ul className="divide-y divide-line overflow-hidden rounded-3xl bg-surface">
            {data.recent.map((row) => (
              <li key={row.date} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>{formatDay(row.date)}</span>
                <span className="text-muted-foreground">{row.className}</span>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", MARK_SOFT[row.status])}>{markLabel(row.status)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-3xl bg-surface px-5 py-4 text-sm text-muted-foreground">Present every marked day this year.</p>
        )}
      </section>
    </div>
  );
}
