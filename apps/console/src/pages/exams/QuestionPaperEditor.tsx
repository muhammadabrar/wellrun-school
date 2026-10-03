import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { CheckCircle2, CircleAlert, LockOpen, Plus, Printer, Send, Trash2, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { dateRange, formatDayShort, isExamAdmin } from "@/components/exams/exam-ui";
import { Toast } from "@/components/motion";
import { SectionCard, SectionSheet } from "@/components/question-papers/builder";
import { QuestionPaperStatusBadge } from "@/components/question-papers/status";
import { PaperSheet } from "@/components/question-papers/paper-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { questionPaperKeys, questionPapersApi, type PaperSectionRow, type QuestionPaperDetail } from "@/lib/question-papers-api";

export function QuestionPaperEditorPage() {
  const { id = "" } = useParams();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: questionPaperKeys.detail(id), queryFn: () => questionPapersApi.detail(id), enabled: Boolean(id) });
  if (isPending) return <LoadingState variant="profile" />;
  if (isError || !data) return <ErrorState title="Couldn't open this question paper" description="It may have been deleted, or it isn't one of your subjects." onRetry={() => void refetch()} />;
  return <Editor paper={data} />;
}

function Editor({ paper }: { paper: QuestionPaperDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const admin = isExamAdmin();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "preview" ? "preview" : "build";
  const { permissions } = paper;
  const canEdit = permissions.canEdit;
  // Bank questions already in this paper, so the picker doesn't offer them twice.
  const usedBankIds = new Set(paper.sections.flatMap((s) => s.questions.flatMap((q) => (q.bankQuestionId ? [q.bankQuestionId] : []))));
  const [toast, setToast] = useState<string | null>(null);
  const [sectionSheet, setSectionSheet] = useState<PaperSectionRow | "new" | null>(null);
  const [dialog, setDialog] = useState<"return" | "reopen" | "delete" | null>(null);
  const [note, setNote] = useState("");
  const [showKey, setShowKey] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: questionPaperKeys.root });
  const act = useMutation({
    mutationFn: async (input: { run: () => Promise<unknown>; done?: string }) => {
      await input.run();
      return input.done;
    },
    onSuccess: async (done) => {
      await refresh();
      if (done) setToast(done);
    },
    onError: (err) => setToast(err instanceof Error ? err.message : "Couldn't save that change"),
  });
  const run = (fn: () => Promise<unknown>, done?: string) => act.mutate({ run: fn, done });

  const flow = useMutation({
    mutationFn: async (input: { fn: () => Promise<unknown>; done: string; leave?: string }) => {
      await input.fn();
      return input;
    },
    onSuccess: async (input) => {
      await refresh();
      setDialog(null);
      setNote("");
      if (input.leave) navigate(input.leave);
      else setToast(input.done);
    },
    onError: (err) => {
      setDialog(null);
      setToast(err instanceof Error ? err.message : "Couldn't update the paper");
    },
  });

  const sectionIds = paper.sections.map((s) => s.id);
  const moveSection = (index: number, delta: number) => {
    const next = [...sectionIds];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    run(() => questionPapersApi.reorderSections(paper.id, next));
  };
  const letter = String.fromCharCode(65 + paper.sections.length);
  const expected = paper.expectedMarks;
  const over = expected != null && paper.totalMarks > expected;
  const percent = expected ? Math.min(100, Math.round((paper.totalMarks / expected) * 100)) : 0;
  const ready = paper.issues.length === 0;
  const subjectLabel = `${paper.gradeName} · ${paper.subject.name}`;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/exams/question-papers" className="text-sm text-indigo print:hidden">
        Question papers
      </Link>
      <PageHeader
        title={subjectLabel}
        description={`${paper.exam.name} · ${dateRange(paper.exam.startsOn, paper.exam.endsOn)}${paper.createdBy ? ` · by ${paper.createdBy}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <QuestionPaperStatusBadge status={paper.status} />
            {permissions.canSubmit ? (
              <Button icon={<Send />} disabled={!ready} loading={flow.isPending} title={ready ? undefined : "Fix the issues listed below first"} onClick={() => flow.mutate({ fn: () => questionPapersApi.submit(paper.id), done: "Submitted — an admin will review it." })}>
                Submit for approval
              </Button>
            ) : null}
            {permissions.canReview ? (
              <>
                <Button variant="outline" icon={<Undo2 />} onClick={() => setDialog("return")}>
                  Return
                </Button>
                <Button icon={<CheckCircle2 />} disabled={!ready} loading={flow.isPending} onClick={() => flow.mutate({ fn: () => questionPapersApi.review(paper.id, { action: "APPROVE" }), done: "Approved — you can print it now." })}>
                  Approve
                </Button>
              </>
            ) : null}
            {permissions.canPrint ? (
              <Button icon={<Printer />} render={<Link to={`/exams/question-papers/${paper.id}/print`} />}>
                Print copies
              </Button>
            ) : null}
            {permissions.canReopen ? (
              <Button variant="outline" icon={<LockOpen />} onClick={() => setDialog("reopen")}>
                Reopen
              </Button>
            ) : null}
          </div>
        }
      />

      {paper.status === "RETURNED" && paper.reviewNote ? (
        <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger" role="status">
          Returned{paper.reviewedBy ? ` by ${paper.reviewedBy}` : ""}: “{paper.reviewNote}” — fix it and submit again.
        </p>
      ) : null}
      {permissions.readOnlyReason ? (
        <p className="rounded-2xl bg-paper p-3 text-sm text-muted-foreground" role="status">
          {permissions.readOnlyReason}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <section className="rounded-3xl bg-surface p-5" aria-labelledby="marks-tracker">
          <h2 id="marks-tracker" className="font-display text-xl">
            Marks
          </h2>
          <p className="mt-2 flex items-baseline gap-2">
            <span className={`font-display text-4xl tabular-nums ${over ? "text-danger" : ""}`}>{paper.totalMarks}</span>
            <span className="text-muted-foreground">{expected != null ? `of ${expected} marks for this exam` : "marks (the exam's sections disagree on max marks)"}</span>
          </p>
          {expected != null ? (
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={expected} aria-valuenow={Math.min(paper.totalMarks, expected)} aria-label="Marks so far">
              <div className={`h-full ${paper.totalMarks === expected ? "bg-success" : over ? "bg-danger" : "bg-indigo"}`} style={{ width: `${percent}%` }} />
            </div>
          ) : null}
          {paper.issues.length ? (
            <ul className="mt-4 flex flex-col gap-1.5 text-sm" aria-label="Things to fix before submitting">
              {paper.issues.slice(0, 8).map((issue, i) => (
                <li key={i} className="flex items-start gap-2 text-orange">
                  <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {issue.message}
                </li>
              ))}
              {paper.issues.length > 8 ? <li className="text-xs text-muted-foreground">+{paper.issues.length - 8} more</li> : null}
            </ul>
          ) : paper.sections.length ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-success">
              <CheckCircle2 className="size-4" aria-hidden /> Ready: the paper adds up and every question is complete.
            </p>
          ) : null}
        </section>

        <aside className="rounded-3xl bg-surface p-5" aria-labelledby="sat-by">
          <h2 id="sat-by" className="font-display text-xl">
            Sat by
          </h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {paper.slots.map((s) => (
              <li key={s.paperId} className="rounded-2xl bg-paper px-3 py-2">
                <span className="font-medium">{s.label}</span>
                <span className="block text-xs text-muted-foreground tabular-nums">
                  {[formatDayShort(s.date), s.startTime && `${s.startTime}–${s.endTime}`, s.room, `${s.students} students`].filter((v) => v && v !== "—").join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          {paper.syllabus.length ? (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium">Syllabus covered ({paper.syllabus.length})</summary>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                {paper.syllabus.map((t, i) => (
                  <li key={i}>
                    {t.title} <span className="text-xs">· {t.unit}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">No syllabus topics are attached to this exam paper yet.</p>
          )}
        </aside>
      </div>

      <Tabs value={tab} onValueChange={(next) => setParams(next === "preview" ? { tab: "preview" } : {}, { replace: true })}>
        <TabsList variant="line" className="h-auto w-full justify-start">
          <TabsTrigger value="build">Build</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "preview" ? (
        <div className="flex flex-col gap-4">
          {admin || paper.permissions.canEdit || paper.status !== "DRAFT" ? (
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface p-3 print:hidden">
              <div>
                <label htmlFor="show-key" className="text-sm font-medium">
                  Show answer key
                </label>
                <FieldDescription>Correct options and model answers, as printed on the teacher's copy.</FieldDescription>
              </div>
              <Switch id="show-key" checked={showKey} onCheckedChange={setShowKey} />
            </div>
          ) : null}
          <div className="mx-auto w-full max-w-[210mm] rounded-xl shadow-[0_12px_40px_rgba(22,22,29,0.12)]">
            <PaperSheet paper={paper} slot={paper.slots[0]} options={{ answerLines: true, studentLines: true, answerKey: showKey }} />
          </div>
        </div>
      ) : (
        <>
          {canEdit ? <PaperDetailsCard paper={paper} onSaved={() => { void refresh(); setToast("Paper details saved."); }} onError={setToast} /> : null}
          <section className="flex flex-col gap-4" aria-label="Sections">
            {paper.sections.map((section, index) => (
              <SectionCard key={section.id} section={section} index={index} total={paper.sections.length} canEdit={canEdit} busy={act.isPending} run={run} onMove={(delta) => moveSection(index, delta)} onEditSection={() => setSectionSheet(section)} paperRef={{ gradeName: paper.gradeName, subjectId: paper.subject.id, subjectName: paper.subject.name }} usedBankIds={usedBankIds} />
            ))}
            {!paper.sections.length ? (
              <div className="rounded-3xl bg-surface px-6 py-12 text-center">
                <h2 className="font-display text-xl">Start building the paper</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Add sections — multiple choice, true/false, short and long questions, translation, story writing and more — then add questions to each.</p>
                {canEdit ? (
                  <div className="mt-5 flex justify-center">
                    <Button icon={<Plus />} onClick={() => setSectionSheet("new")}>
                      Add the first section
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
            {canEdit && paper.sections.length ? (
              <Button variant="outline" icon={<Plus />} className="self-start" onClick={() => setSectionSheet("new")}>
                Add section
              </Button>
            ) : null}
          </section>
        </>
      )}

      {admin && paper.prints && paper.prints.total > 0 ? (
        <section className="rounded-3xl bg-surface p-5" aria-labelledby="print-history">
          <h2 id="print-history" className="font-display text-xl">
            Print history
          </h2>
          <p className="text-sm text-muted-foreground">{paper.prints.total} copies printed in total.</p>
          <ul className="mt-2 divide-y divide-line text-sm">
            {paper.prints.recent.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {p.classLabel} × {p.copies}
                  {p.answerKey ? " (answer key)" : ""}
                </span>
                <span className="text-muted-foreground tabular-nums">{new Date(p.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {permissions.canDelete ? (
        <div className="flex justify-end">
          <Button variant="ghost" icon={<Trash2 />} onClick={() => setDialog("delete")}>
            Delete this paper
          </Button>
        </div>
      ) : null}

      <SectionSheet open={Boolean(sectionSheet)} section={sectionSheet} nextLetter={letter} paperId={paper.id} onClose={() => setSectionSheet(null)} run={run} />
      <Dialog
        open={dialog === "return"}
        title="Return to the teacher"
        description="They'll see your note, fix the paper and submit it again."
        confirmLabel="Return"
        loading={flow.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => note.trim() && flow.mutate({ fn: () => questionPapersApi.review(paper.id, { action: "RETURN", note: note.trim() }), done: "Returned to the teacher." })}
      >
        <Field>
          <FieldLabel htmlFor="return-note">What needs changing?</FieldLabel>
          <Textarea id="return-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Dialog>
      <Dialog
        open={dialog === "reopen"}
        title="Reopen the approved paper?"
        description="It goes back to the teacher for changes and must be approved again. Copies already printed are not affected. This is logged."
        confirmLabel="Reopen"
        loading={flow.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => note.trim().length >= 5 && flow.mutate({ fn: () => questionPapersApi.reopen(paper.id, note.trim()), done: "Reopened for editing." })}
      >
        <Field>
          <FieldLabel htmlFor="reopen-note">Reason (at least 5 characters)</FieldLabel>
          <Input id="reopen-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Dialog>
      <Dialog
        open={dialog === "delete"}
        title="Delete this question paper?"
        description="All its sections and questions are removed. This can't be undone."
        confirmLabel="Delete"
        danger
        loading={flow.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => flow.mutate({ fn: () => questionPapersApi.remove(paper.id), done: "Deleted.", leave: "/exams/question-papers" })}
      />
      <Toast message={toast} />
    </div>
  );
}

function PaperDetailsCard({ paper, onSaved, onError }: { paper: QuestionPaperDetail; onSaved: () => void; onError: (message: string) => void }) {
  const [form, setForm] = useState({ title: paper.title, instructions: paper.instructions, durationMinutes: String(paper.durationMinutes) });
  const dirty = form.title !== paper.title || form.instructions !== paper.instructions || Number(form.durationMinutes) !== paper.durationMinutes;
  const save = useMutation({
    mutationFn: () => questionPapersApi.update(paper.id, { title: form.title, instructions: form.instructions, durationMinutes: Number(form.durationMinutes) || 60 }),
    onSuccess: onSaved,
    onError: (err) => onError(err instanceof Error ? err.message : "Couldn't save"),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paper details</CardTitle>
        <CardDescription>The title and instructions appear at the top of every printed copy.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[1fr_10rem]">
        <Field>
          <FieldLabel htmlFor="qp-title">Title</FieldLabel>
          <Input id="qp-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="qp-duration">Time allowed (minutes)</FieldLabel>
          <Input id="qp-duration" type="number" min={5} max={600} value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
        </Field>
        <Field className="md:col-span-2">
          <FieldLabel htmlFor="qp-instr">General instructions</FieldLabel>
          <Textarea id="qp-instr" rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} placeholder="e.g. Attempt all sections. Use a blue or black pen only." />
        </Field>
        {dirty ? (
          <div className="md:col-span-2">
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save details
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
