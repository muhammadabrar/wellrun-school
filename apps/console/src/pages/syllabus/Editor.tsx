import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseTopicList } from "@wellrun/shared";
import { Dialog, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowDown, ArrowUp, CheckCheck, ClipboardPaste, LockIcon, Pencil, Plus, Printer, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Stat } from "@/components/exams/exam-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { LockBadge, ProgressSelect, SyllabusStatusBadge, TeachingProgress, dateSpan } from "@/components/syllabus/syllabus-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { syllabusApi, syllabusKeys, type SyllabusDetail, type SyllabusTopic, type SyllabusUnit } from "@/lib/syllabus-api";

type Notify = (message: string) => void;

export function SyllabusEditorPage() {
  const { id = "" } = useParams();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: syllabusKeys.detail(id), queryFn: () => syllabusApi.detail(id), enabled: Boolean(id) });
  if (isPending) return <LoadingState variant="profile" />;
  if (isError || !data) return <ErrorState title="Couldn't open this syllabus" description="It may have been deleted, or it isn't one of your classes." onRetry={() => void refetch()} />;
  return <Editor syllabus={data} />;
}

function Editor({ syllabus }: { syllabus: SyllabusDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canEdit = syllabus.permissions.canEdit;
  const [toast, setToast] = useState<string | null>(null);
  const [unitSheet, setUnitSheet] = useState<SyllabusUnit | "new" | null>(null);
  const [deleting, setDeleting] = useState(false);
  const lockedTotal = syllabus.stats.locked;

  const refresh = () => queryClient.invalidateQueries({ queryKey: syllabusKeys.root });
  /** Runs a change, refreshes the syllabus and reports the server's reason (e.g. a lock) if it fails. */
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

  const move = (ids: string[], index: number, delta: number, save: (ids: string[]) => Promise<unknown>) => {
    const next = [...ids];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    run(() => save(next));
  };
  const unitIds = syllabus.units.map((u) => u.id);

  const remove = useMutation({
    mutationFn: () => syllabusApi.remove(syllabus.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: syllabusKeys.root });
      navigate("/syllabus");
    },
    onError: (err) => {
      setDeleting(false);
      setToast(err instanceof Error ? err.message : "Couldn't delete");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Link to="/syllabus" className="text-sm text-indigo print:hidden">
        Syllabus overview
      </Link>
      <PageHeader
        title={`${syllabus.gradeName} · ${syllabus.subject.name}`}
        description={`Scheme of work ${syllabus.year.name} · applies to ${syllabus.classes.map((c) => c.label).join(", ") || syllabus.gradeName}${syllabus.teachers.length ? ` · ${syllabus.teachers.join(", ")}` : ""}`}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <SyllabusStatusBadge status={syllabus.stats.status} />
            <Button variant="outline" icon={<Printer />} onClick={() => window.print()}>
              Print
            </Button>
            {canEdit ? (
              <Button variant="destructive" icon={<Trash2 />} onClick={() => setDeleting(true)} disabled={lockedTotal > 0} title={lockedTotal ? "Topics covered by an exam are locked, so the syllabus can't be deleted." : undefined}>
                Delete
              </Button>
            ) : null}
          </div>
        }
      />

      {syllabus.permissions.readOnlyReason ? (
        <p className="rounded-2xl bg-paper p-3 text-sm text-muted-foreground print:hidden" role="status">
          {syllabus.permissions.readOnlyReason}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4 print:hidden">
        <Stat label="Taught" value={`${syllabus.stats.percent}%`} hint={`${syllabus.stats.completed} of ${syllabus.stats.topics} topics`} />
        <Stat label="Units" value={syllabus.stats.units} hint={`${syllabus.stats.periods} planned periods`} />
        <Stat label="Behind schedule" value={syllabus.stats.behind} hint={syllabus.stats.behind ? "Past a unit's end date, not taught" : "On plan"} tone={syllabus.stats.behind ? "warning" : undefined} />
        <Stat label="Locked for exams" value={lockedTotal} hint={lockedTotal ? "Covered by an exam" : "Nothing locked yet"} />
      </dl>
      {syllabus.stats.topics ? (
        <div className="rounded-3xl bg-surface p-4 print:hidden">
          <TeachingProgress stats={syllabus.stats} label="Topics taught across the year" />
        </div>
      ) : null}

      <CourseDetails syllabus={syllabus} canEdit={canEdit} onSaved={() => void refresh()} onToast={setToast} />

      <section className="flex flex-col gap-4" aria-label="Units">
        {syllabus.units.map((unit, index) => (
          <UnitCard
            key={unit.id}
            unit={unit}
            index={index}
            total={syllabus.units.length}
            terms={syllabus.terms}
            unitOptions={syllabus.units.map((u) => ({ value: u.id, label: u.title }))}
            canEdit={canEdit}
            busy={act.isPending}
            run={run}
            onEdit={() => setUnitSheet(unit)}
            onMove={(delta) => move(unitIds, index, delta, (ids) => syllabusApi.reorderUnits(syllabus.id, ids))}
          />
        ))}
        {!syllabus.units.length ? (
          <div className="rounded-3xl bg-surface px-6 py-12 text-center">
            <h2 className="font-display text-xl">No units yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              A syllabus is made of units (chapters or themes), each with topics. Add your first unit, then paste in the topics.
            </p>
            {canEdit ? (
              <div className="mt-5 flex justify-center">
                <Button icon={<Plus />} onClick={() => setUnitSheet("new")}>
                  Add the first unit
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        {canEdit && syllabus.units.length ? (
          <Button variant="outline" icon={<Plus />} className="self-start print:hidden" onClick={() => setUnitSheet("new")}>
            Add unit
          </Button>
        ) : null}
      </section>

      <UnitSheet syllabus={syllabus} unit={unitSheet} onClose={() => setUnitSheet(null)} onSaved={(m) => { void refresh(); setToast(m); }} />
      <Dialog
        open={deleting}
        title="Delete this syllabus?"
        description={`All units, topics and teaching progress for ${syllabus.gradeName} ${syllabus.subject.name} are removed. This can't be undone.`}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
      />
      <Toast message={toast} />
    </div>
  );
}

function CourseDetails({ syllabus, canEdit, onSaved, onToast }: { syllabus: SyllabusDetail; canEdit: boolean; onSaved: () => void; onToast: Notify }) {
  const [form, setForm] = useState({ overview: syllabus.overview, assessmentNotes: syllabus.assessmentNotes, resources: syllabus.resources });
  const dirty = form.overview !== syllabus.overview || form.assessmentNotes !== syllabus.assessmentNotes || form.resources !== syllabus.resources;
  const save = useMutation({
    mutationFn: () => syllabusApi.update(syllabus.id, form),
    onSuccess: () => {
      onSaved();
      onToast("Course details saved.");
    },
    onError: (err) => onToast(err instanceof Error ? err.message : "Couldn't save"),
  });
  if (!canEdit && !syllabus.overview && !syllabus.assessmentNotes && !syllabus.resources) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Course details</CardTitle>
        <CardDescription>Aims, how the subject is assessed and the books or materials used. You can change these at any time.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-3">
        <Field>
          <FieldLabel htmlFor="syl-overview">Aims & overview</FieldLabel>
          <Textarea id="syl-overview" rows={4} value={form.overview} disabled={!canEdit} onChange={(e) => setForm({ ...form, overview: e.target.value })} placeholder="What students should achieve this year" />
        </Field>
        <Field>
          <FieldLabel htmlFor="syl-assess">How it's assessed</FieldLabel>
          <Textarea id="syl-assess" rows={4} value={form.assessmentNotes} disabled={!canEdit} onChange={(e) => setForm({ ...form, assessmentNotes: e.target.value })} placeholder="Tests, exams, quizzes, projects" />
        </Field>
        <Field>
          <FieldLabel htmlFor="syl-resources">Books & resources</FieldLabel>
          <Textarea id="syl-resources" rows={4} value={form.resources} disabled={!canEdit} onChange={(e) => setForm({ ...form, resources: e.target.value })} placeholder="Textbook, worksheets, lab kits" />
        </Field>
        {canEdit && dirty ? (
          <div className="md:col-span-3 print:hidden">
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              Save details
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function UnitCard({
  unit,
  index,
  total,
  terms,
  unitOptions,
  canEdit,
  busy,
  run,
  onEdit,
  onMove,
}: {
  unit: SyllabusUnit;
  index: number;
  total: number;
  terms: SyllabusDetail["terms"];
  unitOptions: { value: string; label: string }[];
  canEdit: boolean;
  busy: boolean;
  run: (fn: () => Promise<unknown>, done?: string) => void;
  onEdit: () => void;
  onMove: (delta: number) => void;
}) {
  const [topicSheet, setTopicSheet] = useState<SyllabusTopic | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const term = terms.find((t) => t.id === unit.termId);
  const taught = unit.topics.filter((t) => t.progress === "COMPLETED").length;
  const remaining = unit.topics.filter((t) => t.progress !== "COMPLETED").map((t) => t.id);
  const topicIds = unit.topics.map((t) => t.id);

  const addOne = () => {
    const title = newTitle.trim();
    if (!title) return;
    setNewTitle("");
    run(() => syllabusApi.addTopics(unit.id, [title]));
  };

  return (
    <article className="rounded-3xl bg-surface p-5 print:break-inside-avoid print:rounded-none print:p-0" aria-labelledby={`unit-${unit.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`unit-${unit.id}`} className="flex flex-wrap items-center gap-2 font-display text-xl">
            {unit.title}
            {unit.locked ? (
              <span title="This unit has topics covered by an exam: it can't be renamed or deleted." className="inline-flex items-center gap-1 rounded-full bg-orange/10 px-2 py-0.5 font-sans text-xs font-medium text-orange">
                <LockIcon className="size-3" aria-hidden /> Locked
              </span>
            ) : null}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {[term?.name, dateSpan(unit.plannedFrom, unit.plannedTo), `${taught}/${unit.topics.length} taught`].filter(Boolean).join(" · ")}
          </p>
          {unit.description ? <p className="mt-2 text-sm text-muted-foreground">{unit.description}</p> : null}
        </div>
        {canEdit ? (
          <div className="flex flex-wrap items-center gap-1 print:hidden">
            {remaining.length ? (
              <Button variant="ghost" size="sm" icon={<CheckCheck />} disabled={busy} onClick={() => run(() => syllabusApi.setProgressBulk(remaining, "COMPLETED"), `${unit.title} marked as taught.`)}>
                Mark all taught
              </Button>
            ) : null}
            <Button variant="ghost" size="icon-sm" aria-label={`Move ${unit.title} up`} disabled={busy || index === 0} onClick={() => onMove(-1)}>
              <ArrowUp />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Move ${unit.title} down`} disabled={busy || index === total - 1} onClick={() => onMove(1)}>
              <ArrowDown />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${unit.title}`} onClick={onEdit}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${unit.title}`} disabled={unit.locked} title={unit.locked ? "Covered by an exam — can't be deleted" : undefined} onClick={() => setConfirmDelete(true)}>
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </header>

      <ul className="mt-4 divide-y divide-line">
        {unit.topics.map((topic, i) => (
          <li key={topic.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
            <div className="w-32 shrink-0 print:hidden">
              <ProgressSelect value={topic.progress} disabled={!canEdit || busy} label={`Progress for ${topic.title}`} onChange={(progress) => run(() => syllabusApi.setProgress(topic.id, progress))} />
            </div>
            <span className="hidden w-16 text-xs print:inline">{topic.progress === "COMPLETED" ? "Taught" : ""}</span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${topic.progress === "COMPLETED" ? "text-muted-foreground" : "font-medium"}`}>{topic.title}</p>
              {topic.objectives ? <p className="truncate text-xs text-muted-foreground">{topic.objectives}</p> : null}
            </div>
            {topic.locked ? <LockBadge usedIn={topic.usedIn} /> : null}
            <span className="w-16 text-right text-xs text-muted-foreground tabular-nums">{topic.plannedPeriods} {topic.plannedPeriods === 1 ? "period" : "periods"}</span>
            {canEdit ? (
              <div className="flex items-center print:hidden">
                <Button variant="ghost" size="icon-sm" aria-label={`Move ${topic.title} up`} disabled={busy || i === 0} onClick={() => run(() => syllabusApi.reorderTopics(unit.id, swap(topicIds, i, -1)))}>
                  <ArrowUp />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Move ${topic.title} down`} disabled={busy || i === unit.topics.length - 1} onClick={() => run(() => syllabusApi.reorderTopics(unit.id, swap(topicIds, i, 1)))}>
                  <ArrowDown />
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={topic.locked ? `View ${topic.title}` : `Edit ${topic.title}`} onClick={() => setTopicSheet(topic)}>
                  {topic.locked ? <LockIcon /> : <Pencil />}
                </Button>
                <Button variant="ghost" size="icon-sm" aria-label={`Delete ${topic.title}`} disabled={busy || topic.locked} title={topic.locked ? "Covered by an exam — can't be deleted" : undefined} onClick={() => run(() => syllabusApi.removeTopic(topic.id), "Topic deleted.")}>
                  <Trash2 />
                </Button>
              </div>
            ) : null}
          </li>
        ))}
        {!unit.topics.length ? <li className="py-3 text-sm text-muted-foreground">No topics yet.</li> : null}
      </ul>

      {canEdit ? (
        <form
          className="mt-3 flex flex-wrap items-center gap-2 print:hidden"
          onSubmit={(e) => {
            e.preventDefault();
            addOne();
          }}
        >
          <Input aria-label={`Add a topic to ${unit.title}`} className="min-w-56 flex-1" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Add a topic and press Enter" />
          <Button type="submit" variant="outline" icon={<Plus />} disabled={!newTitle.trim() || busy}>
            Add
          </Button>
          <Button type="button" variant="ghost" icon={<ClipboardPaste />} onClick={() => setPasteOpen(true)}>
            Paste a list
          </Button>
        </form>
      ) : null}

      <TopicSheet topic={topicSheet} unitId={unit.id} unitOptions={unitOptions} canEdit={canEdit} onClose={() => setTopicSheet(null)} run={run} />
      <PasteSheet open={pasteOpen} unitTitle={unit.title} onClose={() => setPasteOpen(false)} unitId={unit.id} run={run} />
      <Dialog
        open={confirmDelete}
        title={`Delete ${unit.title}?`}
        description={`Its ${unit.topics.length} topics are removed too.`}
        confirmLabel="Delete unit"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          run(() => syllabusApi.removeUnit(unit.id), "Unit deleted.");
        }}
      />
    </article>
  );
}

function swap(ids: string[], index: number, delta: number) {
  const next = [...ids];
  [next[index], next[index + delta]] = [next[index + delta], next[index]];
  return next;
}

function UnitSheet({ syllabus, unit, onClose, onSaved }: { syllabus: SyllabusDetail; unit: SyllabusUnit | "new" | null; onClose: () => void; onSaved: Notify }) {
  return (
    <Sheet open={Boolean(unit)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {unit ? <UnitForm key={unit === "new" ? "new" : unit.id} syllabus={syllabus} unit={unit === "new" ? null : unit} onClose={onClose} onSaved={onSaved} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function UnitForm({ syllabus, unit, onClose, onSaved }: { syllabus: SyllabusDetail; unit: SyllabusUnit | null; onClose: () => void; onSaved: Notify }) {
  const [form, setForm] = useState({
    title: unit?.title ?? "",
    description: unit?.description ?? "",
    termId: unit?.termId ?? "",
    plannedFrom: unit?.plannedFrom ?? "",
    plannedTo: unit?.plannedTo ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const yearFrom = Number(new Date().getUTCFullYear()) - 2;
  const save = useMutation({
    mutationFn: () => {
      const payload = { ...form, termId: form.termId || null, plannedFrom: form.plannedFrom || null, plannedTo: form.plannedTo || null };
      return unit ? syllabusApi.updateUnit(unit.id, payload) : syllabusApi.createUnit(syllabus.id, payload);
    },
    onSuccess: () => {
      onSaved(unit ? "Unit updated." : "Unit added.");
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save"),
  });
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.title.trim()) return setError("Name the unit");
        save.mutate();
      }}
    >
      <SheetHeader>
        <SheetTitle>{unit ? "Edit unit" : "Add unit"}</SheetTitle>
        <SheetDescription>A unit is a chapter or theme. Planned dates drive the “behind schedule” check.</SheetDescription>
      </SheetHeader>
      <FieldGroup className="flex-1 px-4">
        <Field>
          <FieldLabel htmlFor="unit-title">Title</FieldLabel>
          <Input id="unit-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Unit 3: Fractions" autoFocus />
          {unit?.locked ? <FieldDescription>This unit has topics covered by an exam, so its title can't change.</FieldDescription> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="unit-desc">Description (optional)</FieldLabel>
          <Textarea id="unit-desc" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="unit-term">Term</FieldLabel>
          <FormSelect id="unit-term" value={form.termId || "none"} onValueChange={(v) => setForm({ ...form, termId: v === "none" ? "" : (v ?? "") })} options={[{ value: "none", label: "No term" }, ...syllabus.terms.map((t) => ({ value: t.id, label: t.name }))]} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="unit-from">Starts</FieldLabel>
            <DatePicker id="unit-from" value={form.plannedFrom} onChange={(v) => setForm({ ...form, plannedFrom: v })} fromYear={yearFrom} toYear={yearFrom + 6} placeholder="Optional" />
          </Field>
          <Field>
            <FieldLabel htmlFor="unit-to">Should finish by</FieldLabel>
            <DatePicker id="unit-to" value={form.plannedTo} onChange={(v) => setForm({ ...form, plannedTo: v })} fromYear={yearFrom} toYear={yearFrom + 6} placeholder="Optional" />
          </Field>
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={save.isPending}>
          {unit ? "Save unit" : "Add unit"}
        </Button>
      </SheetFooter>
    </form>
  );
}

function TopicSheet({ topic, unitId, unitOptions, canEdit, onClose, run }: { topic: SyllabusTopic | null; unitId: string; unitOptions: { value: string; label: string }[]; canEdit: boolean; onClose: () => void; run: (fn: () => Promise<unknown>, done?: string) => void }) {
  return (
    <Sheet open={Boolean(topic)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">{topic ? <TopicForm key={topic.id} topic={topic} unitId={unitId} unitOptions={unitOptions} canEdit={canEdit} onClose={onClose} run={run} /> : null}</SheetContent>
    </Sheet>
  );
}

function TopicForm({ topic, unitId, unitOptions, canEdit, onClose, run }: { topic: SyllabusTopic; unitId: string; unitOptions: { value: string; label: string }[]; canEdit: boolean; onClose: () => void; run: (fn: () => Promise<unknown>, done?: string) => void }) {
  const [form, setForm] = useState({ title: topic.title, objectives: topic.objectives, resources: topic.resources, plannedPeriods: String(topic.plannedPeriods), unitId });
  const locked = topic.locked;
  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (locked || !form.title.trim()) return;
        run(() => syllabusApi.updateTopic(topic.id, { ...form, plannedPeriods: Number(form.plannedPeriods) || 0 }), "Topic updated.");
        onClose();
      }}
    >
      <SheetHeader>
        <SheetTitle>{locked ? "Locked topic" : "Edit topic"}</SheetTitle>
        <SheetDescription>{locked ? "This topic is covered by an exam, so its details can't change." : "Change what's taught and how many periods it takes."}</SheetDescription>
      </SheetHeader>
      <FieldGroup className="flex-1 px-4">
        {locked ? (
          <div className="rounded-2xl bg-orange/10 p-3 text-sm text-orange">
            <p className="flex items-center gap-2 font-medium">
              <LockIcon className="size-4" aria-hidden /> Covered by:
            </p>
            <ul className="mt-1 list-disc pl-6">
              {topic.usedIn.map((u) => (
                <li key={u.examId}>
                  <Link to={`/exams/${u.examId}?tab=papers`} className="underline">
                    {u.examName}
                  </Link>{" "}
                  <span className="text-xs">({u.classes.join(", ")})</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">To edit it, remove it from those exams' syllabus coverage (Exam → Papers & marking → Syllabus).</p>
          </div>
        ) : null}
        <Field>
          <FieldLabel htmlFor="topic-title">Topic</FieldLabel>
          <Input id="topic-title" value={form.title} disabled={locked || !canEdit} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </Field>
        <Field>
          <FieldLabel htmlFor="topic-obj">Learning objectives</FieldLabel>
          <Textarea id="topic-obj" rows={3} value={form.objectives} disabled={locked || !canEdit} onChange={(e) => setForm({ ...form, objectives: e.target.value })} placeholder="Students will be able to…" />
        </Field>
        <Field>
          <FieldLabel htmlFor="topic-res">Resources</FieldLabel>
          <Textarea id="topic-res" rows={2} value={form.resources} disabled={locked || !canEdit} onChange={(e) => setForm({ ...form, resources: e.target.value })} placeholder="Textbook pages, worksheets, videos" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="topic-periods">Planned periods</FieldLabel>
            <Input id="topic-periods" type="number" min={0} max={60} value={form.plannedPeriods} disabled={locked || !canEdit} onChange={(e) => setForm({ ...form, plannedPeriods: e.target.value })} />
          </Field>
          <Field>
            <FieldLabel htmlFor="topic-unit">Unit</FieldLabel>
            <FormSelect id="topic-unit" value={form.unitId} disabled={locked || !canEdit} onValueChange={(v) => setForm({ ...form, unitId: v ?? unitId })} options={unitOptions} />
          </Field>
        </div>
      </FieldGroup>
      {!locked && canEdit ? (
        <SheetFooter>
          <Button type="submit">Save topic</Button>
        </SheetFooter>
      ) : null}
    </form>
  );
}

function PasteSheet({ open, unitId, unitTitle, onClose, run }: { open: boolean; unitId: string; unitTitle: string; onClose: () => void; run: (fn: () => Promise<unknown>, done?: string) => void }) {
  const [text, setText] = useState("");
  const titles = parseTopicList(text);
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Paste topics</SheetTitle>
          <SheetDescription>Add many topics to {unitTitle} at once — one per line. Numbering and bullets are removed.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="flex-1 px-4">
          <Field>
            <FieldLabel htmlFor="paste-topics">Topics</FieldLabel>
            <Textarea id="paste-topics" rows={12} value={text} onChange={(e) => setText(e.target.value)} placeholder={"1. Nouns\n2. Verbs\n3. Adjectives"} autoFocus />
            <FieldDescription>{titles.length ? `${titles.length} ${titles.length === 1 ? "topic" : "topics"} ready to add (duplicates are skipped).` : "Copy a list from your textbook contents or an existing document."}</FieldDescription>
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button
            type="button"
            disabled={!titles.length}
            onClick={() => {
              run(() => syllabusApi.addTopics(unitId, titles), `${titles.length} topics added.`);
              setText("");
              onClose();
            }}
          >
            Add {titles.length || ""} {titles.length === 1 ? "topic" : "topics"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
