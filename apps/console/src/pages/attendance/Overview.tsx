import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { ClipboardCheck, FileBarChart, Grid3x3 } from "lucide-react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { PctBar, PctText } from "@/components/attendance/attendance-ui";
import { Stat, TrendLine, formatDay } from "@/components/exams/exam-ui";
import { DatePicker } from "@/components/form/date-picker";
import { Button } from "@/components/ui/button";
import { currentUser } from "@/lib/api";
import { attendanceApi, attendanceKeys } from "@/lib/attendance-api";
import { todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AttendanceOverviewPage() {
  const isTeacher = currentUser()?.role === "TEACHER";
  const [params, setParams] = useSearchParams();
  const date = params.get("date") || todayIso();
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: attendanceKeys.overview(date),
    queryFn: () => attendanceApi.overview(date),
    placeholderData: keepPreviousData,
    enabled: !isTeacher,
  });

  // Old links (/attendance?classId=&date=) and teachers go straight to marking.
  if (isTeacher || params.get("classId")) return <Navigate to={`/attendance/mark?${params}`} replace />;

  const unmarked = data?.classes.filter((c) => c.students > 0 && c.marked === 0) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        description="Who's in today, which classes still need marking, and students falling behind."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button icon={<ClipboardCheck />} render={<Link to="/attendance/mark" />}>
              Mark attendance
            </Button>
            <Button variant="outline" icon={<Grid3x3 />} render={<Link to="/attendance/register" />}>
              Month register
            </Button>
            <Button variant="outline" icon={<FileBarChart />} render={<Link to="/attendance/reports" />}>
              Reports
            </Button>
          </div>
        }
      />
      <div className="flex items-center gap-3">
        <DatePicker value={date} onChange={(value) => value && setParams(value === todayIso() ? {} : { date: value }, { replace: true })} />
        <FetchingIndicator show={isFetching && Boolean(data)} label="Updating" />
      </div>

      {isError ? (
        <ErrorState title="Could not load attendance" description="Try again in a moment." onRetry={() => void refetch()} />
      ) : isPending || !data ? (
        <LoadingState variant="metrics" />
      ) : (
        <>
          {!data.working ? (
            <p className="rounded-2xl bg-orange/10 px-4 py-3 text-sm text-orange">
              {data.holiday ? `${formatDay(date)} is a holiday: ${data.holiday}.` : `The school is closed on ${formatDay(date)}.`}
            </p>
          ) : null}
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Attendance" value={data.today.pct == null ? "—" : `${data.today.pct}%`} hint={`${data.today.marked} students marked`} />
            <Stat label="Present" value={data.today.present} hint={`${data.today.late} late`} />
            <Stat label="Absent" value={data.today.absent} tone={data.today.absent ? "warning" : undefined} hint={`${data.today.leave} on leave`} />
            <Stat
              label="Classes not marked"
              value={data.working ? unmarked.length : "—"}
              tone={data.working && unmarked.length ? "warning" : "success"}
              hint={data.working ? `of ${data.classes.length} classes` : "Not a school day"}
            />
          </dl>

          <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
            <section className="rounded-3xl bg-surface p-5" aria-labelledby="trend-title">
              <h2 id="trend-title" className="font-medium">
                Last 30 days
              </h2>
              <p className="mb-3 text-sm text-muted-foreground">Daily attendance % on school days.</p>
              <TrendLine
                points={data.trend.map((p) => ({ label: formatDay(p.date), value: p.pct }))}
                emptyText="The trend appears after two days of attendance."
                labelEvery={Math.max(1, Math.ceil(data.trend.length / 6))}
              />
            </section>
            <section className="rounded-3xl bg-surface p-5" aria-labelledby="low-title">
              <h2 id="low-title" className="font-medium">
                Below {data.thresholdPct}% this year
              </h2>
              {data.lowStudents.length ? (
                <ul className="mt-3 divide-y divide-line">
                  {data.lowStudents.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <Link to={`/students/${s.id}?tab=attendance`} className="min-w-0 hover:text-indigo">
                        <span className="block truncate font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">{s.className}</span>
                      </Link>
                      <PctText value={s.pct} threshold={data.thresholdPct} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No students below the threshold.</p>
              )}
            </section>
          </div>

          <section aria-labelledby="classes-title" className="space-y-3">
            <h2 id="classes-title" className="font-medium">
              Classes on {formatDay(date)}
            </h2>
            {!data.classes.length ? (
              <EmptyState title="No classes this year" description="Add classes in Classes & subjects." />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {data.classes.map((c) => {
                  const done = c.marked > 0;
                  return (
                    <li key={c.id} className="flex flex-col gap-3 rounded-3xl bg-surface p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">{c.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.marked}/{c.students} marked
                          </p>
                        </div>
                        <span className={cn("rounded-full px-2 py-0.5 text-xs", done ? "bg-success/15 text-success" : data.working ? "bg-orange/15 text-orange" : "bg-line text-muted-foreground")}>
                          {done ? "Marked" : data.working ? "Pending" : "Closed"}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <PctBar value={c.pct} threshold={data.thresholdPct} />
                        <PctText value={c.pct} threshold={data.thresholdPct} className="w-12 text-right text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" render={<Link to={`/attendance/mark?classId=${c.id}&date=${date}`} />}>
                          {done ? "Edit" : "Mark"}
                        </Button>
                        <Button size="sm" variant="ghost" render={<Link to={`/attendance/register?classId=${c.id}&month=${date.slice(0, 7)}`} />}>
                          Register
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
