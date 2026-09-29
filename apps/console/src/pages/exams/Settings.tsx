import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DEFAULT_GRADE_BANDS, REPORT_CARD_LAYOUTS } from "@wellrun/shared";
import { Badge, Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { dateRange, isExamAdmin } from "@/components/exams/exam-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { examKeys, examsApi, type ExamRules, type GradeBand, type GradingScale, type ReportTemplate, type Term } from "@/lib/exams-api";

function ReadOnlyNote() {
  return isExamAdmin() ? null : <p className="text-sm text-muted-foreground">Only school admins can change exam settings.</p>;
}

// Terms -----------------------------------------------------------------------

export function ExamTermsPage() {
  const queryClient = useQueryClient();
  const admin = isExamAdmin();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: examKeys.terms(), queryFn: examsApi.terms });
  const context = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context });
  const [editing, setEditing] = useState<Term | "new" | null>(null);
  const [deleting, setDeleting] = useState<Term | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => examsApi.deleteTerm(id),
    onSuccess: async () => {
      setDeleting(null);
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      setToast("Term deleted.");
    },
    onError: (err) => {
      setDeleting(null);
      setToast(err instanceof Error ? err.message : "Couldn't delete");
    },
  });
  const totalWeight = (data ?? []).reduce((s, t) => s + t.weight, 0);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Terms"
        description={`Split ${context.data?.year?.name ?? "the academic year"} into terms. Each exam belongs to a term; term results combine them and the annual result combines terms by weight.`}
        actions={
          admin ? (
            <Button icon={<Plus />} onClick={() => setEditing("new")}>
              Add term
            </Button>
          ) : null
        }
      />
      <ReadOnlyNote />
      {isPending ? (
        <LoadingState variant="list" />
      ) : isError ? (
        <ErrorState title="Couldn't load terms" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState
          title="No terms yet"
          description="Most schools use two terms (weights 40 and 60) or three. Without terms, the annual result combines every exam in the year."
          action={admin ? <Button icon={<Plus />} onClick={() => setEditing("new")}>Add term</Button> : undefined}
        />
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {data.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-surface p-4">
                <div>
                  <p className="font-medium">{t.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {dateRange(t.startsOn, t.endsOn)} · weight {t.weight} · {t._count.exams} {t._count.exams === 1 ? "exam" : "exams"}
                  </p>
                </div>
                {admin ? (
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                      <Pencil />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                      <Trash2 />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {totalWeight !== 100 ? (
            <p className="text-sm text-orange">Term weights add up to {totalWeight}. They're used relative to each other, but 100 in total is easiest to read.</p>
          ) : null}
        </>
      )}
      <TermSheet term={editing} yearStart={context.data?.year?.startsOn} onClose={() => setEditing(null)} onSaved={(m) => setToast(m)} />
      <Dialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name}?`}
        description="Terms with exams can't be deleted — move those exams to another term first."
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
      <Toast message={toast} />
    </div>
  );
}

function TermSheet({ term, yearStart, onClose, onSaved }: { term: Term | "new" | null; yearStart?: string; onClose: () => void; onSaved: (m: string) => void }) {
  return (
    <Sheet open={Boolean(term)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {term ? <TermForm key={term === "new" ? "new" : term.id} term={term === "new" ? null : term} yearStart={yearStart} onClose={onClose} onSaved={onSaved} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function TermForm({ term, yearStart, onClose, onSaved }: { term: Term | null; yearStart?: string; onClose: () => void; onSaved: (m: string) => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: term?.name ?? "",
    startsOn: term?.startsOn.slice(0, 10) ?? yearStart?.slice(0, 10) ?? "",
    endsOn: term?.endsOn.slice(0, 10) ?? "",
    weight: String(term?.weight ?? 50),
  });
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => examsApi.saveTerm(term?.id ?? null, { ...form, weight: Number(form.weight), sortOrder: term?.sortOrder ?? 0 }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      onSaved(term ? "Term updated." : "Term added.");
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save"),
  });
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.name.trim() || !form.startsOn || !form.endsOn) return setError("Fill in the name and both dates");
        save.mutate();
      }}
    >
      <SheetHeader>
        <SheetTitle>{term ? `Edit ${term.name}` : "Add term"}</SheetTitle>
      </SheetHeader>
      <FieldGroup className="flex-1 px-4">
        <Field>
          <FieldLabel htmlFor="term-name">Name</FieldLabel>
          <Input id="term-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Term 1" />
        </Field>
        <Field>
          <FieldLabel htmlFor="term-start">Starts</FieldLabel>
          <DatePicker id="term-start" value={form.startsOn} onChange={(v) => setForm({ ...form, startsOn: v })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="term-end">Ends</FieldLabel>
          <DatePicker id="term-end" value={form.endsOn} onChange={(v) => setForm({ ...form, endsOn: v })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="term-weight">Weight in annual result</FieldLabel>
          <Input id="term-weight" type="number" min={0} max={100} value={form.weight} onChange={(e) => setForm({ ...form, weight: e.target.value })} className="max-w-32" />
          <FieldDescription>E.g. Term 1 = 40, Term 2 = 60.</FieldDescription>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={save.isPending}>
          {term ? "Save term" : "Add term"}
        </Button>
      </SheetFooter>
    </form>
  );
}

// Grading scales ------------------------------------------------------------------

export function GradingScalesPage() {
  const admin = isExamAdmin();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: examKeys.scales, queryFn: examsApi.scales });
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  if (isPending) return <LoadingState variant="form" />;
  if (isError || !data) return <ErrorState title="Couldn't load grading scales" description="Check your connection and try again." onRetry={() => void refetch()} />;
  const selected = selectedId === "new" ? null : (data.find((s) => s.id === selectedId) ?? data[0]);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <PageHeader
        title="Grading systems"
        description="Percentage bands that turn marks into grades. The default scale is used unless an exam picks another."
        actions={
          admin ? (
            <Button icon={<Plus />} variant="outline" onClick={() => setSelectedId("new")}>
              New scale
            </Button>
          ) : null
        }
      />
      <ReadOnlyNote />
      <div className="flex flex-wrap gap-2">
        {data.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={selected?.id === s.id && selectedId !== "new"}
            onClick={() => setSelectedId(s.id)}
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm ${selected?.id === s.id && selectedId !== "new" ? "border-indigo bg-indigo/10" : "border-line hover:bg-muted"}`}
          >
            {s.name}
            {s.isDefault ? <Badge tone="indigo">Default</Badge> : null}
          </button>
        ))}
      </div>
      <ScaleEditor key={selectedId === "new" ? "new" : selected?.id} scale={selected} readOnly={!admin} onSaved={(m, id) => { setToast(m); if (id) setSelectedId(id); }} />
      <Toast message={toast} />
    </div>
  );
}

function ScaleEditor({ scale, readOnly, onSaved }: { scale: GradingScale | null; readOnly: boolean; onSaved: (m: string, id?: string) => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(scale?.name ?? "New scale");
  const [isDefault, setIsDefault] = useState(scale?.isDefault ?? false);
  const [bands, setBands] = useState<GradeBand[]>(scale?.bands ?? DEFAULT_GRADE_BANDS.map((b) => ({ ...b })));
  const [preview, setPreview] = useState("75");
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const sorted = [...bands].sort((a, b) => b.minPct - a.minPct);
  const previewBand = sorted.find((b) => Number(preview) >= b.minPct);
  const save = useMutation({
    mutationFn: () => examsApi.saveScale(scale?.id ?? null, { name, isDefault, bands: bands.map((b) => ({ ...b, minPct: Number(b.minPct), gpa: b.gpa === null || String(b.gpa) === "" ? null : Number(b.gpa) })) }),
    onSuccess: async (out) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.scales });
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      setError(null);
      onSaved("Grading scale saved.", (out as { id?: string })?.id);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save"),
  });
  const remove = useMutation({
    mutationFn: () => examsApi.deleteScale(scale!.id),
    onSuccess: async () => {
      setDeleting(false);
      await queryClient.invalidateQueries({ queryKey: examKeys.scales });
      onSaved("Grading scale deleted.");
    },
    onError: (err) => {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Couldn't delete");
    },
  });
  const setBand = (i: number, patch: Partial<GradeBand>) => setBands((current) => current.map((b, j) => (j === i ? { ...b, ...patch } : b)));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{scale ? scale.name : "New grading scale"}</CardTitle>
        <CardDescription>A student gets the first grade whose minimum they reach. The lowest grade must start at 0%.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="scale-name">Name</FieldLabel>
            <Input id="scale-name" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex items-end justify-between gap-4">
            <div>
              <FieldLabel htmlFor="scale-default">School default</FieldLabel>
              <FieldDescription>Used by exams that don't pick a scale, and by term and annual results.</FieldDescription>
            </div>
            <Switch id="scale-default" checked={isDefault} disabled={readOnly || scale?.isDefault} onCheckedChange={setIsDefault} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-2 font-medium">Grade</th>
                <th scope="col" className="py-2 pr-2 font-medium">From %</th>
                <th scope="col" className="py-2 pr-2 font-medium">GPA</th>
                <th scope="col" className="py-2 pr-2 font-medium">Remark</th>
                <th scope="col" className="py-2 pr-2 font-medium">Fail grade</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="py-1.5 pr-2">
                    <Input aria-label={`Grade ${i + 1} label`} value={b.grade} disabled={readOnly} className="w-20" onChange={(e) => setBand(i, { grade: e.target.value })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input aria-label={`${b.grade} starts at percent`} type="number" min={0} max={100} value={b.minPct} disabled={readOnly} className="w-24" onChange={(e) => setBand(i, { minPct: Number(e.target.value) })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input aria-label={`${b.grade} GPA`} type="number" min={0} step="0.1" value={b.gpa ?? ""} disabled={readOnly} className="w-20" onChange={(e) => setBand(i, { gpa: e.target.value === "" ? null : Number(e.target.value) })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Input aria-label={`${b.grade} remark`} value={b.remark} disabled={readOnly} onChange={(e) => setBand(i, { remark: e.target.value })} />
                  </td>
                  <td className="py-1.5 pr-2">
                    <Checkbox aria-label={`${b.grade} is a failing grade`} checked={b.isFail} disabled={readOnly} onCheckedChange={(checked) => setBand(i, { isFail: Boolean(checked) })} />
                  </td>
                  <td className="py-1.5">
                    {!readOnly ? (
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${b.grade}`} onClick={() => setBands((c) => c.filter((_, j) => j !== i))}>
                        <Trash2 />
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly ? (
          <Button variant="outline" size="sm" icon={<Plus />} className="self-start" onClick={() => setBands((c) => [...c, { grade: "", minPct: 0, gpa: null, remark: "", isFail: false }])}>
            Add grade
          </Button>
        ) : null}
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-paper p-3 text-sm">
          <Label htmlFor="scale-preview">Try a score:</Label>
          <Input id="scale-preview" type="number" min={0} max={100} value={preview} onChange={(e) => setPreview(e.target.value)} className="w-20" />
          <span>
            % → <strong>{previewBand?.grade ?? "—"}</strong> {previewBand?.remark ? `(${previewBand.remark})` : ""}
          </span>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
        {!readOnly ? (
          <div className="flex flex-wrap justify-between gap-2">
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save scale
            </Button>
            {scale && !scale.isDefault ? (
              <Button variant="destructive" icon={<Trash2 />} onClick={() => setDeleting(true)}>
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      <Dialog open={deleting} title="Delete this grading scale?" description="Exams using it fall back to the school default." confirmLabel="Delete" danger loading={remove.isPending} onClose={() => setDeleting(false)} onConfirm={() => remove.mutate()} />
    </Card>
  );
}

function Label(props: React.ComponentProps<"label">) {
  return <label {...props} className="text-sm text-muted-foreground" />;
}

// Result rules & ranking ------------------------------------------------------------

function useRules() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: examKeys.rules, queryFn: examsApi.rules });
  const save = useMutation({
    mutationFn: examsApi.saveRules,
    onSuccess: async (data) => {
      queryClient.setQueryData(examKeys.rules, data);
    },
  });
  return { query, save };
}

function RulesForm({ title, description, children }: { title: string; description: string; children: (rules: ExamRules, set: (patch: Partial<ExamRules>) => void, readOnly: boolean) => React.ReactNode }) {
  const { query, save } = useRules();
  const admin = isExamAdmin();
  const [draft, setDraft] = useState<Partial<ExamRules>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (query.isPending) return <LoadingState variant="form" />;
  if (query.isError || !query.data) return <ErrorState title="Couldn't load settings" description="Check your connection and try again." onRetry={() => void query.refetch()} />;
  const rules = { ...query.data, ...draft };
  const set = (patch: Partial<ExamRules>) => setDraft((d) => ({ ...d, ...patch }));
  return (
    <form
      className="flex max-w-2xl flex-col gap-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage(null);
        try {
          const { overallPassPct, subjectPassRequired, maxFailSubjects, graceMarks, decimals, absentCountsAsZero, assessmentWeight, rankMethod, rankScope, rankOnlyPassed, showRank, atRiskPct } = rules;
          await save.mutateAsync({ overallPassPct: Number(overallPassPct), subjectPassRequired, maxFailSubjects: Number(maxFailSubjects), graceMarks: Number(graceMarks), decimals: Number(decimals), absentCountsAsZero, assessmentWeight: Number(assessmentWeight), rankMethod, rankScope, rankOnlyPassed, showRank, atRiskPct: Number(atRiskPct) });
          setDraft({});
          setMessage({ ok: true, text: "Saved. Recalculate results to apply the new rules to existing results." });
        } catch (err) {
          setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't save" });
        }
      }}
    >
      <PageHeader title={title} description={description} />
      <ReadOnlyNote />
      {children(rules, set, !admin)}
      {message ? (
        <p className={message.ok ? "text-sm text-success" : "text-sm text-danger"} role="status">
          {message.text}
        </p>
      ) : null}
      {admin ? (
        <Button type="submit" className="self-start" loading={save.isPending}>
          Save settings
        </Button>
      ) : null}
    </form>
  );
}

function ToggleRow({ id, label, help, checked, disabled, onChange }: { id: string; label: string; help: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{help}</FieldDescription>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

export function ResultRulesPage() {
  return (
    <RulesForm title="Result rules" description="How pass/fail, grace marks, absences and assessments are counted.">
      {(r, set, ro) => (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Passing</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Field>
                <FieldLabel htmlFor="pass-pct">Overall pass percentage</FieldLabel>
                <Input id="pass-pct" type="number" min={0} max={100} value={r.overallPassPct} disabled={ro} onChange={(e) => set({ overallPassPct: Number(e.target.value) })} className="max-w-32" />
              </Field>
              <ToggleRow id="subject-pass" label="Must pass each subject" help="A student who fails a subject fails overall, even with a good total." checked={r.subjectPassRequired} disabled={ro} onChange={(v) => set({ subjectPassRequired: v })} />
              {r.subjectPassRequired ? (
                <Field>
                  <FieldLabel htmlFor="max-fail">Subjects a student may fail and still pass</FieldLabel>
                  <Input id="max-fail" type="number" min={0} max={20} value={r.maxFailSubjects} disabled={ro} onChange={(e) => set({ maxFailSubjects: Number(e.target.value) })} className="max-w-32" />
                  <FieldDescription>0 = must pass every subject. 1 or 2 allows promotion with a supplementary.</FieldDescription>
                </Field>
              ) : null}
              <Field>
                <FieldLabel htmlFor="grace">Grace marks per paper</FieldLabel>
                <Input id="grace" type="number" min={0} max={20} step="0.5" value={r.graceMarks} disabled={ro} onChange={(e) => set({ graceMarks: Number(e.target.value) })} className="max-w-32" />
                <FieldDescription>A student this close to the pass mark is moved up to it. 0 turns it off.</FieldDescription>
              </Field>
              <ToggleRow id="absent-zero" label="Absent counts as zero" help="Off: absent papers are left out of the total instead of scoring zero." checked={r.absentCountsAsZero} disabled={ro} onChange={(v) => set({ absentCountsAsZero: v })} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Term results</CardTitle>
              <CardDescription>Exams in a term are combined by each exam's weight.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <Field>
                <FieldLabel htmlFor="assess-weight">Share of quizzes, assignments, practicals & viva (%)</FieldLabel>
                <Input id="assess-weight" type="number" min={0} max={100} value={r.assessmentWeight} disabled={ro} onChange={(e) => set({ assessmentWeight: Number(e.target.value) })} className="max-w-32" />
                <FieldDescription>
                  E.g. 20 = assessments are 20% of each subject's term score and exams 80%. 0 = assessments are recorded but don't count.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="decimals">Decimal places</FieldLabel>
                <FormSelect id="decimals" value={String(r.decimals)} disabled={ro} onValueChange={(v) => set({ decimals: Number(v ?? 1) })} options={[{ value: "0", label: "None (78%)" }, { value: "1", label: "One (78.4%)" }, { value: "2", label: "Two (78.45%)" }]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="risk">“Needs attention” below (%)</FieldLabel>
                <Input id="risk" type="number" min={0} max={100} value={r.atRiskPct} disabled={ro} onChange={(e) => set({ atRiskPct: Number(e.target.value) })} className="max-w-32" />
                <FieldDescription>
                  Used by <Link to="/exams/analytics/student" className="text-indigo">student performance</Link>.
                </FieldDescription>
              </Field>
            </CardContent>
          </Card>
        </>
      )}
    </RulesForm>
  );
}

export function RankingRulesPage() {
  return (
    <RulesForm title="Ranking rules" description="How positions are worked out on results and report cards.">
      {(r, set, ro) => (
        <Card>
          <CardContent className="flex flex-col gap-5 pt-6">
            <ToggleRow id="show-rank" label="Show position" help="Show 1st, 2nd, 3rd… on class results and report cards." checked={r.showRank} disabled={ro} onChange={(v) => set({ showRank: v })} />
            <Field>
              <FieldLabel htmlFor="rank-method">When students tie</FieldLabel>
              <FormSelect
                id="rank-method"
                value={r.rankMethod}
                disabled={ro}
                onValueChange={(v) => set({ rankMethod: (v ?? "DENSE") as ExamRules["rankMethod"] })}
                options={[
                  { value: "DENSE", label: "Share the position, next is +1 (1, 1, 2)" },
                  { value: "STANDARD", label: "Share the position, skip the next (1, 1, 3)" },
                  { value: "NONE", label: "Don't rank" },
                ]}
              />
              <FieldDescription>Equal percentages are split by total marks first.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="rank-scope">Rank within</FieldLabel>
              <FormSelect
                id="rank-scope"
                value={r.rankScope}
                disabled={ro}
                onValueChange={(v) => set({ rankScope: (v ?? "SECTION") as ExamRules["rankScope"] })}
                options={[
                  { value: "SECTION", label: "Each section (Grade 5 A, Grade 5 B separately)" },
                  { value: "GRADE", label: "The whole grade (all sections together)" },
                ]}
              />
            </Field>
            <ToggleRow id="rank-passed" label="Rank only students who passed" help="Students who fail get no position." checked={r.rankOnlyPassed} disabled={ro} onChange={(v) => set({ rankOnlyPassed: v })} />
          </CardContent>
        </Card>
      )}
    </RulesForm>
  );
}

// Report card templates ---------------------------------------------------------------

const LAYOUT_LABEL: Record<(typeof REPORT_CARD_LAYOUTS)[number], string> = {
  CLASSIC: "Classic — letterhead with a coloured rule",
  MODERN: "Modern — coloured header band",
  COMPACT: "Compact — smaller text, fits more subjects",
};

export function ReportTemplatesPage() {
  const admin = isExamAdmin();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: examKeys.templates, queryFn: examsApi.templates });
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  if (isPending) return <LoadingState variant="form" />;
  if (isError || !data) return <ErrorState title="Couldn't load templates" description="Check your connection and try again." onRetry={() => void refetch()} />;
  const selected = selectedId === "new" ? null : (data.find((t) => t.id === selectedId) ?? data[0]);
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title="Report card templates"
        description="What's printed on report cards. School name, logo and address come from your school profile."
        actions={
          admin ? (
            <Button variant="outline" icon={<Plus />} onClick={() => setSelectedId("new")}>
              New template
            </Button>
          ) : null
        }
      />
      <ReadOnlyNote />
      <div className="flex flex-wrap gap-2">
        {data.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={selected?.id === t.id && selectedId !== "new"}
            onClick={() => setSelectedId(t.id)}
            className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm ${selected?.id === t.id && selectedId !== "new" ? "border-indigo bg-indigo/10" : "border-line hover:bg-muted"}`}
          >
            {t.name}
            {t.isDefault ? <Badge tone="indigo">Default</Badge> : null}
          </button>
        ))}
      </div>
      <TemplateEditor key={selectedId === "new" ? "new" : selected?.id} template={selected} readOnly={!admin} onSaved={(m, id) => { setToast(m); if (id) setSelectedId(id); }} />
      <p className="text-sm text-muted-foreground">
        Preview with real results on the <Link to="/exams/results/report-cards" className="text-indigo">Report cards</Link> page.
      </p>
      <Toast message={toast} />
    </div>
  );
}

function TemplateEditor({ template, readOnly, onSaved }: { template: ReportTemplate | null; readOnly: boolean; onSaved: (m: string, id?: string) => void }) {
  const queryClient = useQueryClient();
  const defaults = { showRank: true, showGpa: false, showAttendance: true, showRemarks: true, showGradeLegend: true, showBreakdown: true, headerNote: "", signatures: ["Class teacher", "Principal", "Parent"] };
  const [name, setName] = useState(template?.name ?? "New template");
  const [layout, setLayout] = useState<ReportTemplate["layout"]>(template?.layout ?? "CLASSIC");
  const [isDefault, setIsDefault] = useState(template?.isDefault ?? false);
  const [options, setOptions] = useState({ ...defaults, ...(template?.options ?? {}) });
  const [signatures, setSignatures] = useState(options.signatures.join(", "));
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      examsApi.saveTemplate(template?.id ?? null, {
        name,
        layout,
        isDefault,
        options: { ...options, signatures: signatures.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 4) },
      }),
    onSuccess: async (out) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.templates });
      setError(null);
      onSaved("Template saved.", (out as { id?: string })?.id);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save"),
  });
  const remove = useMutation({
    mutationFn: () => examsApi.deleteTemplate(template!.id),
    onSuccess: async () => {
      setDeleting(false);
      await queryClient.invalidateQueries({ queryKey: examKeys.templates });
      onSaved("Template deleted.");
    },
    onError: (err) => {
      setDeleting(false);
      setError(err instanceof Error ? err.message : "Couldn't delete");
    },
  });
  const toggles: [keyof typeof defaults, string][] = [
    ["showRank", "Position in class"],
    ["showGpa", "GPA"],
    ["showAttendance", "Attendance %"],
    ["showRemarks", "Teacher and principal remarks"],
    ["showGradeLegend", "Grading key"],
    ["showBreakdown", "Exam breakdown on term / annual cards"],
  ];
  return (
    <Card>
      <CardContent className="flex flex-col gap-5 pt-6">
        <Field>
          <FieldLabel htmlFor="tpl-name">Name</FieldLabel>
          <Input id="tpl-name" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="tpl-layout">Layout</FieldLabel>
          <FormSelect id="tpl-layout" value={layout} disabled={readOnly} onValueChange={(v) => setLayout((v ?? "CLASSIC") as ReportTemplate["layout"])} options={REPORT_CARD_LAYOUTS.map((l) => ({ value: l, label: LAYOUT_LABEL[l] }))} />
        </Field>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Show on the card</legend>
          {toggles.map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 text-sm">
              <Checkbox checked={Boolean(options[key])} disabled={readOnly} onCheckedChange={(checked) => setOptions((o) => ({ ...o, [key]: Boolean(checked) }))} />
              {label}
            </label>
          ))}
        </fieldset>
        <Field>
          <FieldLabel htmlFor="tpl-note">Note under the title</FieldLabel>
          <Input id="tpl-note" value={options.headerNote} disabled={readOnly} onChange={(e) => setOptions((o) => ({ ...o, headerNote: e.target.value }))} placeholder="e.g. Affiliated with BISE Lahore" />
        </Field>
        <Field>
          <FieldLabel htmlFor="tpl-sign">Signature lines</FieldLabel>
          <Input id="tpl-sign" value={signatures} disabled={readOnly} onChange={(e) => setSignatures(e.target.value)} />
          <FieldDescription>Comma-separated, up to four.</FieldDescription>
        </Field>
        <ToggleRow id="tpl-default" label="Default template" help="Used when printing unless another is picked." checked={isDefault} disabled={readOnly || Boolean(template?.isDefault)} onChange={setIsDefault} />
        {error ? <FieldError>{error}</FieldError> : null}
        {!readOnly ? (
          <div className="flex flex-wrap justify-between gap-2">
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save template
            </Button>
            {template && !template.isDefault ? (
              <Button variant="destructive" icon={<Trash2 />} onClick={() => setDeleting(true)}>
                Delete
              </Button>
            ) : null}
          </div>
        ) : null}
      </CardContent>
      <Dialog open={deleting} title="Delete this template?" confirmLabel="Delete" danger loading={remove.isPending} onClose={() => setDeleting(false)} onConfirm={() => remove.mutate()} />
    </Card>
  );
}
