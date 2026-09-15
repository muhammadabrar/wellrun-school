import { useQuery } from "@tanstack/react-query";
import { Button, LoadingState } from "@wellrun/ui";
import { classSortIndex } from "@wellrun/shared";
import { UserPlus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type AdmissionField } from "../lib/api";
import { queryKeys } from "../lib/query";

export function AdmissionPage() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: queryKeys.admission, queryFn: api.admission });
  const { data: guardians = [] } = useQuery({ queryKey: queryKeys.guardians, queryFn: () => api.guardians() });
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [guardianId, setGuardianId] = useState("");
  const [guardianSearch, setGuardianSearch] = useState("");
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fields = data?.fields ?? [];
  const firstClass = useMemo(
    () => [...(data?.classes ?? [])].sort((a, b) => a.name.localeCompare(b.name))[0],
    [data],
  );
  const selectedClass = className || firstClass?.name || "";
  const selectedSection = section || firstClass?.section || "";
  const guardianFields = fields.filter((field) => field.group === "guardian");
  const studentFields = fields.filter((field) => field.group === "student");
  const classNames = [...new Set((data?.classes ?? []).map((cls) => cls.name))].sort(
    (a, b) => classSortIndex(a) - classSortIndex(b),
  );
  const sections = (data?.classes ?? []).filter((cls) => cls.name === selectedClass).map((cls) => cls.section);
  const matchedGuardians = guardians.filter((row) => {
    const hay = `${row.name} ${row.phone} ${row.cnic ?? ""}`.toLowerCase();
    return hay.includes(guardianSearch.toLowerCase());
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setMessage(null);
    if (mode === "existing" && !guardianId) {
      setError("Select a guardian or switch to new guardian.");
      return;
    }
    if (!selectedClass || !selectedSection) {
      setError("Create a class first, then admit the student.");
      return;
    }
    const extra: Record<string, string> = {};
    const guardianExtra: Record<string, string> = {};
    for (const field of fields) {
      if (["firstName", "lastName", "dateOfBirth", "className", "section", "gender", "guardianName", "guardianPhone", "guardianCnic", "guardianRelation"].includes(field.key)) {
        continue;
      }
      const value = String(form.get(field.key) ?? "");
      if (field.group === "guardian") guardianExtra[field.key] = value;
      else extra[field.key] = value;
    }
    try {
      setPending(true);
      const student = await api.admitStudent({
        guardianId: mode === "existing" ? guardianId : undefined,
        guardian:
          mode === "new"
            ? {
                name: String(form.get("guardianName") || ""),
                phone: String(form.get("guardianPhone") || ""),
                cnic: String(form.get("guardianCnic") || ""),
                relation: String(form.get("guardianRelation") || "Parent"),
                extra: guardianExtra,
              }
            : undefined,
        firstName: String(form.get("firstName") || ""),
        lastName: String(form.get("lastName") || ""),
        dateOfBirth: String(form.get("dateOfBirth") || ""),
        className: selectedClass,
        section: selectedSection,
        gender: String(form.get("gender") || "") || undefined,
        extra,
        guardianExtra,
      });
      setMessage(`${student.firstName} admitted. Roll no. ${student.rollNo} assigned.`);
      navigate(`/students/${student.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not admit student");
    } finally {
      setPending(false);
    }
  }

  if (!data) return <LoadingState variant="form" />;

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-4xl">Admission</h1>
      <p className="mt-2 text-sm text-muted">Start with the guardian, then fill the student form for this campus.</p>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-indigo">{message}</p> : null}

      <form onSubmit={onSubmit} className="mt-8 space-y-6">
        <section className="rounded-3xl bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl">Guardian</h2>
            <div className="flex rounded-xl bg-paper p-1">
              <button
                type="button"
                className={`h-9 rounded-lg px-3 text-sm ${mode === "new" ? "bg-indigo text-white" : ""}`}
                onClick={() => setMode("new")}
              >
                New guardian
              </button>
              <button
                type="button"
                className={`h-9 rounded-lg px-3 text-sm ${mode === "existing" ? "bg-indigo text-white" : ""}`}
                onClick={() => setMode("existing")}
              >
                Existing guardian
              </button>
            </div>
          </div>

          {mode === "existing" ? (
            <div className="mt-4">
              <input
                value={guardianSearch}
                onChange={(event) => setGuardianSearch(event.target.value)}
                placeholder="Search by name, phone, or CNIC"
                className="h-11 w-full rounded-xl border border-line px-3"
              />
              <ul className="mt-3 max-h-64 space-y-2 overflow-auto">
                {matchedGuardians.map((guardian) => (
                  <li key={guardian.id}>
                    <button
                      type="button"
                      onClick={() => setGuardianId(guardian.id)}
                      className={`w-full rounded-2xl px-4 py-3 text-left ${guardianId === guardian.id ? "bg-indigo text-white" : "bg-paper"}`}
                    >
                      <span className="font-medium">{guardian.name}</span>
                      <span className={`mt-1 block text-sm ${guardianId === guardian.id ? "text-white/80" : "text-muted"}`}>
                        {guardian.relation} · {guardian.phone}
                        {guardian.cnic ? ` · ${guardian.cnic}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
                {!matchedGuardians.length ? <li className="text-sm text-muted">No guardians match that search.</li> : null}
              </ul>
            </div>
          ) : (
            <div className="mt-4 grid grid-cols-2 gap-3">
              {guardianFields.map((field) => (
                <FormField key={field.key} field={field} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl bg-surface p-6">
          <h2 className="font-display text-xl">Student</h2>
          <p className="mt-2 text-sm text-muted">Roll number, admission date, and first admission date are assigned when you save.</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {studentFields.map((field) => {
              if (field.type === "class") {
                return (
                  <label key={field.key} className="block text-sm font-medium">
                    {field.label}
                    <select
                      required={field.required}
                      value={selectedClass}
                      onChange={(event) => {
                        setClassName(event.target.value);
                        const next = (data.classes ?? []).find((cls) => cls.name === event.target.value);
                        setSection(next?.section ?? "A");
                      }}
                      className="mt-2 h-11 w-full rounded-xl border border-line px-3"
                    >
                      {classNames.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              if (field.type === "section") {
                return (
                  <label key={field.key} className="block text-sm font-medium">
                    {field.label}
                    <select
                      required={field.required}
                      value={selectedSection}
                      onChange={(event) => setSection(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-line px-3"
                    >
                      {sections.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              }
              return <FormField key={field.key} field={field} />;
            })}
          </div>
        </section>

        <div className="flex gap-3">
          <Button type="submit" loading={pending} icon={<UserPlus size={18} />}>
            Admit student
          </Button>
          <Link to="/students" className="flex h-11 items-center rounded-xl bg-paper px-5">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function FormField({ field }: { field: AdmissionField }) {
  if (field.type === "select" || field.key === "gender") {
    return (
      <label className="block text-sm font-medium">
        {field.label}
        <select name={field.key} required={field.required} className="mt-2 h-11 w-full rounded-xl border border-line px-3">
          <option value="female">Female</option>
          <option value="male">Male</option>
          <option value="other">Other</option>
        </select>
      </label>
    );
  }
  if (field.key === "guardianRelation") {
    return (
      <label className="block text-sm font-medium">
        {field.label}
        <select name={field.key} required={field.required} defaultValue="Mother" className="mt-2 h-11 w-full rounded-xl border border-line px-3">
          <option>Mother</option>
          <option>Father</option>
          <option>Guardian</option>
          <option>Other</option>
        </select>
      </label>
    );
  }
  return (
    <label className="block text-sm font-medium">
      {field.label}
      <input
        name={field.key}
        type={field.type === "date" ? "date" : "text"}
        required={field.required}
        className="mt-2 h-11 w-full rounded-xl border border-line px-3"
      />
    </label>
  );
}
