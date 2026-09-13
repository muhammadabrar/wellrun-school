import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api, type SchoolClass } from "../lib/api";
import { todayIso } from "../lib/format";
import { SpinnerCheck, Toast } from "../components/motion";

type Status = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";

const marks: { id: Status; label: string; on: string }[] = [
  { id: "PRESENT", label: "Present", on: "bg-success text-white" },
  { id: "ABSENT", label: "Absent", on: "bg-danger text-white" },
  { id: "LATE", label: "Late", on: "bg-orange text-white" },
  { id: "LEAVE", label: "Leave", on: "bg-ink text-white" },
];

export function AttendancePage() {
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [values, setValues] = useState<Record<string, Status>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = classes.find((c) => c.id === classId);

  useEffect(() => {
    api.classes().then((list) => {
      setClasses(list);
      if (list[0]) setClassId(list[0].id);
    });
  }, []);

  useEffect(() => {
    if (!classId) return;
    api.attendance(classId, date).then((rows) => {
      const next: Record<string, Status> = {};
      for (const row of rows) next[row.studentId] = row.status as Status;
      const cls = classes.find((c) => c.id === classId);
      for (const enrollment of cls?.enrollments ?? []) {
        next[enrollment.student.id] ??= "PRESENT";
      }
      setValues(next);
    });
  }, [classId, date, classes]);

  const students = useMemo(() => selected?.enrollments.map((e) => e.student) ?? [], [selected]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await api.saveAttendance({
        classId,
        date,
        records: students.map((student) => ({
          studentId: student.id,
          status: values[student.id] ?? "PRESENT",
        })),
      });
      setSaved(true);
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
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
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
          onChange={(e) => setDate(e.target.value)}
          className="h-11 rounded-xl border border-line bg-surface px-3"
        />
        <button
          type="button"
          onClick={save}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo px-4 font-medium text-white"
        >
          <SpinnerCheck done={saved && !saving} />
          Save attendance
        </button>
      </div>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {!classes.length ? <p className="mt-8 text-muted">No classes assigned to this account.</p> : null}

      <div className="mt-6 overflow-hidden rounded-3xl bg-surface">
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
                  onClick={() => setValues((m) => ({ ...m, [student.id]: mark.id }))}
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
      <Toast message={toast} />
    </div>
  );
}
