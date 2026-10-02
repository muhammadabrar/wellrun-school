import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { STAFF_DAY_LABEL, addDays, type StaffDayStatus } from "@wellrun/shared";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Skeleton, Tabs } from "@wellrun/ui";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExportButtons } from "@/components/attendance/attendance-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { clock12, DayBadge, shortDate } from "@/components/staff/leave-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { downloadCsv, downloadXlsx } from "@/lib/export";
import { todayIso } from "@/lib/format";
import { staffAttendanceApi, staffAttendanceKeys } from "@/lib/staff-attendance-api";

const ALL = "all";
const CHIPS: StaffDayStatus[] = ["PRESENT", "LATE", "ABSENT", "ON_LEAVE", "NOT_YET"];

export function StaffAttendancePage() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const view = params.get("view") === "month" ? "month" : "day";
  const date = params.get("date") || today;
  const month = params.get("month") || today.slice(0, 7);
  const filter = params.get("status") ?? ALL;

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const dayQuery = useQuery({ queryKey: staffAttendanceKeys.day(date), queryFn: () => staffAttendanceApi.day(date), enabled: view === "day", placeholderData: keepPreviousData });
  const monthQuery = useQuery({ queryKey: staffAttendanceKeys.month(month), queryFn: () => staffAttendanceApi.month(month), enabled: view === "month", placeholderData: keepPreviousData });

  const dayRows = useMemo(() => (dayQuery.data?.rows ?? []).filter((r) => filter === ALL || r.status === filter), [dayQuery.data, filter]);

  async function exportDay(kind: "xlsx" | "csv") {
    const d = dayQuery.data;
    if (!d) return;
    const rows = [["Staff member", "Employee no.", "Department", "Status", "Checked in", "Minutes late"], ...d.rows.map((r) => [r.name, r.employeeNo, r.department, STAFF_DAY_LABEL[r.status], r.checkIn ?? "", r.lateMinutes || ""])];
    if (kind === "csv") downloadCsv(`Staff attendance ${d.date}`, rows);
    else await downloadXlsx(`Staff attendance ${d.date}`, [{ name: d.date, rows, widths: [28, 14, 20, 14, 12, 12] }]);
  }

  async function exportMonth(kind: "xlsx" | "csv") {
    const m = monthQuery.data;
    if (!m) return;
    const rows = [["Staff member", "Employee no.", "Department", "On time", "Late", "Absent", "On leave", "Attendance %"], ...m.rows.map((r) => [r.name, r.employeeNo, r.department, r.counts.PRESENT, r.counts.LATE, r.counts.ABSENT, r.counts.ON_LEAVE, r.pct ?? ""])];
    if (kind === "csv") downloadCsv(`Staff attendance ${m.month}`, rows);
    else await downloadXlsx(`Staff attendance ${m.month}`, [{ name: m.month, rows, widths: [28, 14, 20, 10, 8, 8, 10, 14] }]);
  }

  const active = view === "day" ? dayQuery : monthQuery;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff attendance"
        description="Recorded automatically the first time each person uses the system on a school day. You can see it here; it can't be edited."
        actions={<ExportButtons disabled={!active.data} onExcel={() => (view === "day" ? exportDay("xlsx") : exportMonth("xlsx"))} onCsv={() => (view === "day" ? exportDay("csv") : exportMonth("csv"))} />}
      />

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Tabs value={view} onChange={(id) => setParam("view", id === "month" ? "month" : null)} items={[{ id: "day", label: "One day" }, { id: "month", label: "Whole month" }]} />
        {view === "day" ? (
          <div className="flex items-end gap-1">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setParam("date", addDays(date, -1))}>
              <ChevronLeft className="size-4" aria-hidden />
            </Button>
            <div className="w-48">
              <Label htmlFor="sa-date">Day</Label>
              <DatePicker id="sa-date" value={date} onChange={(value) => setParam("date", value)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
            </div>
            <Button variant="outline" size="icon" aria-label="Next day" disabled={date >= today} onClick={() => setParam("date", addDays(date, 1))}>
              <ChevronRight className="size-4" aria-hidden />
            </Button>
            {date !== today ? (
              <Button variant="ghost" onClick={() => setParam("date", null)}>
                Today
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="w-48">
            <Label htmlFor="sa-month">Month</Label>
            <Input id="sa-month" type="month" value={month} max={today.slice(0, 7)} onChange={(event) => event.target.value && setParam("month", event.target.value)} />
          </div>
        )}
        {view === "day" ? (
          <div className="w-48">
            <Label htmlFor="sa-status">Show</Label>
            <FormSelect id="sa-status" value={filter} onValueChange={(value) => setParam("status", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "Everyone" }, ...CHIPS.map((s) => ({ value: s, label: STAFF_DAY_LABEL[s] }))]} />
          </div>
        ) : null}
        <FetchingIndicator show={active.isFetching && !active.isPending} />
      </div>

      {active.isPending ? (
        <LoadingState variant="page" />
      ) : active.isError || !active.data ? (
        <ErrorState title="Couldn't load staff attendance" description="Check your connection and try again." onRetry={() => void active.refetch()} />
      ) : view === "day" && dayQuery.data ? (
        <DayView data={dayQuery.data} rows={dayRows} />
      ) : monthQuery.data ? (
        <MonthView data={monthQuery.data} />
      ) : (
        <Skeleton className="h-40 rounded-3xl" />
      )}
    </div>
  );
}

function DayView({ data, rows }: { data: NonNullable<ReturnType<typeof useQuery<import("@wellrun/shared").StaffAttendanceDay>>["data"]>; rows: import("@wellrun/shared").StaffAttendanceRow[] }) {
  if (!data.rows.length) return <EmptyState title="No staff to show" description="Add staff under Staff first. Their attendance appears here once they start using the system." />;
  return (
    <div className="space-y-4">
      {!data.working ? (
        <p className="rounded-2xl bg-paper px-4 py-3 text-sm text-muted-foreground">{data.holiday ? `${shortDate(data.date)} is a holiday (${data.holiday}).` : `The school is closed on ${shortDate(data.date)}.`} Nobody is expected in.</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Staff are expected by <strong>{clock12(data.startTime)}</strong>; arriving more than {data.graceMinutes} minutes after that counts as late. Change this in{" "}
          <Link to="/attendance/settings" className="text-indigo underline">
            Attendance settings
          </Link>
          .
        </p>
      )}
      <ul className="flex flex-wrap gap-2" aria-label="Summary">
        {CHIPS.map((s) => (
          <li key={s} className="rounded-2xl bg-surface px-4 py-2">
            <span className="font-display text-xl tabular-nums">{data.counts[s]}</span> <span className="text-sm text-muted-foreground">{STAFF_DAY_LABEL[s].toLowerCase()}</span>
          </li>
        ))}
      </ul>
      {rows.length ? (
        <div className="overflow-x-auto rounded-3xl bg-surface">
          <table className="w-full min-w-max text-sm">
            <caption className="sr-only">Staff attendance for {data.date}</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted-foreground">
                <th scope="col" className="px-4 py-3 font-medium">Staff member</th>
                <th scope="col" className="px-4 py-3 font-medium">Department</th>
                <th scope="col" className="px-4 py-3 font-medium">Status</th>
                <th scope="col" className="px-4 py-3 font-medium">Checked in</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Late by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => (
                <tr key={row.staffId}>
                  <td className="px-4 py-2.5">
                    <Link to={`/staff/${row.staffId}`} className="font-medium hover:underline">
                      {row.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{[row.title, row.employeeNo].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className="px-4 py-2.5">{row.department || "—"}</td>
                  <td className="px-4 py-2.5">
                    <DayBadge status={row.status} />
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{row.checkIn ? clock12(row.checkIn) : "—"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{row.lateMinutes ? `${row.lateMinutes} min` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState title="Nobody matches that" description="Choose Everyone to see the whole list again." />
      )}
    </div>
  );
}

function MonthView({ data }: { data: import("@wellrun/shared").StaffMonth }) {
  if (!data.rows.length) return <EmptyState title="No staff to show" description="Add staff under Staff first." />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Only finished school days are counted. Approved leave is shown separately and never counts against anyone.</p>
      <div className="overflow-x-auto rounded-3xl bg-surface">
        <table className="w-full min-w-max text-sm">
          <caption className="sr-only">Staff attendance for {data.month}</caption>
          <thead>
            <tr className="border-b border-line text-muted-foreground">
              <th scope="col" className="px-4 py-3 text-left font-medium">Staff member</th>
              <th scope="col" className="px-4 py-3 text-left font-medium">Department</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">On time</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Late</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Absent</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">On leave</th>
              <th scope="col" className="px-4 py-3 text-right font-medium">Attendance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.rows.map((row) => (
              <tr key={row.staffId}>
                <td className="px-4 py-2.5">
                  <Link to={`/staff/${row.staffId}`} className="font-medium hover:underline">
                    {row.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{row.employeeNo}</span>
                </td>
                <td className="px-4 py-2.5">{row.department || "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.counts.PRESENT}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.counts.LATE}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums ${row.counts.ABSENT ? "font-semibold text-danger" : ""}`}>{row.counts.ABSENT}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{row.counts.ON_LEAVE}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-medium ${row.pct !== null && row.pct < 90 ? "text-danger" : ""}`}>{row.pct === null ? "—" : `${row.pct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
