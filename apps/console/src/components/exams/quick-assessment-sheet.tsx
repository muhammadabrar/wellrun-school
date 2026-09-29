import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ASSESSMENT_KINDS, EXAM_KIND_LABELS } from "@wellrun/shared";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { todayIso } from "@/lib/format";
import { examKeys, examsApi, type AssessmentKind } from "@/lib/exams-api";

const MAX_PRESETS = [10, 20, 25, 50, 100];

/** Create a quiz / assignment / practical / viva for one class and subject, then jump straight into marks entry. */
export function QuickAssessmentSheet({ open, onClose, kind: fixedKind }: { open: boolean; onClose: () => void; kind?: AssessmentKind }) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">{open ? <QuickForm fixedKind={fixedKind} onClose={onClose} /> : null}</SheetContent>
    </Sheet>
  );
}

function QuickForm({ fixedKind, onClose }: { fixedKind?: AssessmentKind; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: ctx, isPending } = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context });
  const [kind, setKind] = useState<AssessmentKind>(fixedKind ?? "QUIZ");
  const [name, setName] = useState("");
  const [classId, setClassId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [maxMarks, setMaxMarks] = useState("10");
  const [error, setError] = useState<string | null>(null);

  const classes = (ctx?.classes ?? []).filter((c) => c.subjectIds.length);
  const cls = classes.find((c) => c.id === classId);
  const subjects = (ctx?.subjects ?? []).filter((s) => cls?.subjectIds.includes(s.id));

  const create = useMutation({
    mutationFn: () =>
      examsApi.quickAssessment({ kind, name: name.trim(), classId, subjectId, date, maxMarks: Number(maxMarks) }),
    onSuccess: async (out) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      onClose();
      navigate(`/exams/marks/${out.paperId}`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't create it"),
  });

  const missing = !name.trim() ? "Give it a title" : !classId ? "Pick a class" : !subjectId ? "Pick a subject" : !(Number(maxMarks) > 0) ? "Enter max marks" : null;

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        setError(missing);
        if (!missing) create.mutate();
      }}
    >
      <SheetHeader>
        <SheetTitle>New {fixedKind ? EXAM_KIND_LABELS[fixedKind].toLowerCase() : "quiz or assignment"}</SheetTitle>
        <SheetDescription>One class, one subject. You'll go straight to entering marks.</SheetDescription>
      </SheetHeader>
      <FieldGroup className="flex-1 px-4">
        {!fixedKind ? (
          <Field>
            <FieldLabel id="quick-kind-label">Type</FieldLabel>
            <div role="radiogroup" aria-labelledby="quick-kind-label" className="flex flex-wrap gap-2">
              {ASSESSMENT_KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`h-9 rounded-xl border px-3 text-sm ${kind === k ? "border-indigo bg-indigo/10 text-indigo" : "border-line hover:bg-muted"}`}
                >
                  {EXAM_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="quick-name">Title</FieldLabel>
          <Input id="quick-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "QUIZ" ? "e.g. Fractions quiz" : "e.g. Chapter 3 worksheet"} autoFocus />
        </Field>
        <Field>
          <FieldLabel htmlFor="quick-class">Class</FieldLabel>
          <FormSelect
            id="quick-class"
            value={classId || null}
            onValueChange={(v) => {
              setClassId(v ?? "");
              setSubjectId("");
            }}
            options={classes.map((c) => ({ value: c.id, label: `${c.label} · ${c.students} students` }))}
            placeholder={isPending ? "Loading classes…" : "Pick a class"}
          />
          {!isPending && !classes.length ? <FieldDescription>No classes with subjects you teach this year. Ask an admin to assign you.</FieldDescription> : null}
        </Field>
        <Field>
          <FieldLabel htmlFor="quick-subject">Subject</FieldLabel>
          <FormSelect
            id="quick-subject"
            value={subjectId || null}
            onValueChange={(v) => setSubjectId(v ?? "")}
            options={subjects.map((s) => ({ value: s.id, label: s.name }))}
            placeholder={classId ? "Pick a subject" : "Pick a class first"}
            disabled={!classId}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="quick-date">Date</FieldLabel>
          <DatePicker id="quick-date" value={date} onChange={setDate} />
          <FieldDescription>It's counted in the term this date falls in.</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="quick-max">Out of</FieldLabel>
          <div className="flex flex-wrap items-center gap-2">
            <Input id="quick-max" type="number" min={1} max={1000} inputMode="numeric" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)} className="w-24" />
            {MAX_PRESETS.map((n) => (
              <Button key={n} type="button" size="sm" variant={Number(maxMarks) === n ? "secondary" : "ghost"} onClick={() => setMaxMarks(String(n))}>
                {n}
              </Button>
            ))}
          </div>
          <FieldDescription>Pass mark is set to 33% — you can change it later.</FieldDescription>
        </Field>
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit" loading={create.isPending}>
          Create and enter marks
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </SheetFooter>
    </form>
  );
}
