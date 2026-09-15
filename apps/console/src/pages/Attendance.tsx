import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, EmptyState, FetchingIndicator, Skeleton } from "@wellrun/ui";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Toast } from "../components/motion";
import { api } from "../lib/api";
import { todayIso } from "../lib/format";
import { queryKeys } from "../lib/query";

type Status = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";

const marks: { id: Status; label: string; on: string }[] = [
  { id: "PRESENT", label: "Present", on: "bg-success text-white" },
  { id: "ABSENT", label: "Absent", on: "bg-danger text-white" },
  { id: "LATE", label: "Late", on: "bg-orange text-white" },
  { id: "LEAVE", label: "Leave", on: "bg-ink text-white" },
];

export function AttendancePage() {
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [draft, setDraft] = useState<Record<string, Status> | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: classes = [], isPending: classesPending } = useQuery({ queryKey: queryKeys.classes, queryFn: api.classes });
  const resolvedClassId = classId || classes[0]?.id || "";
  const selected = classes.find((c) => c.id === resolvedClassId);
  const { data: rows, isPending: rowsPending, isFetching } = useQuery({
    queryKey: queryKeys.attendance(resolvedClassId, date),
    queryFn: () => api.attendance(resolvedClassId, date),
    enabled: Boolean(resolvedClassId),
    placeholderData: keepPreviousData,
  });

  const baseline = useMemo(() => {
    const next: Record<string, Status> = {};
    for (const row of rows ?? []) next[row.studentId] = row.status as Status;
    for (const enrollment of selected?.enrollments ?? []) {
      next[enrollment.student.id] ??= "PRESENT";
    }
    return next;
  }, [rows, selected]);

  const values = draft ?? baseline;
  const students = useMemo(() => selected?.enrollments.map((e) => e.student) ?? [], [selected]);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await api.saveAttendance({
        classId: resolvedClassId,
        date,
        records: students.map((student) => ({
          studentId: student.id,
          status: values[student.id] ?? "PRESENT",
        })),
      });
      setToast("Attendance saved");
      setTimeout(() => setToast(null), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-end justify-between">
        <h1 className="font-display text-4xl">Attendance</h1>
        <Link to="/absent" className="text-sm text-indigo">
          Today’s absent list
        </Link>
      </div>
      <div className="mt-6 flex gap-3">
        <select
          value={resolvedClassId}
          onChange={(e) => {
            setClassId(e.target.value);
            setDraft(null);
          }}
          className="h-11 rounded-xl border border-line bg-surface px-3"
        >
          {classes.map((cls) => (
            <option key={cls.id} value={cls.id}>
              {cls.name} {cls.section}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setDraft(null);
          }}
          className="h-11 rounded-xl border border-line bg-surface px-3"
        />
        <Button type="button" loading={saving} onClick={() => void save()}>
          Save attendance
        </Button>
      </div>
      <FetchingIndicator show={isFetching && Boolean(rows)} label="Updating register" />
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {!classesPending && !classes.length ? (
        <EmptyState
          title="No classes assigned"
          description="Add a class first, then mark attendance for that section."
        />
      ) : null}

      {classesPending || (rowsPending && !rows) ? (
        <div className="mt-6 overflow-hidden rounded-3xl bg-surface" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex items-center justify-between border-t border-line px-5 py-4 first:border-t-0">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-8 w-64" />
            </div>
          ))}
        </div>
      ) : (
      <div className={`mt-6 overflow-hidden rounded-3xl bg-surface ${isFetching ? "opacity-80" : ""}`}>
        {students.map((student) => (
          <div key={student.id} className="flex items-center justify-between border-t border-line px-5 py-4 first:border-t-0">
            <div>
              <p className="font-medium">
                {student.firstName} {student.lastName}
              </p>
              <p className="text-sm text-muted">{student.admissionNo}</p>
            </div>
            <div className="flex gap-2">
              {marks.map((mark) => (
                <button
                  key={mark.id}
                  type="button"
                  onClick={() => setDraft({ ...values, [student.id]: mark.id })}
                  className={`rounded-full px-3 py-2 text-sm ${
                    values[student.id] === mark.id ? mark.on : "bg-paper"
                  }`}
                >
                  {mark.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      )}
      <Toast message={toast} />
    </div>
  );
}
