import { FormEvent, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Student } from "../lib/api";
import { pkr } from "../lib/format";

export function StudentPage() {
  const { id } = useParams();
  const [student, setStudent] = useState<Student | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    if (id) api.student(id).then(setStudent);
  }

  useEffect(() => {
    load();
  }, [id]);

  if (!student) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;

  async function onGuardian(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    const data = new FormData(event.currentTarget);
    setError(null);
    try {
      await api.addGuardian(id, {
        name: String(data.get("name")),
        phone: String(data.get("phone")),
        relation: String(data.get("relation")),
        email: String(data.get("email") || ""),
      });
      event.currentTarget.reset();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add parent");
    }
  }

  async function markLeft() {
    if (!id) return;
    await api.updateStudent(id, { status: "left" });
    load();
  }

  return (
    <div>
      <Link to="/students" className="text-sm text-indigo">
        All students
      </Link>
      <h1 className="mt-2 font-display text-4xl">
        {student.firstName} {student.lastName}
      </h1>
      <p className="mt-1 text-muted">
        Roll {student.rollNo || student.admissionNo} · Admission {student.admissionNo} · {student.status}
      </p>
      {student.admissionDate ? (
        <p className="mt-1 text-sm text-muted">
          Admitted {student.admissionDate.slice(0, 10)}
          {student.firstAdmissionDate ? ` · First admission ${student.firstAdmissionDate.slice(0, 10)}` : ""}
        </p>
      ) : null}
      <div className="mt-8 grid grid-cols-2 gap-4">
        <section className="rounded-3xl bg-surface p-6">
          <h2 className="font-display text-xl">Family</h2>
          {student.guardians.map((link) => (
            <p key={`${link.guardian.phone}-${link.guardian.name}`} className="mt-3">
              {link.guardian.name}
              <span className="block text-sm text-muted">
                {link.guardian.relation} · {link.guardian.phone}
                {link.guardian.cnic ? ` · ${link.guardian.cnic}` : ""}
              </span>
            </p>
          ))}
          <form onSubmit={onGuardian} className="mt-5 grid gap-2">
            <input name="name" required placeholder="Parent name" className="h-11 rounded-xl border border-line px-3" />
            <input name="phone" required placeholder="WhatsApp / phone" className="h-11 rounded-xl border border-line px-3" />
            <input name="relation" required defaultValue="Father" className="h-11 rounded-xl border border-line px-3" />
            <input name="email" type="email" placeholder="Email (optional)" className="h-11 rounded-xl border border-line px-3" />
            {error ? <p className="text-sm text-danger">{error}</p> : null}
            <button type="submit" className="h-11 rounded-xl bg-indigo text-white">
              Link parent
            </button>
          </form>
        </section>
        <section className="rounded-3xl bg-surface p-6">
          <h2 className="font-display text-xl">Fees</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {student.invoices.map((invoice) => (
              <li key={invoice.id} className="flex justify-between">
                <span>{invoice.feePlan.name}</span>
                <span>
                  {pkr(invoice.amountPkr)} · {invoice.status}
                </span>
              </li>
            ))}
          </ul>
          {student.status === "active" ? (
            <button type="button" onClick={markLeft} className="mt-6 text-sm text-danger">
              Mark as left
            </button>
          ) : null}
        </section>
      </div>
    </div>
  );
}
