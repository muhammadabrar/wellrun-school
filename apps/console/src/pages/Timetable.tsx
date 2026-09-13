import { FormEvent, useEffect, useState } from "react";
import { api, currentUser, type Staff, type Timetable } from "../lib/api";

const days = [
  { id: 1, label: "Mon" },
  { id: 2, label: "Tue" },
  { id: 3, label: "Wed" },
  { id: 4, label: "Thu" },
  { id: 5, label: "Fri" },
  { id: 6, label: "Sat" },
];

export function TimetablePage() {
  const [grid, setGrid] = useState<Timetable | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [classId, setClassId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const admin = currentUser()?.role === "SCHOOL_ADMIN";

  function load(nextClass = classId) {
    api.timetable(nextClass || undefined).then((data) => {
      setGrid(data);
      if (data.classId) setClassId(data.classId);
    });
    api.staff().catch(() => setStaff([])).then((rows) => {
      if (rows) setStaff(rows);
    });
  }

  useEffect(() => {
    load();
  }, []);

  if (!grid) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;

  async function onPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await api.savePeriod({
      label: String(data.get("label")),
      startTime: String(data.get("startTime")),
      endTime: String(data.get("endTime")),
      sortOrder: Number(data.get("sortOrder") || grid.periods.length + 1),
      isBreak: data.get("isBreak") === "on",
    });
    load();
  }

  async function onLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    try {
      await api.saveLesson({
        classId,
        weekday: Number(data.get("weekday")),
        periodId: String(data.get("periodId")),
        subject: String(data.get("subject")),
        staffId: String(data.get("staffId") || "") || undefined,
        override: data.get("override") === "on",
      });
      load(classId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save lesson");
    }
  }

  return (
    <div>
      <h1 className="font-display text-4xl">Timetable</h1>
      <select
        value={classId}
        onChange={(e) => {
          setClassId(e.target.value);
          load(e.target.value);
        }}
        className="mt-6 h-11 rounded-xl border border-line bg-surface px-3"
      >
        {grid.classes.map((cls) => (
          <option key={cls.id} value={cls.id}>
            {cls.name} {cls.section}
          </option>
        ))}
      </select>

      <div className="mt-6 overflow-x-auto rounded-3xl bg-surface">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 text-muted">Period</th>
              {days.map((day) => (
                <th key={day.id} className="px-4 py-3">
                  {day.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.periods.map((period) => (
              <tr key={period.id} className="border-t border-line">
                <th className="px-4 py-3 font-medium">
                  {period.label}
                  <span className="block text-xs font-normal text-muted">
                    {period.startTime}–{period.endTime}
                  </span>
                </th>
                {days.map((day) => {
                  const lesson = grid.lessons.find((l) => l.periodId === period.id && l.weekday === day.id);
                  return (
                    <td key={day.id} className="px-4 py-3">
                      {period.isBreak ? (
                        <span className="text-muted">Break</span>
                      ) : lesson ? (
                        <span>
                          {lesson.subject}
                          <span className="block text-xs text-muted">{lesson.staff?.name}</span>
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {admin ? (
        <div className="mt-6 grid grid-cols-2 gap-4">
          <form onSubmit={onPeriod} className="rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Add period</h2>
            <input name="label" required placeholder="Period 4" className="mt-4 h-11 w-full rounded-xl border border-line px-3" />
            <div className="mt-3 flex gap-2">
              <input name="startTime" required placeholder="10:35" className="h-11 w-full rounded-xl border border-line px-3" />
              <input name="endTime" required placeholder="11:20" className="h-11 w-full rounded-xl border border-line px-3" />
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input name="isBreak" type="checkbox" /> Break
            </label>
            <button type="submit" className="mt-4 h-11 rounded-xl bg-paper px-4">
              Save period
            </button>
          </form>
          <form onSubmit={onLesson} className="rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Place a lesson</h2>
            <select name="weekday" className="mt-4 h-11 w-full rounded-xl border border-line px-3">
              {days.map((day) => (
                <option key={day.id} value={day.id}>
                  {day.label}
                </option>
              ))}
            </select>
            <select name="periodId" className="mt-3 h-11 w-full rounded-xl border border-line px-3">
              {grid.periods.filter((p) => !p.isBreak).map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </select>
            <input name="subject" required placeholder="Subject" className="mt-3 h-11 w-full rounded-xl border border-line px-3" />
            <select name="staffId" className="mt-3 h-11 w-full rounded-xl border border-line px-3">
              <option value="">No teacher</option>
              {staff.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input name="override" type="checkbox" /> Override conflict
            </label>
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            <button type="submit" className="mt-4 h-11 rounded-xl bg-indigo px-4 text-white">
              Save lesson
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
