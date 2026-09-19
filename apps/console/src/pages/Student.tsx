import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { MessageCircle, Pencil, Phone, Wallet } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { AttendanceMeter } from "@/components/students/attendance-meter";
import { SubmitFeeDialog } from "@/components/students/submit-fee-dialog";
import { TodayAttendance, todayAttendanceLabel, useTodayAttendance } from "@/components/students/today-attendance";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toast } from "../components/motion";
import { api, currentUser } from "../lib/api";
import { mediaUrl, pkr } from "../lib/format";
import { queryKeys } from "../lib/query";
import { fileToDataUrl } from "../lib/setup-helpers";
import { useCampus } from "@/hooks/use-campus";

const tabItems = [
  { id: "overview", label: "Overview" },
  { id: "enrollments", label: "Enrollments" },
  { id: "attendance", label: "Attendance" },
  { id: "fees", label: "Fees" },
  { id: "results", label: "Results" },
  { id: "documents", label: "Documents" },
  { id: "family", label: "Family" },
  { id: "communications", label: "Notes" },
  { id: "activity", label: "Activity" },
];

export function StudentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "overview";
  const queryClient = useQueryClient();
  const canMutate = currentUser()?.role === "SCHOOL_ADMIN";
  const canMarkAttendance = currentUser()?.role === "SCHOOL_ADMIN" || currentUser()?.role === "TEACHER";
  const { classes, years } = useCampus();
  const { data: student, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.student(id ?? ""),
    queryFn: () => api.student(id!),
    enabled: Boolean(id),
  });
  const tabQuery = useQuery({
    queryKey: queryKeys.studentTab(id ?? "", tab),
    queryFn: () => api.studentTab(id!, tab === "overview" ? "enrollments" : tab),
    enabled: Boolean(id) && tab !== "overview",
  });
  const [toast, setToast] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"promote" | "deactivate" | null>(null);
  const [classId, setClassId] = useState("");
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState({ type: "NOTE", body: "" });
  const [feeOpen, setFeeOpen] = useState(false);
  const todayMark = useTodayAttendance();

  if (!student) {
    if (queryError) {
      return (
        <ErrorState
          title="Could not load student"
          description={queryError instanceof Error ? queryError.message : "Try again from the students list."}
          onRetry={() => void refetch()}
        />
      );
    }
    return <LoadingState variant="profile" />;
  }

  const metrics = [
    student.metrics.attendancePct != null ? { label: "Attendance", value: `${student.metrics.attendancePct}%` } : null,
    student.metrics.feesDue ? { label: "Fees due", value: pkr(student.metrics.feesDue) } : null,
    student.metrics.latestExamPct != null ? { label: "Latest exam", value: `${student.metrics.latestExamPct}%` } : null,
    student.metrics.enrollmentYears ? { label: "Years enrolled", value: String(student.metrics.enrollmentYears) } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  async function move(action: "promote" | "deactivate") {
    if (!id) return;
    setPending(true);
    try {
      const next = action === "deactivate" ? await api.deactivateStudent(id) : await api.promoteStudent(id, classId);
      queryClient.setQueryData(queryKeys.student(id), next);
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentTab(id, "enrollments") });
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentsRoot });
      setToast(action === "deactivate" ? "Student marked inactive." : "Enrollment updated.");
    } finally {
      setPending(false);
      setDialog(null);
    }
  }

  return (
    <div>
      <Link to="/students" className="text-sm text-indigo">
        All students
      </Link>
      <div className="mt-4 rounded-3xl bg-surface p-6">
        <div className="flex flex-wrap items-start gap-5">
          <Avatar name={`${student.firstName} ${student.lastName}`} photo={student.photo} />
          <div className="min-w-0 flex-1">
            <PageHeader
              title={`${student.firstName} ${student.lastName}`}
              description={`${student.admissionNo} · Roll ${student.rollNo}${student.class ? ` · ${student.class.name} • Section ${student.class.section}` : ""}`}
              actions={<Badge tone={student.status === "active" ? "indigo" : "neutral"}>{student.status}</Badge>}
            />
            <div className="mt-4 flex flex-wrap items-end gap-4 print:hidden">
              {student.class && canMarkAttendance ? (
                <TodayAttendance
                  value={student.todayAttendance}
                  onChange={(status) =>
                    todayMark.mutate({
                      classId: student.class!.id,
                      studentId: student.id,
                      status,
                      firstName: student.firstName,
                      lastName: student.lastName,
                      rollNo: student.rollNo,
                      className: student.class!.name,
                      section: student.class!.section,
                    })
                  }
                />
              ) : (
                <p className="text-sm text-muted-foreground">Today: {todayAttendanceLabel(student.todayAttendance)}</p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 print:hidden">
              {student.phone ? (
                <Button variant="outline" render={<a href={`tel:${student.phone.replace(/\D/g, "")}`} />}>
                  <Phone data-icon="inline-start" /> Call
                </Button>
              ) : null}
              {student.phone ? (
                <Button variant="outline" render={<a href={whatsappLink(student.phone)} target="_blank" rel="noreferrer" />}>
                  <MessageCircle data-icon="inline-start" /> WhatsApp
                </Button>
              ) : null}
              {canMutate ? (
                <>
                  <Button variant="outline" render={<Link to={`/students/${student.id}/edit`} />}>
                    <Pencil data-icon="inline-start" /> Edit profile
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setFeeOpen(true)}>
                    <Wallet data-icon="inline-start" /> Submit fee
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setDialog("promote")}>Promote</Button>
                  <Button type="button" variant="destructive" onClick={() => setDialog("deactivate")}>Deactivate</Button>
                </>
              ) : null}
            </div>
          </div>
        </div>
        {metrics.length ? (
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl bg-paper p-4">
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-1 font-display text-2xl">{metric.value}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <Tabs value={tab} onValueChange={(next) => setParams({ tab: next })} className="mt-6 print:hidden">
        <TabsList variant="line" className="h-auto w-full flex-wrap justify-start">
          {tabItems.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              {item.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4 rounded-3xl bg-surface p-6 print:hidden">
        {tab === "overview" ? (
          <dl className="divide-y divide-line">
            {student.details.map((row) => (
              <div key={row.label} className="grid grid-cols-[9rem_1fr] gap-4 py-3 text-sm">
                <dt className="text-muted-foreground">{row.label}</dt>
                <dd className="font-medium">{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : tabQuery.isPending ? (
          <LoadingState variant="form" />
        ) : tab === "enrollments" ? (
          <EnrollmentList rows={tabQuery.data as never} />
        ) : tab === "attendance" ? (
          <AttendanceList rows={tabQuery.data as never} />
        ) : tab === "fees" ? (
          <FeesList rows={tabQuery.data as never} onReceipt={(receiptId) => navigate(`/fees/receipt/${receiptId}`)} />
        ) : tab === "results" ? (
          <ResultsPanel id={student.id} rows={tabQuery.data as never} canMutate={canMutate} onSaved={() => void tabQuery.refetch()} />
        ) : tab === "family" ? (
          <FamilyPanel data={tabQuery.data as never} />
        ) : tab === "documents" ? (
          <DocumentsPanel id={student.id} rows={tabQuery.data as never} canMutate={canMutate} onSaved={() => void tabQuery.refetch()} />
        ) : tab === "communications" ? (
          <div>
            {canMutate ? (
              <form
                className="mb-4"
                onSubmit={async (event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  await api.addStudentCommunication(student.id, note);
                  setNote({ type: "NOTE", body: "" });
                  await tabQuery.refetch();
                }}
              >
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="note-type">Type</FieldLabel>
                    <FormSelect
                      id="note-type"
                      value={note.type}
                      onValueChange={(value) => setNote((current) => ({ ...current, type: value || "NOTE" }))}
                      options={[
                        { value: "NOTE", label: "Note" },
                        { value: "MEETING", label: "Meeting" },
                      ]}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="note-body">Details</FieldLabel>
                    <Textarea id="note-body" value={note.body} onChange={(event) => setNote((current) => ({ ...current, body: event.target.value }))} />
                  </Field>
                  <Button type="submit">Log {note.type === "MEETING" ? "meeting" : "note"}</Button>
                </FieldGroup>
              </form>
            ) : null}
            <NotesList rows={tabQuery.data as never} />
          </div>
        ) : (
          <ActivityList rows={tabQuery.data as never} />
        )}
      </div>

      <Dialog
        open={dialog === "promote"}
        title="Promote student"
        description="The current enrollment is closed and a new one is created."
        confirmLabel="Promote"
        loading={pending}
        onClose={() => setDialog(null)}
        onConfirm={() => void move("promote")}
      >
        <p className="mb-4 text-sm">
          Current class:{" "}
          <span className="font-medium">
            {student.class ? `${student.class.name} • Section ${student.class.section}` : "No class assigned"}
          </span>
        </p>
        <Field>
          <FieldLabel htmlFor="new-class">New class</FieldLabel>
          <FormSelect
            id="new-class"
            value={classId || undefined}
            onValueChange={(value) => setClassId(value ?? "")}
            placeholder="Select class"
            options={classes.map((cls) => ({
              value: cls.id,
              label: `${cls.name} ${cls.section}${years.find((year) => year.id === cls.yearId) ? ` · ${years.find((year) => year.id === cls.yearId)?.name}` : ""}`,
            }))}
          />
        </Field>
      </Dialog>
      <Dialog open={dialog === "deactivate"} title="Deactivate this student?" description="The current enrollment is closed. History stays in place." confirmLabel="Deactivate" danger loading={pending} onClose={() => setDialog(null)} onConfirm={() => void move("deactivate")} />
      <SubmitFeeDialog
        studentId={student.id}
        studentName={`${student.firstName} ${student.lastName}`}
        open={feeOpen}
        onClose={() => setFeeOpen(false)}
      />
      <Toast message={todayMark.toast ?? toast} />
    </div>
  );
}

function EnrollmentList({ rows }: { rows: { id: string; rollNo: string; status: string; class: { name: string; section: string; yearName: string; campusName: string } }[] }) {
  if (!rows?.length) return <EmptyState title="No enrollments" description="This student does not have an academic placement yet." />;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-2xl bg-paper px-4 py-3">
          <p className="font-medium">{row.class.name} • Section {row.class.section}</p>
          <p className="text-sm text-muted-foreground">{row.class.yearName} · {row.class.campusName || "Campus"} · Roll {row.rollNo} · {row.status}</p>
        </li>
      ))}
    </ul>
  );
}

function AttendanceList({ rows }: { rows: { id: string; date: string; status: string; className: string }[] }) {
  if (!rows?.length) return <EmptyState title="No attendance marked" description="Attendance appears here after a class is marked." />;
  const pct = Math.round((rows.filter((row) => row.status === "PRESENT" || row.status === "LATE").length / rows.length) * 100);
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <AttendanceMeter value={pct} marked />
        <p className="text-sm text-muted-foreground">{pct}% present across {rows.length} days</p>
      </div>
      <ul className="max-h-[28rem] space-y-2 overflow-auto text-sm">
        {rows.map((row) => (
          <li key={row.id} className="flex justify-between">
            <span>{String(row.date).slice(0, 10)}</span>
            <span>{row.status.toLowerCase()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FeesList({ rows, onReceipt }: { rows: { id: string; name: string; amountPkr: number; paidPkr: number; dueOn: string; receiptId: string | null }[]; onReceipt: (id: string) => void }) {
  if (!rows?.length) return <EmptyState title="No invoices" description="Fee invoices appear after billing." />;
  return (
    <ul className="space-y-3">
      {rows.map((invoice) => (
        <li key={invoice.id} className="flex items-center justify-between rounded-2xl bg-paper px-4 py-3">
          <div>
            <p className="font-medium">{invoice.name}</p>
            <p className="text-sm text-muted-foreground">Due {String(invoice.dueOn).slice(0, 10)}</p>
          </div>
          <div className="text-right">
            <p>{pkr(invoice.amountPkr)}</p>
            {invoice.receiptId ? (
              <button type="button" className="text-sm text-indigo" onClick={() => onReceipt(invoice.receiptId!)}>Receipt</button>
            ) : (
              <p className="text-sm text-orange">Due {pkr(invoice.amountPkr - invoice.paidPkr)}</p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ResultsPanel({
  id,
  rows,
  canMutate,
  onSaved,
}: {
  id: string;
  rows: { id: string; name: string; subject: string; obtainedMarks: number; totalMarks: number; pct: number; heldOn: string }[];
  canMutate: boolean;
  onSaved: () => void;
}) {
  const { data: exams } = useQuery({ queryKey: queryKeys.exams, queryFn: api.exams, enabled: canMutate });
  const [examId, setExamId] = useState("");
  const [subject, setSubject] = useState("English");
  const [obtained, setObtained] = useState("0");
  const [total, setTotal] = useState("100");
  return (
    <div>
      {canMutate ? (
        <form
          className="mb-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!examId) return;
            await api.writeExamResult(examId, { studentId: id, subject, obtainedMarks: Number(obtained), totalMarks: Number(total) });
            onSaved();
          }}
        >
        <FieldGroup className="grid md:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="exam">Exam</FieldLabel>
            <FormSelect
              id="exam"
              value={examId || undefined}
              onValueChange={(value) => setExamId(value ?? "")}
              placeholder="Select exam"
              options={(exams ?? []).map((exam) => ({ value: exam.id, label: exam.name }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="subject">Subject</FieldLabel>
            <Input id="subject" value={subject} onChange={(event) => setSubject(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="obtained">Obtained</FieldLabel>
            <Input id="obtained" type="number" value={obtained} onChange={(event) => setObtained(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="total">Total</FieldLabel>
            <Input id="total" type="number" value={total} onChange={(event) => setTotal(event.target.value)} />
          </Field>
          <Button type="submit">Save result</Button>
        </FieldGroup>
        </form>
      ) : null}
      {!rows?.length ? <EmptyState title="No exam results" description="Results appear after exams are entered." /> : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="flex justify-between rounded-2xl bg-paper px-4 py-3">
              <span>{row.name}{row.subject ? ` · ${row.subject}` : ""}</span>
              <span>{row.obtainedMarks}/{row.totalMarks} · {row.pct}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FamilyPanel({ data }: { data: { guardians: { id: string; name: string; phone: string; relation: string }[]; siblings: { id: string; firstName: string; lastName: string; rollNo: string; class: { name: string; section: string } | null }[] } }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl">Guardians</h2>
        {data?.guardians?.map((guardian) => (
          <p key={guardian.id} className="mt-2">
            {guardian.name}
            <span className="block text-sm text-muted-foreground">{guardian.relation} · {guardian.phone}</span>
          </p>
        ))}
      </div>
      <div>
        <h2 className="font-display text-xl">Siblings</h2>
        {data?.siblings?.length ? data.siblings.map((sibling) => (
          <Link key={sibling.id} to={`/students/${sibling.id}`} className="mt-2 block text-indigo">
            {sibling.firstName} {sibling.lastName} · Roll {sibling.rollNo}
          </Link>
        )) : <p className="mt-2 text-sm text-muted-foreground">No siblings on this guardian yet.</p>}
      </div>
    </div>
  );
}

function DocumentsPanel({ id, rows, canMutate, onSaved }: { id: string; rows: { id: string; label: string; url: string }[]; canMutate: boolean; onSaved: () => void }) {
  return (
    <div>
      {canMutate ? (
        <Field className="mb-4 max-w-sm">
          <FieldLabel htmlFor="student-document">Upload document</FieldLabel>
          <Input
            id="student-document"
            type="file"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              await api.uploadStudentDocument(id, { kind: file.name, label: file.name, dataUrl: await fileToDataUrl(file) });
              onSaved();
            }}
          />
        </Field>
      ) : null}
      {!rows?.length ? <EmptyState title="No documents" description="Upload birth certificates, CNIC copies, and photos here." /> : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="flex justify-between rounded-2xl bg-paper px-4 py-3">
              <span>{row.label}</span>
              {row.url ? <a href={mediaUrl(row.url) || row.url} className="text-sm text-primary" target="_blank" rel="noreferrer">Open</a> : <span className="text-sm text-muted-foreground">Pending</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotesList({ rows }: { rows: { id: string; type: string; subject: string; body: string; createdAt: string }[] }) {
  if (!rows?.length) return <EmptyState title="No notes yet" description="Log a meeting or internal note. WhatsApp stays on the parent’s phone." />;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-2xl bg-paper px-4 py-3">
          <p className="text-sm text-muted-foreground">{row.type} · {String(row.createdAt).slice(0, 10)}</p>
          <p className="font-medium">{row.subject || row.body}</p>
        </li>
      ))}
    </ul>
  );
}

function ActivityList({ rows }: { rows: { id: string; action: string; summary: string; createdAt: string; actor?: { name: string } | null }[] }) {
  if (!rows?.length) return <EmptyState title="No activity yet" description="Admissions, promotions, and profile edits appear here." />;
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.id} className="rounded-2xl bg-paper px-4 py-3">
          <p className="font-medium">{row.action.replaceAll("_", " ")}</p>
          <p className="text-sm text-muted-foreground">{row.summary} · {row.actor?.name ?? "System"} · {String(row.createdAt).slice(0, 16).replace("T", " ")}</p>
        </li>
      ))}
    </ul>
  );
}

function Avatar({ name, photo }: { name: string; photo?: string }) {
  const src = mediaUrl(photo);
  if (src) return <img src={src} alt="" className="h-24 w-24 rounded-full object-cover" />;
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <span className="flex h-24 w-24 items-center justify-center rounded-full bg-indigo text-2xl text-white">{initials || "S"}</span>;
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const intl = digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}
