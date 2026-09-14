import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, SlidersHorizontal, UserPlus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { AttendanceRing } from "../components/AttendanceRing";
import { api } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";

export function StudentsPage() {
  const [q, setQ] = useState("");
  const [guardian, setGuardian] = useState("");
  const [address, setAddress] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [classId, setClassId] = useState("");
  const [topScorer, setTopScorer] = useState(false);
  const [perfectAttendance, setPerfectAttendance] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [page, setPage] = useState(1);
  const filters = {
    q,
    guardian,
    address,
    dateOfBirth,
    classId: classId || undefined,
    topScorer: topScorer ? "true" : undefined,
    perfectAttendance: perfectAttendance ? "true" : undefined,
    page,
    pageSize: 20,
  };
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.students(filters),
    queryFn: () => api.students(filters),
    placeholderData: keepPreviousData,
  });
  const ready = !isPending || Boolean(data);
  const selectedClass = classId || data?.defaultClassId || "all";

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));
  const advancedCount = [guardian, address, dateOfBirth, topScorer, perfectAttendance].filter(Boolean).length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Students</h1>
          <p className="mt-2 text-sm text-muted">
            {data?.campus ? `${data.campus.name} · ` : ""}
            {data?.total ?? 0} {data?.total === 1 ? "student" : "students"}
          </p>
        </div>
        <Link
          to="/admission"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo px-4 font-medium text-white"
        >
          <UserPlus size={18} />
          New admission
        </Link>
      </div>
      {isError ? <p className="mt-4 text-sm text-danger">{error instanceof Error ? error.message : "Could not load students"}</p> : null}

      <section className="mt-6 rounded-3xl bg-surface p-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-medium">
            Search by student
            <input
              value={q}
              onChange={(event) => {
                setPage(1);
                setQ(event.target.value);
              }}
              placeholder="Name or roll no."
              className="mt-2 h-11 w-full rounded-xl border border-line px-3"
            />
          </label>
          <label className="text-sm font-medium">
            Class
            <select
              value={selectedClass}
              onChange={(event) => {
                setPage(1);
                setClassId(event.target.value);
              }}
              className="mt-2 h-11 w-full rounded-xl border border-line px-3"
            >
              <option value="all">All classes</option>
              {data?.classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name} {cls.section}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setAdvanced((value) => !value)}
            className={`mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium ${
              advanced || advancedCount ? "bg-indigo text-white" : "bg-paper"
            }`}
          >
            <SlidersHorizontal size={16} />
            Advance filter
            {advancedCount ? <span className="rounded-full bg-white/20 px-1.5 text-xs">{advancedCount}</span> : null}
          </button>
        </div>

        {advanced ? (
          <div className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 md:grid-cols-3">
            <label className="text-sm font-medium">
              Guardian
              <input
                value={guardian}
                onChange={(event) => {
                  setPage(1);
                  setGuardian(event.target.value);
                }}
                placeholder="Phone or CNIC"
                className="mt-2 h-11 w-full rounded-xl border border-line px-3"
              />
            </label>
            <label className="text-sm font-medium">
              Address
              <input
                value={address}
                onChange={(event) => {
                  setPage(1);
                  setAddress(event.target.value);
                }}
                placeholder="Street, area, city"
                className="mt-2 h-11 w-full rounded-xl border border-line px-3"
              />
            </label>
            <label className="text-sm font-medium">
              Date of birth
              <input
                type="date"
                value={dateOfBirth}
                onChange={(event) => {
                  setPage(1);
                  setDateOfBirth(event.target.value);
                }}
                className="mt-2 h-11 w-full rounded-xl border border-line px-3"
              />
            </label>
            <label className="flex items-center gap-2 text-sm md:pt-2">
              <input
                type="checkbox"
                checked={topScorer}
                onChange={(event) => {
                  setPage(1);
                  setTopScorer(event.target.checked);
                }}
              />
              Top scorer in recent exam
            </label>
            <label className="flex items-center gap-2 text-sm md:pt-2">
              <input
                type="checkbox"
                checked={perfectAttendance}
                onChange={(event) => {
                  setPage(1);
                  setPerfectAttendance(event.target.checked);
                }}
              />
              100% attendance this year
            </label>
          </div>
        ) : null}
      </section>

      <div className="mt-6 overflow-x-auto rounded-3xl bg-surface">
        <table className="w-full min-w-[920px] text-left">
          <thead className="text-sm text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Roll no.</th>
              <th className="px-5 py-3 font-medium">Student</th>
              <th className="px-5 py-3 font-medium">Class</th>
              <th className="px-5 py-3 font-medium">Phone</th>
              <th className="px-5 py-3 font-medium">Address</th>
              <th className="px-5 py-3 font-medium">Pending fees</th>
              <th className="px-5 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((student) => (
              <tr key={student.id} className="border-t border-line">
                <td className="px-5 py-4 font-medium">{student.rollNo}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <AttendanceRing value={student.attendancePct} />
                    <div>
                      <Link className="font-medium text-indigo" to={`/students/${student.id}`}>
                        {student.firstName} {student.lastName}
                      </Link>
                      <p className="text-sm text-muted">{student.guardianName || "No guardian"}</p>
                    </div>
                  </div>
                </td>
                <td className="px-5 py-4 text-muted">
                  {student.class ? `${student.class.name} ${student.class.section}` : "—"}
                </td>
                <td className="px-5 py-4 text-sm">{student.phone || "—"}</td>
                <td className="max-w-48 px-5 py-4 text-sm text-muted">{student.address || "—"}</td>
                <td className="px-5 py-4">
                  {student.pendingFees.status === "pending" ? (
                    <span className="text-orange">
                      Pending · {pkr(student.pendingFees.amountPkr)}
                    </span>
                  ) : student.pendingFees.status === "paid" ? (
                    <span className="text-success">Paid</span>
                  ) : (
                    <span className="text-muted">No invoice</span>
                  )}
                </td>
                <td className="px-5 py-4">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${student.status === "active" ? "bg-paper text-indigo" : "bg-paper text-muted"}`}>
                    {student.status === "active" ? "Active" : student.status}
                  </span>
                </td>
              </tr>
            ))}
            {ready && !data?.items.length ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-sm text-muted">
                  No students match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-sm">
        <p className="text-muted">
          Page {data?.page ?? 1} of {pages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-surface px-3 disabled:opacity-40"
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft size={16} />
            Previous
          </button>
          {Array.from({ length: pages }, (_, index) => index + 1)
            .filter((value) => value === 1 || value === pages || Math.abs(value - page) <= 1)
            .map((value, index, list) => (
              <span key={value} className="flex gap-2">
                {index > 0 && list[index - 1] !== value - 1 ? <span className="px-1 text-muted">…</span> : null}
                <button
                  type="button"
                  className={`h-10 min-w-10 rounded-xl px-3 ${value === page ? "bg-indigo text-white" : "bg-surface"}`}
                  onClick={() => setPage(value)}
                >
                  {value}
                </button>
              </span>
            ))}
          <button
            type="button"
            disabled={page >= pages}
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-surface px-3 disabled:opacity-40"
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
