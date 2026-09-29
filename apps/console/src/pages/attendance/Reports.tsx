import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { addDays, attendancePct, countStatuses, eachDay, type AttendanceStatus } from "@wellrun/shared";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExportButtons, PctBar, PctText, monthName } from "@/components/attendance/attendance-ui";
import { registerRows } from "@/components/attendance/register-rows";
import { Stat, formatDay } from "@/components/exams/exam-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Switch } from "@/components/ui/switch";
import { useCampus } from "@/hooks/use-campus";
import { attendanceApi, attendanceKeys, type AttendanceReport } from "@/lib/attendance-api";
import { examKeys, examsApi } from "@/lib/exams-api";
import { downloadCsv, downloadXlsx, type Cell, type Sheet } from "@/lib/export";
import { todayIso } from "@/lib/format";
import { readYearId } from "@/lib/school-context";
import { cn } from "@/lib/utils";

const ALL = "__all";

function monthStart(iso: string) {
  return `${iso.slice(0, 7)}-01`;
}

function monthEnd(iso: string) {
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

/** One register sheet per month for a single-class report. */
function monthSheets(report: AttendanceReport): Sheet[] {
  if (!report.register) return [];
  const byMonth = new Map<string, typeof report.register.days>();
  for (const d of report.register.days) {
    const key = d.date.slice(0, 7);
    byMonth.set(key, [...(byMonth.get(key) ?? []), d]);
  }
  const marks = report.register.marks;
  return [...byMonth.entries()].map(([month, days]) => {
    const inMonth = new Set(days.map((d) => d.date));
    const dailyPresent: Record<string, number> = {};
    const students = report.rows.map((row) => {
      const statuses: AttendanceStatus[] = [];
      for (const [date, status] of Object.entries(marks[row.id] ?? {})) {
        if (!inMonth.has(date)) continue;
        statuses.push(status);
        if (status === "PRESENT" || (status === "LATE" && report.settings.lateCountsPresent)) dailyPresent[date] = (dailyPresent[date] ?? 0) + 1;
      }
      const counts = countStatuses(statuses);
      return { ...row, counts, pct: attendancePct(counts, report.settings) };
    });
    return { name: monthName(month), rows: registerRows({ days, students, marks, dailyPresent }), widths: [6, 10, 24, ...days.map(() => 4)] };
  });
}

export function AttendanceReportsPage() {
  const { classes, years } = useCampus();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const classId = params.get("classId") ?? ALL;
  const preset = params.get("range") ?? "month";
  const belowOnly = params.get("below") === "1";

  const context = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context, staleTime: 5 * 60_000 });
  const year = years.find((y) => y.id === readYearId()) ?? years.find((y) => y.current) ?? years[0];
  const terms = context.data?.terms ?? [];

  const range = useMemo(() => {
    if (preset === "last-month") {
      const prev = addDays(monthStart(today), -1);
      return { from: monthStart(prev), to: monthEnd(prev) };
    }
    if (preset === "year" && year) return { from: year.startsOn.slice(0, 10), to: year.endsOn.slice(0, 10) };
    if (preset.startsWith("term:")) {
      const term = terms.find((t) => t.id === preset.slice(5));
      if (term) return { from: term.startsOn.slice(0, 10), to: term.endsOn.slice(0, 10) };
    }
    if (preset === "custom") return { from: params.get("from") || monthStart(today), to: params.get("to") || today };
    return { from: monthStart(today), to: monthEnd(today) };
  }, [preset, params, today, year, terms]);

  const update = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const query = { classId: classId === ALL ? undefined : classId, from: range.from, to: range.to };
  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: attendanceKeys.report(query),
    queryFn: () => attendanceApi.report(query),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const rows = useMemo(() => (data ? (belowOnly ? data.rows.filter((r) => r.below) : data.rows) : []), [data, belowOnly]);
  const picked = classes.find((c) => c.id === classId);
  const className = classId === ALL ? "All classes" : picked ? `${picked.name} ${picked.section}` : "Class";
  const title = `${className}, ${formatDay(range.from)} – ${formatDay(range.to)}`;
  const fileBase = `Attendance report ${className} ${range.from} to ${range.to}`;

  const presetOptions = [
    { value: "month", label: "This month" },
    { value: "last-month", label: "Last month" },
    ...terms.map((t) => ({ value: `term:${t.id}`, label: t.name })),
    ...(year ? [{ value: "year", label: `Academic year ${year.name}` }] : []),
    { value: "custom", label: "Custom dates" },
  ];

  function tableRows(): Cell[][] {
    const multi = classId === ALL;
    return [
      [...(multi ? ["Class"] : []), "Roll", "Adm. no", "Student", "Present", "Absent", "Late", "Leave", "Excused", "Attendance %", "Below threshold"],
      ...rows.map((r) => [
        ...(multi ? [r.className] : []),
        r.rollNo ?? "",
        r.admissionNo,
        r.name,
        r.counts.PRESENT,
        r.counts.ABSENT,
        r.counts.LATE,
        r.counts.LEAVE,
        r.counts.EXCUSED,
        r.pct ?? "",
        r.below ? "Yes" : "",
      ]),
    ];
  }

  function exportExcel() {
    if (!data) return;
    const info: Cell[][] = [
      ["Attendance report"],
      ["Classes", className],
      ["From", range.from],
      ["To", range.to],
      ["Working days so far", data.workingDays],
      ["Average attendance", data.totals.avgPct ?? ""],
      ["Low-attendance threshold", `${data.settings.lowThresholdPct}%`],
      ["Students below threshold", data.totals.below],
      [],
    ];
    const summary = [...info, ...tableRows()];
    const sheets: Sheet[] = [{ name: "Summary", rows: summary, widths: [14, 8, 12, 26, 9, 9, 9, 9, 9, 12, 14] }];
    // Days-in-range guard keeps the workbook sensible for a year-long single-class report.
    if (data.register && eachDay(range.from, range.to).length <= 400) sheets.push(...monthSheets(data));
    return downloadXlsx(fileBase, sheets);
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Attendance reports"
          description="Attendance by student for any class and period. Download as Excel or CSV, or print."
          actions={data ? <ExportButtons onExcel={exportExcel} onCsv={() => downloadCsv(fileBase, tableRows())} disabled={!rows.length} /> : null}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="min-w-48">
          <FormSelect
            value={classId}
            onValueChange={(value) => update({ classId: value && value !== ALL ? value : null })}
            options={[{ value: ALL, label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: `${c.name} ${c.section}` }))]}
          />
        </div>
        <div className="min-w-48">
          <FormSelect value={preset} onValueChange={(value) => update({ range: value ?? "month" })} options={presetOptions} />
        </div>
        {preset === "custom" ? (
          <>
            <DatePicker value={range.from} onChange={(value) => value && update({ from: value })} />
            <DatePicker value={range.to} onChange={(value) => value && update({ to: value })} />
          </>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={belowOnly} onCheckedChange={(checked) => update({ below: checked ? "1" : null })} />
          Below threshold only
        </label>
      </div>
      <FetchingIndicator show={isFetching && Boolean(data)} label="Updating report" />

      {isError ? (
        <ErrorState title="Could not load the report" description={error instanceof Error ? error.message : "Try again."} onRetry={() => void refetch()} />
      ) : isPending || !data ? (
        <LoadingState variant="table" />
      ) : (
        <>
          <div className="hidden print:block">
            <h1 className="font-display text-2xl">Attendance report</h1>
            <p className="text-sm">{title}</p>
          </div>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Average attendance" value={data.totals.avgPct == null ? "—" : `${data.totals.avgPct}%`} hint={`${data.totals.students} students`} />
            <Stat label="Working days so far" value={data.workingDays} hint={`${formatDay(range.from)} – ${formatDay(range.to)}`} />
            <Stat
              label={`Below ${data.settings.lowThresholdPct}%`}
              value={data.totals.below}
              tone={data.totals.below ? "warning" : "success"}
              hint={data.totals.below ? "Students need follow-up" : "Everyone is above threshold"}
            />
            <Stat label="Absences recorded" value={data.totals.counts.ABSENT} hint={`${data.totals.counts.LATE} late · ${data.totals.counts.LEAVE + data.totals.counts.EXCUSED} leave`} />
          </dl>

          {!rows.length ? (
            <EmptyState
              title={belowOnly ? "No one is below the threshold" : "No students to report"}
              description={belowOnly ? "Every student in this range is at or above the threshold." : "Pick another class or enrol students first."}
            />
          ) : (
            <div className={cn("overflow-x-auto rounded-3xl bg-surface print:overflow-visible", isFetching && "opacity-80")}>
              <table className="w-full min-w-[48rem] text-left text-sm whitespace-nowrap print:min-w-0 print:text-xs">
                <caption className="sr-only">Attendance report: {title}</caption>
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Student</th>
                    {classId === ALL ? <th scope="col" className="px-3 py-3 font-medium">Class</th> : null}
                    <th scope="col" className="px-3 py-3 text-right font-medium">Present</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Absent</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Late</th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">Leave</th>
                    <th scope="col" className="w-48 px-4 py-3 font-medium">Attendance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.classId}-${r.id}`} className={cn("border-t border-line", r.below && "bg-danger/5")}>
                      <td className="px-4 py-2.5">
                        <Link to={`/students/${r.id}?tab=attendance`} className="font-medium hover:text-indigo">
                          {r.name}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {r.rollNo ? `Roll ${r.rollNo} · ` : ""}
                          {r.admissionNo}
                        </div>
                      </td>
                      {classId === ALL ? <td className="px-3 py-2.5">{r.className}</td> : null}
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.counts.PRESENT}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.counts.ABSENT}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.counts.LATE}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{r.counts.LEAVE + r.counts.EXCUSED}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <div className="w-24 print:hidden">
                            <PctBar value={r.pct} threshold={data.settings.lowThresholdPct} />
                          </div>
                          <PctText value={r.pct} threshold={data.settings.lowThresholdPct} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
