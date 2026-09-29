import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WEEKDAY_LABELS, attendancePct, countStatuses } from "@wellrun/shared";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ExportButtons,
  MARK_ORDER,
  MARK_SOFT,
  MarkLegend,
  PctText,
  markCode,
  markLabel,
  monthKey,
  monthName,
  monthOptions,
} from "@/components/attendance/attendance-ui";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { useCampus } from "@/hooks/use-campus";
import { attendanceApi, attendanceKeys, type AttendanceStatus, type MonthRegister } from "@/lib/attendance-api";
import { registerRows } from "@/components/attendance/register-rows";
import { downloadCsv, downloadXlsx, type Cell } from "@/lib/export";
import { cn } from "@/lib/utils";

type Draft = Record<string, AttendanceStatus | null>; // `${studentId}|${date}` -> status (null clears)

const cycle = (current: AttendanceStatus | null | undefined): AttendanceStatus | null => {
  if (!current) return "PRESENT";
  const next = MARK_ORDER[MARK_ORDER.indexOf(current) + 1];
  return next ?? null;
};

export function RegisterPage() {
  const { classes } = useCampus();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const month = /^\d{4}-\d{2}$/.test(params.get("month") ?? "") ? params.get("month")! : monthKey(new Date());
  const classId = params.get("classId") || classes[0]?.id || "";
  const [draft, setDraft] = useState<Draft>({});
  const [toast, setToast] = useState<string | null>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setDraft({});
  };

  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: attendanceKeys.register(classId, month),
    queryFn: () => attendanceApi.register(classId, month),
    enabled: Boolean(classId),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const save = useMutation({
    mutationFn: () =>
      attendanceApi.saveRegister({
        classId,
        cells: Object.entries(draft).map(([key, status]) => {
          const [studentId, date] = key.split("|");
          return { studentId: studentId!, date: date!, status };
        }),
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: attendanceKeys.root });
      setDraft({});
      setToast(`${result.saved} change${result.saved === 1 ? "" : "s"} saved`);
      setTimeout(() => setToast(null), 2200);
    },
  });

  // Merge unsaved edits into the server data so totals update live.
  const view = useMemo(() => {
    if (!data) return null;
    const marks: MonthRegister["marks"] = {};
    for (const s of data.students) marks[s.id] = { ...(data.marks[s.id] ?? {}) };
    for (const [key, status] of Object.entries(draft)) {
      const [studentId, date] = key.split("|") as [string, string];
      if (!marks[studentId]) continue;
      if (status) marks[studentId][date] = status;
      else delete marks[studentId][date];
    }
    const dailyPresent: Record<string, number> = {};
    const students = data.students.map((s) => {
      const statuses = Object.values(marks[s.id] ?? {});
      for (const [date, status] of Object.entries(marks[s.id] ?? {})) {
        if (status === "PRESENT" || (status === "LATE" && data.settings.lateCountsPresent)) dailyPresent[date] = (dailyPresent[date] ?? 0) + 1;
      }
      const counts = countStatuses(statuses);
      return { ...s, counts, pct: attendancePct(counts, data.settings) };
    });
    return { ...data, marks, students, dailyPresent };
  }, [data, draft]);

  const editable = useMemo(() => new Set(data?.editableDates ?? []), [data]);
  const dirty = Object.keys(draft).length;
  const cls = classes.find((c) => c.id === classId);
  const title = `${data?.class.label ?? (cls ? `${cls.name} ${cls.section}` : "")} ${monthName(month)}`.trim();
  const fileBase = `Attendance ${title}`;

  function exportExcel() {
    if (!view) return;
    const rows = registerRows(view);
    const summary: Cell[][] = [
      ["Class", view.class.label],
      ["Month", monthName(month)],
      ["Working days", view.days.filter((d) => d.working).length],
      ["Low-attendance threshold", `${view.settings.lowThresholdPct}%`],
      [],
      ["Roll", "Adm. no", "Student", "Present", "Absent", "Late", "Leave", "Excused", "%", "Below threshold"],
      ...view.students.map((s) => [
        s.rollNo ?? "",
        s.admissionNo,
        s.name,
        s.counts.PRESENT,
        s.counts.ABSENT,
        s.counts.LATE,
        s.counts.LEAVE,
        s.counts.EXCUSED,
        s.pct ?? "",
        s.pct != null && s.pct < view.settings.lowThresholdPct ? "Yes" : "",
      ]),
    ];
    return downloadXlsx(fileBase, [
      { name: "Register", rows, widths: [6, 10, 24, ...view.days.map(() => 4), 4, 4, 4, 4, 4, 6] },
      { name: "Summary", rows: summary, widths: [8, 12, 24, 8, 8, 8, 8, 8, 6, 14] },
    ]);
  }

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Month register"
          description="Every student and every day of the month. Holidays and closed days are shaded."
          actions={view ? <ExportButtons onExcel={exportExcel} onCsv={() => downloadCsv(fileBase, registerRows(view))} /> : null}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="min-w-48">
          <FormSelect
            value={classId || undefined}
            onValueChange={(value) => value && setParam("classId", value)}
            options={classes.map((c) => ({ value: c.id, label: `${c.name} ${c.section}` }))}
            placeholder="Select class"
          />
        </div>
        <div className="min-w-56">
          <FormSelect value={month} onValueChange={(value) => value && setParam("month", value)} options={monthOptions(month)} />
        </div>
        {data?.canEditGrid ? (
          <>
            <Button type="button" loading={save.isPending} disabled={!dirty} onClick={() => save.mutate()}>
              {dirty ? `Save ${dirty} change${dirty === 1 ? "" : "s"}` : "Save changes"}
            </Button>
            {dirty ? (
              <Button type="button" variant="ghost" onClick={() => setDraft({})}>
                Discard
              </Button>
            ) : null}
          </>
        ) : classId ? (
          <Button variant="outline" render={<Link to={`/attendance/mark?classId=${classId}`} />}>
            Mark today
          </Button>
        ) : null}
      </div>
      {save.error ? <p className="text-sm text-danger" role="alert">{save.error.message}</p> : null}
      <FetchingIndicator show={isFetching && Boolean(data)} label="Updating register" />

      {!classId ? (
        <EmptyState title="No classes yet" description="Add a class in Classes & subjects to see its register." />
      ) : isError ? (
        <ErrorState title="Could not load the register" description={error instanceof Error ? error.message : "Try again."} onRetry={() => void refetch()} />
      ) : isPending || !view ? (
        <LoadingState variant="table" />
      ) : !view.students.length ? (
        <EmptyState title="No students in this class" description="Enrol students in this class to build its register." />
      ) : (
        <>
          <div className="hidden print:block">
            <h1 className="font-display text-2xl">Attendance register: {title}</h1>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <MarkLegend />
            {data?.canEditGrid ? <p className="text-xs text-muted-foreground">Click a cell to cycle P → A → L → Lv → E → blank.</p> : null}
          </div>
          <div className={cn("overflow-x-auto rounded-3xl bg-surface print:overflow-visible print:rounded-none", isFetching && "opacity-80")}>
            <table className="w-full border-separate border-spacing-0 text-xs print:text-[8px]">
              <caption className="sr-only">Attendance register for {title}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-20 min-w-44 bg-surface px-3 py-2 text-left font-medium">
                    Student
                  </th>
                  {view.days.map((d) => (
                    <th
                      key={d.date}
                      scope="col"
                      title={d.holiday ?? (!d.working ? "Closed" : undefined)}
                      className={cn("min-w-8 px-0.5 py-2 text-center font-medium", !d.working && "bg-line/50 text-muted-foreground")}
                    >
                      <div className="text-[10px] text-muted-foreground">{WEEKDAY_LABELS[d.weekday]!.slice(0, 2)}</div>
                      <div className="tabular-nums">{Number(d.date.slice(8))}</div>
                    </th>
                  ))}
                  {["P", "A", "L", "Lv"].map((h) => (
                    <th key={h} scope="col" className="min-w-8 border-l border-line px-1 py-2 text-center font-medium">
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="min-w-14 px-2 py-2 text-right font-medium">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.students.map((s) => (
                  <tr key={s.id} className="group">
                    <th scope="row" className="sticky left-0 z-10 border-t border-line bg-surface px-3 py-1.5 text-left font-normal group-hover:bg-paper">
                      <Link to={`/students/${s.id}?tab=attendance`} className="block max-w-52 truncate font-medium hover:text-indigo">
                        {s.name}
                      </Link>
                      <span className="text-[10px] text-muted-foreground">
                        {s.rollNo ? `Roll ${s.rollNo} · ` : ""}
                        {s.admissionNo}
                      </span>
                    </th>
                    {view.days.map((d) => {
                      const status = view.marks[s.id]?.[d.date];
                      const key = `${s.id}|${d.date}`;
                      const canEdit = editable.has(d.date);
                      const changed = key in draft;
                      const label = `${s.name}, ${d.date}: ${status ? markLabel(status) : d.holiday ?? (d.working ? "Not marked" : "Closed")}`;
                      return (
                        <td key={d.date} className={cn("border-t border-line p-0.5 text-center", !d.working && "bg-line/50")}>
                          {canEdit ? (
                            <button
                              type="button"
                              aria-label={label}
                              title={label}
                              onClick={() => setDraft((prev) => ({ ...prev, [key]: cycle(status) }))}
                              className={cn(
                                "h-7 w-7 rounded text-[10px] font-semibold transition-colors hover:ring-2 hover:ring-indigo/40",
                                status ? MARK_SOFT[status] : "text-muted-foreground",
                                changed && "ring-2 ring-indigo",
                              )}
                            >
                              {markCode(status) || "·"}
                            </button>
                          ) : (
                            <span title={label} className={cn("inline-flex h-7 w-7 items-center justify-center rounded text-[10px] font-semibold", status ? MARK_SOFT[status] : "text-muted-foreground")}>
                              {status ? markCode(status) : d.holiday ? "H" : ""}
                            </span>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-t border-l border-line px-1 text-center tabular-nums">{s.counts.PRESENT}</td>
                    <td className="border-t border-line px-1 text-center tabular-nums">{s.counts.ABSENT}</td>
                    <td className="border-t border-line px-1 text-center tabular-nums">{s.counts.LATE}</td>
                    <td className="border-t border-line px-1 text-center tabular-nums">{s.counts.LEAVE + s.counts.EXCUSED}</td>
                    <td className="border-t border-line px-2 text-right">
                      <PctText value={s.pct} threshold={view.settings.lowThresholdPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row" className="sticky left-0 z-10 border-t-2 border-line bg-surface px-3 py-2 text-left font-medium">
                    Present
                  </th>
                  {view.days.map((d) => (
                    <td key={d.date} className={cn("border-t-2 border-line text-center tabular-nums text-muted-foreground", !d.working && "bg-line/50")}>
                      {d.working && view.dailyPresent[d.date] ? view.dailyPresent[d.date] : ""}
                    </td>
                  ))}
                  <td colSpan={5} className="border-t-2 border-line" />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
      <Toast message={toast} />
    </div>
  );
}
