import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, MessageCircle, Pencil, Phone } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AttendanceRing } from "../components/AttendanceRing";
import { Toast } from "../components/motion";
import { api } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";
import { fileToDataUrl } from "../lib/setup-helpers";

type Tab = "exams" | "attendance" | "fees";

const tabs: { id: Tab; label: string }[] = [
  { id: "exams", label: "Exams" },
  { id: "attendance", label: "Attendance" },
  { id: "fees", label: "Fees" },
];

export function StudentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const photoInput = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const {
    data: student,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.student(id ?? ""),
    queryFn: () => api.student(id!),
    enabled: Boolean(id),
  });
  const [tab, setTab] = useState<Tab>("exams");
  const [yearId, setYearId] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const resolvedYearId = yearId || student?.years.find((year) => year.current)?.id || student?.years[0]?.id || "";

  const year = student?.years.find((row) => row.id === resolvedYearId);
  const yearData = useMemo(() => {
    if (!student) return { exams: [], attendance: [], invoices: [] };
    const starts = year ? new Date(year.startsOn).getTime() : 0;
    const ends = year ? new Date(year.endsOn).getTime() : Number.POSITIVE_INFINITY;
    const inYear = (value: string, linkedYearId?: string) => {
      if (!year) return true;
      if (linkedYearId && linkedYearId === year.id) return true;
      const time = new Date(value).getTime();
      return time >= starts && time <= ends;
    };
    return {
      exams: student.exams.filter((row) => inYear(row.heldOn, row.yearId)),
      attendance: student.attendance.filter((row) => inYear(row.date)),
      invoices: student.invoices.filter((row) => inYear(row.dueOn, row.yearId)),
    };
  }, [student, year]);

  if (!student) {
    return (
      <div>
        {error || queryError ? (
          <p className="text-sm text-danger">{error ?? (queryError instanceof Error ? queryError.message : "Could not load student")}</p>
        ) : (
          <div className="h-40 animate-pulse rounded-3xl bg-surface" />
        )}
      </div>
    );
  }

  const callHref = phoneHref(student.phone);
  const whatsappHref = whatsappLink(student.phone);
  const attendancePct = attendancePercent(yearData.attendance);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!id) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      const extra = { ...student!.extra };
      extra.phone = String(form.get("phone") || "");
      extra.address = String(form.get("address") || "");
      const next = await api.updateStudent(id, {
        firstName: String(form.get("firstName") || ""),
        lastName: String(form.get("lastName") || ""),
        dateOfBirth: String(form.get("dateOfBirth") || "") || undefined,
        gender: String(form.get("gender") || "") || undefined,
        status: String(form.get("status") || "active"),
        classId: String(form.get("classId") || "") || undefined,
        phone: extra.phone,
        address: extra.address,
        extra,
      });
      queryClient.setQueryData(queryKeys.student(id), next);
      setEditing(false);
      setToast("Student updated.");
      setTimeout(() => setToast(null), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save student");
    }
  }

  async function onPhoto(file: File) {
    if (!id) return;
    const dataUrl = await fileToDataUrl(file);
    const next = await api.saveStudentPhoto(id, dataUrl);
    queryClient.setQueryData(queryKeys.student(id), next);
    setToast("Photo saved.");
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <div>
      <Link to="/students" className="text-sm text-indigo">
        All students
      </Link>

      <div className="mt-4 flex flex-wrap items-start gap-6">
        <div className="min-w-[20rem] grow basis-[36rem] space-y-6">
          <section className="rounded-3xl bg-surface p-6">
            <div className="flex flex-wrap items-start gap-5">
              <button
                type="button"
                className="relative shrink-0 cursor-pointer"
                onClick={() => photoInput.current?.click()}
                aria-label="Change photo"
              >
                <Avatar name={`${student.firstName} ${student.lastName}`} photo={student.photo} />
                <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full bg-indigo text-white">
                  <Camera size={14} />
                </span>
              </button>
              <input
                ref={photoInput}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onPhoto(file);
                }}
              />
              <div className="min-w-0 flex-1">
                <h1 className="font-display text-4xl">
                  {student.firstName} {student.lastName}
                </h1>
                <p className="mt-1 text-muted">
                  Roll {student.rollNo}
                  {student.class ? ` · ${student.class.name} ${student.class.section}` : ""}
                </p>
                <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs ${student.status === "active" ? "bg-paper text-indigo" : "bg-paper text-muted"}`}>
                  {student.status === "active" ? "Active" : student.status}
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              <a
                href={callHref || undefined}
                aria-disabled={!callHref}
                className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium ${callHref ? "cursor-pointer bg-paper" : "pointer-events-none bg-paper text-muted opacity-50"}`}
              >
                <Phone size={16} />
                Call
              </a>
              <a
                href={whatsappHref || undefined}
                target="_blank"
                rel="noreferrer"
                aria-disabled={!whatsappHref}
                className={`inline-flex h-11 items-center gap-2 rounded-xl px-4 text-sm font-medium ${whatsappHref ? "cursor-pointer bg-paper" : "pointer-events-none bg-paper text-muted opacity-50"}`}
              >
                <MessageCircle size={16} />
                WhatsApp
              </a>
              <button
                type="button"
                className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl bg-indigo px-4 text-sm font-medium text-white"
                onClick={() => setEditing((value) => !value)}
              >
                <Pencil size={16} />
                {editing ? "Close" : "Modify"}
              </button>
            </div>
          </section>

          {editing ? (
            <form onSubmit={onSave} className="rounded-3xl bg-surface p-6">
              <h2 className="font-display text-xl">Modify student</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <Field name="firstName" label="First name" defaultValue={student.firstName} required />
                <Field name="lastName" label="Last name" defaultValue={student.lastName} required />
                <Field name="dateOfBirth" label="Date of birth" type="date" defaultValue={student.dateOfBirth?.slice(0, 10) ?? ""} />
                <label className="text-sm font-medium">
                  Gender
                  <select name="gender" defaultValue={student.gender} className="mt-2 h-11 w-full rounded-xl border border-line px-3">
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                    <option value="other">Other</option>
                    <option value="unspecified">Unspecified</option>
                  </select>
                </label>
                <Field name="phone" label="Phone" defaultValue={student.extra.phone || student.phone} />
                <Field name="address" label="Address" defaultValue={student.address} />
                <label className="text-sm font-medium">
                  Class
                  <select name="classId" defaultValue={student.class?.id ?? ""} className="mt-2 h-11 w-full rounded-xl border border-line px-3">
                    {student.classes.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.name} {cls.section} · {cls.yearName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium">
                  Status
                  <select name="status" defaultValue={student.status} className="mt-2 h-11 w-full rounded-xl border border-line px-3">
                    <option value="active">Active</option>
                    <option value="left">Left</option>
                  </select>
                </label>
              </div>
              {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
              <div className="mt-5 flex gap-2">
                <button type="submit" className="h-11 cursor-pointer rounded-xl bg-indigo px-4 font-medium text-white">
                  Save changes
                </button>
                <button type="button" className="h-11 cursor-pointer rounded-xl bg-paper px-4" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <section className="rounded-3xl bg-surface p-6">
              <h2 className="font-display text-xl">Information</h2>
              <dl className="mt-4 divide-y divide-line">
                {student.details.map((row) => (
                  <div key={row.label} className="grid grid-cols-[9rem_1fr] gap-4 py-3 text-sm">
                    <dt className="text-muted">{row.label}</dt>
                    <dd className="font-medium">{pretty(row.label, row.value)}</dd>
                  </div>
                ))}
              </dl>
              {student.guardians.length ? (
                <div className="mt-2 border-t border-line pt-4">
                  <p className="text-sm text-muted">Guardian</p>
                  {student.guardians.map((link) => (
                    <p key={link.guardian.id} className="mt-2 font-medium">
                      {link.guardian.name}
                      <span className="mt-1 block text-sm font-normal text-muted">
                        {link.guardian.relation} · {link.guardian.phone}
                        {link.guardian.cnic ? ` · ${link.guardian.cnic}` : ""}
                      </span>
                    </p>
                  ))}
                </div>
              ) : null}
            </section>
          )}

          <section className="rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Siblings</h2>
            <p className="mt-1 text-sm text-muted">Other students under the same guardian.</p>
            {student.siblings.length ? (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {student.siblings.map((sibling) => (
                  <Link
                    key={sibling.id}
                    to={`/students/${sibling.id}`}
                    className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3"
                  >
                    <Avatar name={`${sibling.firstName} ${sibling.lastName}`} photo={sibling.photo} size="sm" />
                    <span>
                      <span className="block font-medium">
                        {sibling.firstName} {sibling.lastName}
                      </span>
                      <span className="text-sm text-muted">
                        Roll {sibling.rollNo}
                        {sibling.class ? ` · ${sibling.class.name} ${sibling.class.section}` : ""}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">No siblings on this guardian yet.</p>
            )}
          </section>
        </div>

        <aside className="min-w-[18rem] max-w-md grow basis-[20rem] lg:sticky lg:top-8">
          <section className="overflow-hidden rounded-3xl bg-surface p-5">
            <h2 className="font-display text-xl">Academic</h2>
            <label className="mt-3 block text-sm font-medium">
              Year
              <select
                value={resolvedYearId}
                onChange={(event) => setYearId(event.target.value)}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-paper px-3 text-sm"
              >
                {student.years.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.name}
                    {row.current ? " · current" : ""}
                  </option>
                ))}
              </select>
            </label>
            <div className="mt-4 flex rounded-xl bg-paper p-1">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`h-10 min-w-0 flex-1 cursor-pointer rounded-lg px-1 text-sm ${tab === item.id ? "bg-indigo text-white" : ""}`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "exams" ? (
              <div className="mt-4 space-y-3">
                {yearData.exams.length ? (
                  yearData.exams.map((exam) => (
                    <div key={exam.id} className="flex items-center justify-between rounded-2xl bg-paper px-4 py-3">
                      <div>
                        <p className="font-medium">{exam.name}</p>
                        <p className="text-sm text-muted">{exam.heldOn.slice(0, 10)}</p>
                      </div>
                      <p className="text-right">
                        <span className="font-medium">
                          {exam.obtainedMarks}/{exam.totalMarks}
                        </span>
                        <span className="mt-1 block text-sm text-muted">{exam.pct}%</span>
                      </p>
                    </div>
                  ))
                ) : (
                  <Empty text="No exam results for this year." />
                )}
              </div>
            ) : null}

            {tab === "attendance" ? (
              <div className="mt-4">
                <div className="flex items-center gap-3 rounded-2xl bg-paper px-4 py-3">
                  <AttendanceRing value={attendancePct} />
                  <div>
                    <p className="font-medium">{attendancePct}% present</p>
                    <p className="text-sm text-muted">{yearData.attendance.length} days marked</p>
                  </div>
                </div>
                <ul className="mt-3 max-h-[28rem] space-y-2 overflow-auto">
                  {yearData.attendance.length ? (
                    yearData.attendance.map((row) => (
                      <li key={row.id} className="flex items-center justify-between px-1 py-2 text-sm">
                        <span>{row.date.slice(0, 10)}</span>
                        <span className={attendanceTone(row.status)}>{labelStatus(row.status)}</span>
                      </li>
                    ))
                  ) : (
                    <Empty text="No attendance marked for this year." />
                  )}
                </ul>
              </div>
            ) : null}

            {tab === "fees" ? (
              <div className="mt-4 space-y-3">
                {yearData.invoices.length ? (
                  yearData.invoices.map((invoice) => (
                    <div key={invoice.id} className="rounded-2xl bg-paper px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{invoice.name}</p>
                          <p className="text-sm text-muted">Due {invoice.dueOn.slice(0, 10)}</p>
                        </div>
                        <p className="text-right font-medium">{pkr(invoice.amountPkr)}</p>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-sm">
                        <span className={invoice.paidPkr >= invoice.amountPkr ? "text-success" : "text-orange"}>
                          {invoice.paidPkr >= invoice.amountPkr ? "Paid" : `Pending · ${pkr(invoice.amountPkr - invoice.paidPkr)}`}
                        </span>
                        {invoice.receiptId ? (
                          <button
                            type="button"
                            className="cursor-pointer text-indigo"
                            onClick={() => navigate(`/fees/receipt/${invoice.receiptId}`)}
                          >
                            Receipt
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <Empty text="No invoices for this year." />
                )}
              </div>
            ) : null}
          </section>
        </aside>
      </div>
      <Toast message={toast} />
    </div>
  );
}

function Avatar({ name, photo, size = "lg" }: { name: string; photo?: string; size?: "lg" | "sm" }) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  const box = size === "lg" ? "h-24 w-24 text-2xl" : "h-11 w-11 text-sm";
  if (photo) {
    return <img src={photo} alt="" className={`${box} rounded-full object-cover`} />;
  }
  return (
    <span className={`flex ${box} items-center justify-center rounded-full bg-indigo text-white`}>
      {initials || "S"}
    </span>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required,
}: {
  name: string;
  label: string;
  defaultValue: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="text-sm font-medium">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="mt-2 h-11 w-full rounded-xl border border-line px-3"
      />
    </label>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-1 py-8 text-center text-sm text-muted">{text}</p>;
}

function pretty(label: string, value: string) {
  if (label === "Gender") return value.charAt(0).toUpperCase() + value.slice(1);
  return value;
}

function phoneHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  return digits ? `tel:${digits}` : "";
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const intl = digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}

function attendancePercent(rows: { status: string }[]) {
  if (!rows.length) return 0;
  const present = rows.filter((row) => row.status === "PRESENT" || row.status === "LATE").length;
  return Math.round((present / rows.length) * 100);
}

function labelStatus(status: string) {
  if (status === "PRESENT") return "Present";
  if (status === "ABSENT") return "Absent";
  if (status === "LATE") return "Late";
  if (status === "LEAVE") return "Leave";
  if (status === "EXCUSED") return "Excused";
  return status;
}

function attendanceTone(status: string) {
  if (status === "PRESENT") return "text-success";
  if (status === "ABSENT") return "text-danger";
  if (status === "LATE") return "text-orange";
  return "text-muted";
}
