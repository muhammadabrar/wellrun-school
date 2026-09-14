import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { todayIso } from "../lib/format";
import { queryKeys } from "../lib/query";

export function AbsentPage() {
  const [date, setDate] = useState(todayIso());
  const { data: rows = [] } = useQuery({
    queryKey: queryKeys.absent(date),
    queryFn: () => api.absent(date),
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
      <div className="mt-6 overflow-hidden rounded-3xl bg-surface">
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-muted">No absences or leave for this date.</p>
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
