import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EXAM_KIND_LABELS } from "@wellrun/shared";
import { Badge, Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { CalendarCog, CircleAlert, ClipboardPen, Copy, Pencil, Plus, Printer, Trash2, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ExamStatusBadge, MarkingProgress, PaperStatusBadge, dateRange, formatDayShort, isExamAdmin } from "@/components/exams/exam-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { examKeys, examsApi, type ExamContext, type ExamDetail, type ExamPaperRow } from "@/lib/exams-api";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "schedule", label: "Date sheet" },
  { id: "papers", label: "Papers & marking" },
];

export function ExamDetailPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") ?? "overview";
  const admin = isExamAdmin();
  const { data: exam, isPending, isError, refetch } = useQuery({ queryKey: examKeys.detail(id), queryFn: () => examsApi.detail(id), enabled: Boolean(id) });
  const [toast, setToast] = useState<string | null>(params.get("created") ? "Exam created." : null);

  if (isPending) return <LoadingState variant="profile" />;
  if (isError || !exam) return <ErrorState title="Couldn't load this exam" description="It may have been deleted, or you don't have access." onRetry={() => void refetch()} />;

  const approved = exam.papers.filter((p) => p.status === "APPROVED").length;
  const submitted = exam.papers.filter((p) => p.status === "SUBMITTED").length;

  return (
    <div className="flex flex-col gap-6">
      <Link to={exam.kind === "EXAM" ? "/exams/list" : "/exams/assessments/quizzes"} className="text-sm text-indigo print:hidden">
        {exam.kind === "EXAM" ? "All exams" : "Assessments"}
      </Link>
      <PageHeader
        title={exam.name}
        description={[EXAM_KIND_LABELS[exam.kind], exam.term?.name, dateRange(exam.startsOn, exam.endsOn)].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <ExamStatusBadge status={exam.status} />
            {approved ? (
              <Button variant="outline" icon={<Trophy />} render={<Link to={`/exams/results/class?scope=EXAM:${exam.id}`} />}>
                Results
              </Button>
            ) : null}
          </div>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(next) => {
          const p = new URLSearchParams(params);
          p.set("tab", String(next));
          p.delete("created");
          setParams(p, { replace: true });
        }}
        className="print:hidden"
      >
        <TabsList variant="line" className="h-auto w-full flex-wrap justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === "schedule" ? (
        <DateSheet exam={exam} admin={admin} onToast={setToast} />
      ) : tab === "papers" ? (
        <PapersTab exam={exam} />
      ) : (
        <Overview exam={exam} admin={admin} approved={approved} submitted={submitted} onToast={setToast} />
      )}
      <Toast message={toast} />
    </div>
  );
}

function Overview({ exam, admin, approved, submitted, onToast }: { exam: ExamDetail; admin: boolean; approved: number; submitted: number; onToast: (m: string) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"edit" | "duplicate" | "delete" | "add" | null>(null);
  const classes = [...new Set(exam.papers.map((p) => p.className))];
  const subjects = [...new Set(exam.papers.map((p) => p.subjectName))];
  const remove = useMutation({
    mutationFn: () => examsApi.remove(exam.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      navigate(exam.kind === "EXAM" ? "/exams/list" : "/exams");
    },
    onError: (err) => onToast(err instanceof Error ? err.message : "Couldn't delete"),
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
      <section className="rounded-3xl bg-surface p-5">
        <h2 className="font-display text-xl">Marking progress</h2>
        <div className="mt-3">
          <MarkingProgress approved={approved} submitted={submitted} total={exam.papers.length} />
        </div>
        {exam.clashes.length ? (
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-orange/10 p-3 text-sm text-orange">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            {exam.clashes.length} timing {exam.clashes.length === 1 ? "clash" : "clashes"} in the date sheet — see Date sheet.
          </p>
        ) : null}
        <dl className="mt-5 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Classes</dt>
          <dd>{classes.join(", ") || "—"}</dd>
          <dt className="text-muted-foreground">Subjects</dt>
          <dd>{subjects.join(", ") || "—"}</dd>
          <dt className="text-muted-foreground">Papers</dt>
          <dd>{exam.papers.length}</dd>
          <dt className="text-muted-foreground">Weight in term</dt>
          <dd>{exam.weight}</dd>
          <dt className="text-muted-foreground">Grading</dt>
          <dd>{exam.gradingScale?.name ?? "School default"}</dd>
          <dt className="text-muted-foreground">Report cards</dt>
          <dd>{exam.includeInReportCard ? "Counted" : "Not counted"}</dd>
          {exam.instructions ? (
            <>
              <dt className="text-muted-foreground">Instructions</dt>
              <dd className="whitespace-pre-line">{exam.instructions}</dd>
            </>
          ) : null}
        </dl>
      </section>
      <section className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
        <h2 className="font-display text-xl">Next steps</h2>
        <Button variant="outline" icon={<ClipboardPen />} render={<Link to={`/exams/${exam.id}?tab=papers`} />}>
          Enter or check marks
        </Button>
        {admin && submitted ? (
          <Button variant="outline" render={<Link to={`/exams/marks/pending?examId=${exam.id}`} />}>
            Verify {submitted} submitted {submitted === 1 ? "paper" : "papers"}
          </Button>
        ) : null}
        {approved ? (
          <Button variant="outline" icon={<Trophy />} render={<Link to={`/exams/results/class?scope=EXAM:${exam.id}`} />}>
            Results & publishing
          </Button>
        ) : null}
        {admin ? (
          <>
            <hr className="border-line" />
            <Button variant="ghost" icon={<Pencil />} onClick={() => setDialog("edit")}>
              Edit details
            </Button>
            {exam.kind === "EXAM" ? (
              <>
                <Button variant="ghost" icon={<Plus />} onClick={() => setDialog("add")}>
                  Add a class or subject
                </Button>
                <Button variant="ghost" icon={<Copy />} onClick={() => setDialog("duplicate")}>
                  Duplicate (e.g. for Final Term)
                </Button>
              </>
            ) : null}
            <Button variant="destructive" icon={<Trash2 />} onClick={() => setDialog("delete")}>
              Delete
            </Button>
          </>
        ) : null}
      </section>
      <EditSheet exam={exam} open={dialog === "edit"} onClose={() => setDialog(null)} onSaved={() => onToast("Exam updated.")} />
      <AddPaperSheet exam={exam} open={dialog === "add"} onClose={() => setDialog(null)} onSaved={() => onToast("Paper added.")} />
      <DuplicateDialog exam={exam} open={dialog === "duplicate"} onClose={() => setDialog(null)} />
      <Dialog
        open={dialog === "delete"}
        title={`Delete ${exam.name}?`}
        description="All its papers and draft marks are removed. Exams with approved marks can't be deleted."
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function EditSheet({ exam, open, onClose, onSaved }: { exam: ExamDetail; open: boolean; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const ctx = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context, enabled: open });
  const [form, setForm] = useState({ name: exam.name, termId: exam.term?.id ?? "", startsOn: exam.startsOn, endsOn: exam.endsOn, weight: String(exam.weight), includeInReportCard: exam.includeInReportCard, instructions: exam.instructions });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => examsApi.update(exam.id, { ...form, termId: form.termId || null, weight: Number(form.weight) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      onSaved();
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save"),
  });
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <form
          className="flex h-full flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <SheetHeader>
            <SheetTitle>Edit {exam.name}</SheetTitle>
          </SheetHeader>
          <FieldGroup className="flex-1 px-4">
            <Field>
              <FieldLabel htmlFor="edit-name">Name</FieldLabel>
              <Input id="edit-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-term">Term</FieldLabel>
              <FormSelect
                id="edit-term"
                value={form.termId || "none"}
                onValueChange={(v) => setForm({ ...form, termId: v === "none" ? "" : (v ?? "") })}
                options={[{ value: "none", label: "No term" }, ...(ctx.data?.terms ?? []).map((t) => ({ value: t.id, label: t.name }))]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-start">Starts</FieldLabel>
              <DatePicker id="edit-start" value={form.startsOn} onChange={(v) => setForm({ ...form, startsOn: v })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-end">Ends</FieldLabel>
              <DatePicker id="edit-end" value={form.endsOn} onChange={(v) => setForm({ ...form, endsOn: v })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="edit-weight">Weight in term result</FieldLabel>
              <Input id="edit-weight" type="number" min={0} max={100} value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="max-w-32" />
            </Field>
            <div className="flex items-start justify-between gap-4">
              <FieldLabel htmlFor="edit-report">Count in report cards</FieldLabel>
              <Switch id="edit-report" checked={form.includeInReportCard} onCheckedChange={(checked) => setForm({ ...form, includeInReportCard: checked })} />
            </div>
            <Field>
              <FieldLabel htmlFor="edit-instructions">Instructions</FieldLabel>
              <Input id="edit-instructions" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
            </Field>
            {error ? <FieldError>{error}</FieldError> : null}
          </FieldGroup>
          <SheetFooter>
            <Button type="submit" loading={save.isPending}>
              Save changes
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function AddPaperSheet({ exam, open, onClose, onSaved }: { exam: ExamDetail; open: boolean; onClose: () => void; onSaved: () => void }) {
  const queryClient = useQueryClient();
  const ctx = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context, enabled: open });
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [maxMarks, setMaxMarks] = useState(String(exam.papers[0]?.maxMarks ?? 100));
  const [passMarks, setPassMarks] = useState(String(exam.papers[0]?.passMarks ?? 33));
  const [error, setError] = useState<string | null>(null);
  const existing = new Set(exam.papers.map((p) => `${p.classId}:${p.subjectId}`));
  const cls = ctx.data?.classes.find((c) => c.id === classId);
  const subjects = (ctx.data?.subjects ?? []).filter((s) => cls?.subjectIds.includes(s.id) && !existing.has(`${classId}:${s.id}`));
  const add = useMutation({
    mutationFn: () => examsApi.addPapers(exam.id, { papers: [{ classId, subjectId, maxMarks: Number(maxMarks), passMarks: Number(passMarks) }] }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: examKeys.detail(exam.id) });
      onSaved();
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't add"),
  });
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add a paper</SheetTitle>
          <SheetDescription>Add a class or subject that was missed when the exam was created.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="flex-1 px-4">
          <Field>
            <FieldLabel htmlFor="add-class">Class</FieldLabel>
            <FormSelect id="add-class" value={classId || null} onValueChange={(v) => { setClassId(v ?? ""); setSubjectId(""); }} options={(ctx.data?.classes ?? []).map((c) => ({ value: c.id, label: c.label }))} placeholder="Pick a class" />
          </Field>
          <Field>
            <FieldLabel htmlFor="add-subject">Subject</FieldLabel>
            <FormSelect id="add-subject" value={subjectId || null} onValueChange={(v) => setSubjectId(v ?? "")} options={subjects.map((s) => ({ value: s.id, label: s.name }))} placeholder={classId ? (subjects.length ? "Pick a subject" : "All subjects already added") : "Pick a class first"} disabled={!classId} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel htmlFor="add-max">Max marks</FieldLabel>
              <Input id="add-max" type="number" min={1} value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="add-pass">Pass marks</FieldLabel>
              <Input id="add-pass" type="number" min={0} value={passMarks} onChange={(e) => setPassMarks(e.target.value)} />
            </Field>
          </div>
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <SheetFooter>
          <Button type="button" disabled={!classId || !subjectId} loading={add.isPending} onClick={() => add.mutate()}>
            Add paper
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function DuplicateDialog({ exam, open, onClose }: { exam: ExamDetail; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState(exam.name.replace(/mid ?term/i, "Final Term"));
  const [startsOn, setStartsOn] = useState(exam.startsOn);
  const [error, setError] = useState<string | null>(null);
  const dup = useMutation({
    mutationFn: () => examsApi.duplicate(exam.id, { name, startsOn, endsOn: startsOn, termId: null }),
    onSuccess: async (copy) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      onClose();
      navigate(`/exams/${copy.id}?tab=overview`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't duplicate"),
  });
  return (
    <Dialog open={open} title="Duplicate exam" description="Copies classes, subjects and marks setup into a new draft. Set its term and date sheet next." confirmLabel="Duplicate" loading={dup.isPending} onClose={onClose} onConfirm={() => dup.mutate()}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="dup-name">New exam name</FieldLabel>
          <Input id="dup-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="dup-start">Starts</FieldLabel>
          <DatePicker id="dup-start" value={startsOn} onChange={setStartsOn} />
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
    </Dialog>
  );
}

function DateSheet({ exam, admin, onToast }: { exam: ExamDetail; admin: boolean; onToast: (m: string) => void }) {
  const queryClient = useQueryClient();
  const ctx = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context, enabled: admin });
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenStart, setRegenStart] = useState(exam.startsOn);
  const clashIds = new Set(exam.clashes.flatMap((c) => c.paperIds));
  const rows = useMemo(
    () => [...exam.papers].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.startTime.localeCompare(b.startTime) || a.className.localeCompare(b.className, undefined, { numeric: true })),
    [exam.papers],
  );
  const regen = useMutation({
    mutationFn: () => examsApi.schedule(exam.id, { startsOn: regenStart, skipWeekdays: [0], holidays: [], papersPerDay: 1, startTime: rows[0]?.startTime || "09:00", endTime: rows[0]?.endTime || "12:00" }),
    onSuccess: async (out) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      setRegenOpen(false);
      onToast(`Date sheet rebuilt: ${out.scheduled} papers.`);
    },
  });

  if (!rows.length) return <EmptyState title="No papers" description="Add classes and subjects to this exam first." />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted-foreground">{admin ? "Change any date, time, room or invigilator — it saves as you go." : "Your papers for this exam."}</p>
        <div className="flex gap-2">
          {admin ? (
            <Button variant="outline" icon={<CalendarCog />} onClick={() => setRegenOpen(true)}>
              Rebuild date sheet
            </Button>
          ) : null}
          <Button variant="outline" icon={<Printer />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>
      {exam.clashes.length ? (
        <ul className="flex flex-col gap-1 rounded-2xl bg-orange/10 p-3 text-sm text-orange print:hidden">
          {exam.clashes.map((c) => (
            <li key={c.paperIds.join()} className="flex items-start gap-2">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {c.message}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="hidden print:block">
        <h1 className="font-display text-2xl">{exam.name} — Date sheet</h1>
      </div>
      <div className="overflow-x-auto rounded-3xl bg-surface p-2">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-3 font-medium">Date</th>
              <th scope="col" className="px-3 py-3 font-medium">Time</th>
              <th scope="col" className="px-3 py-3 font-medium">Class</th>
              <th scope="col" className="px-3 py-3 font-medium">Subject</th>
              <th scope="col" className="px-3 py-3 font-medium">Room</th>
              <th scope="col" className="px-3 py-3 font-medium">Invigilator</th>
              <th scope="col" className="px-3 py-3 font-medium">Marks</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((paper) =>
              admin ? (
                <EditablePaperRow key={paper.id} paper={paper} examId={exam.id} staff={ctx.data?.staff ?? []} clash={clashIds.has(paper.id)} onError={onToast} />
              ) : (
                <tr key={paper.id} className="border-t border-line">
                  <td className="px-3 py-2 tabular-nums">{formatDayShort(paper.date)}</td>
                  <td className="px-3 py-2 tabular-nums">{paper.startTime ? `${paper.startTime}–${paper.endTime}` : "—"}</td>
                  <td className="px-3 py-2">{paper.className}</td>
                  <td className="px-3 py-2">{paper.subjectName}</td>
                  <td className="px-3 py-2">{paper.room || "—"}</td>
                  <td className="px-3 py-2">{paper.invigilatorName || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{paper.maxMarks}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <Dialog open={regenOpen} title="Rebuild the date sheet?" description="Every paper gets a new date from the start day, one subject a day, Sundays off. Manual changes are replaced." confirmLabel="Rebuild" loading={regen.isPending} onClose={() => setRegenOpen(false)} onConfirm={() => regen.mutate()}>
        <Field>
          <FieldLabel htmlFor="regen-start">First exam day</FieldLabel>
          <DatePicker id="regen-start" value={regenStart} onChange={setRegenStart} />
        </Field>
      </Dialog>
    </div>
  );
}

function EditablePaperRow({ paper, examId, staff, clash, onError }: { paper: ExamPaperRow; examId: string; staff: ExamContext["staff"]; clash: boolean; onError: (m: string) => void }) {
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) => examsApi.updatePaper(paper.id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: examKeys.detail(examId) }),
    onError: (err) => onError(err instanceof Error ? err.message : "Couldn't save"),
  });
  const label = `${paper.className} ${paper.subjectName}`;
  return (
    <tr className={`border-t border-line ${clash ? "bg-orange/5" : ""}`}>
      <td className="px-2 py-1.5 print:hidden">
        <DatePicker id={`date-${paper.id}`} value={paper.date ?? ""} onChange={(date) => save.mutate({ date: date || null })} placeholder="Set date" />
      </td>
      <td className="px-2 py-1.5 print:hidden">
        <div className="flex items-center gap-1">
          <Input aria-label={`${label} start time`} type="time" defaultValue={paper.startTime} className="w-28" onBlur={(e) => e.target.value !== paper.startTime && save.mutate({ startTime: e.target.value })} />
          <span aria-hidden>–</span>
          <Input aria-label={`${label} end time`} type="time" defaultValue={paper.endTime} className="w-28" onBlur={(e) => e.target.value !== paper.endTime && save.mutate({ endTime: e.target.value })} />
        </div>
      </td>
      <td className="hidden px-3 py-2 tabular-nums print:table-cell">{formatDayShort(paper.date)}</td>
      <td className="hidden px-3 py-2 tabular-nums print:table-cell">{paper.startTime ? `${paper.startTime}–${paper.endTime}` : "—"}</td>
      <td className="px-3 py-2">{paper.className}</td>
      <td className="px-3 py-2">{paper.subjectName}</td>
      <td className="px-2 py-1.5">
        <Input aria-label={`${label} room`} defaultValue={paper.room} className="w-24 print:hidden" placeholder="Room" onBlur={(e) => e.target.value !== paper.room && save.mutate({ room: e.target.value })} />
        <span className="hidden print:inline">{paper.room}</span>
      </td>
      <td className="px-2 py-1.5">
        <div className="w-44 print:hidden">
          <FormSelect
            id={`inv-${paper.id}`}
            value={paper.invigilatorId ?? "none"}
            onValueChange={(v) => save.mutate({ invigilatorId: v === "none" ? null : v })}
            options={[{ value: "none", label: "No invigilator" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
          />
        </div>
        <span className="hidden print:inline">{paper.invigilatorName}</span>
      </td>
      <td className="px-3 py-2 tabular-nums">
        {paper.maxMarks}
        <span className="block text-xs text-muted-foreground">pass {paper.passMarks}</span>
      </td>
    </tr>
  );
}

function PapersTab({ exam }: { exam: ExamDetail }) {
  const admin = isExamAdmin();
  const byClass = useMemo(() => {
    const map = new Map<string, ExamPaperRow[]>();
    exam.papers.forEach((p) => map.set(p.className, [...(map.get(p.className) ?? []), p]));
    return [...map].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [exam.papers]);
  if (!exam.papers.length) return <EmptyState title="No papers" description="Add classes and subjects to this exam first." />;
  return (
    <div className="flex flex-col gap-4">
      {byClass.map(([className, papers]) => (
        <section key={className} className="rounded-3xl bg-surface p-4" aria-label={className}>
          <div className="flex items-center justify-between gap-3 px-2">
            <h2 className="font-display text-lg">{className}</h2>
            <Badge tone="neutral">{papers[0].students} students</Badge>
          </div>
          <ul className="mt-2 divide-y divide-line">
            {papers.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-2.5">
                <div className="min-w-0">
                  <p className="font-medium">{p.subjectName}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {p.marksEntered}/{p.students} entered · out of {p.maxMarks}
                    {p.status === "RETURNED" && p.reviewNote ? ` · “${p.reviewNote}”` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <PaperStatusBadge status={p.status} />
                  {p.canMark || admin ? (
                    <Button size="sm" variant={p.status === "SUBMITTED" && admin ? "default" : "outline"} render={<Link to={`/exams/marks/${p.id}`} />}>
                      {p.status === "SUBMITTED" && admin ? "Verify" : p.status === "APPROVED" ? "View" : p.canMark ? "Enter marks" : "View"}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {!admin ? <FieldDescription>You can enter marks only for subjects you teach.</FieldDescription> : null}
    </div>
  );
}
