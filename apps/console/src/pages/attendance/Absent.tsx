import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { Link, useSearchParams } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { Button } from "@/components/ui/button";
import { attendanceApi, attendanceKeys } from "@/lib/attendance-api";
import { todayIso } from "@/lib/format";

/** Everyone marked absent or on leave for one day, grouped by class. */
export function AbsentPage() {
  const [params, setParams] = useSearchParams();
  const date = params.get("date") || todayIso();
  const { data: rows, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: attendanceKeys.absent(date),
    queryFn: () => attendanceApi.absent(date),
    placeholderData: keepPreviousData,
  });

  const groups = new Map<string, NonNullable<typeof rows>>();
  for (const row of rows ?? []) {
    const label = `${row.class.name} ${row.class.section}`;
    groups.set(label, [...(groups.get(label) ?? []), row]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Absent list"
        description="Students marked absent or on leave for the day."
        actions={
          <Button variant="outline" size="sm" render={<Link to="/attendance/mark" />}>
            Mark attendance
          </Button>
        }
      />
      <div className="flex items-center gap-3">
        <DatePicker value={date} onChange={(value) => value && setParams(value === todayIso() ? {} : { date: value }, { replace: true })} />
        {rows ? <p className="text-sm text-muted-foreground">{rows.length} student{rows.length === 1 ? "" : "s"}</p> : null}
      </div>
      <FetchingIndicator show={isFetching && Boolean(rows)} label="Updating absences" />

      {isError ? (
        <ErrorState title="Could not load the absent list" description="Try again in a moment." onRetry={() => void refetch()} />
      ) : isPending && !rows ? (
        <LoadingState variant="list" />
      ) : !rows?.length ? (
        <EmptyState title="No absences or leave" description="Nobody is marked absent or on leave for this date." />
      ) : (
        [...groups.entries()].map(([label, list]) => (
          <section key={label} aria-label={label} className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              {label} · {list.length}
            </h2>
            <ul className="overflow-hidden rounded-3xl bg-surface">
              {list.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 border-t border-line px-5 py-3 first:border-t-0">
                  <Link to={`/students/${row.student.id}?tab=attendance`} className="font-medium hover:text-indigo">
                    {row.student.firstName} {row.student.lastName}
                  </Link>
                  <Badge tone={row.status === "ABSENT" ? "danger" : "neutral"}>{row.status === "ABSENT" ? "Absent" : "Leave"}</Badge>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
