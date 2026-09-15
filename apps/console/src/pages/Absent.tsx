import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState, FetchingIndicator, Skeleton } from "@wellrun/ui";
import { useState } from "react";
import { api } from "../lib/api";
import { todayIso } from "../lib/format";
import { queryKeys } from "../lib/query";

export function AbsentPage() {
  const [date, setDate] = useState(todayIso());
  const { data: rows, isPending, isFetching } = useQuery({
    queryKey: queryKeys.absent(date),
    queryFn: () => api.absent(date),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <h1 className="font-display text-4xl">Absent list</h1>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mt-6 h-11 rounded-xl border border-line bg-surface px-3"
      />
      <FetchingIndicator show={isFetching && Boolean(rows)} label="Updating absences" />
      <div className="mt-6 overflow-hidden rounded-3xl bg-surface">
        {isPending && !rows ? (
          Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex items-center justify-between border-t border-line px-5 py-4 first:border-t-0">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))
        ) : !rows?.length ? (
          <EmptyState title="No absences or leave" description="Nobody is marked absent or on leave for this date." />
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between border-t border-line px-5 py-4 first:border-t-0">
              <div>
                <p className="font-medium">
                  {row.student.firstName} {row.student.lastName}
                </p>
                <p className="text-sm text-muted">
                  {row.class.name} {row.class.section}
                </p>
              </div>
              <p className="text-sm">{row.status}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}