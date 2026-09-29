import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EXAM_TEMPLATES } from "@wellrun/shared";
import { ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowLeft, ArrowRight, Check, CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { dateRange } from "@/components/exams/exam-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { todayIso } from "@/lib/format";
import { examKeys, examsApi, type ExamContext } from "@/lib/exams-api";

const STEPS = ["Basics", "Classes", "Subjects & marks", "Date sheet"] as const;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SubjectSetting = { include: boolean; max: string; pass: string };

export function ExamCreatePage() {
  const { data: ctx, isPending, isError, refetch } = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context });
  if (isPending) return <LoadingState variant="form" />;
  if (isError || !ctx) return <ErrorState title="Couldn't load classes and subjects" description="Check your connection and try again." onRetry={() => void refetch()} />;
  return <Wizard ctx={ctx} />;
}

function termFor(ctx: ExamContext, date: string) {
  return ctx.terms.find((t) => t.startsOn.slice(0, 10) <= date && t.endsOn.slice(0, 10) >= date)?.id ?? "";
}

function Wizard({ ctx }: { ctx: ExamContext }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Step 1 — basics
  const [templateId, setTemplateId] = useState<string>("midterm");
  const template = EXAM_TEMPLATES.find((t) => t.id === templateId);
  const [name, setName] = useState(`${template?.name ?? "Exam"}`);
  const [startsOn, setStartsOn] = useState(todayIso());
  const [endsOn, setEndsOn] = useState(todayIso());
  const [termId, setTermId] = useState(() => termFor(ctx, todayIso()));
  const [gradingScaleId, setGradingScaleId] = useState(ctx.gradingScales.find((s) => s.isDefault)?.id ?? "");
  const [weight, setWeight] = useState(String(template?.weight ?? 100));
  const [includeInReportCard, setIncludeInReportCard] = useState(true);
  const [instructions, setInstructions] = useState("");

  // Step 2 — classes
  const [classIds, setClassIds] = useState<Set<string>>(new Set());
  const grades = useMemo(() => {
    const map = new Map<string, ExamContext["classes"]>();
    ctx.classes.forEach((c) => map.set(c.name, [...(map.get(c.name) ?? []), c]));
    return [...map];
  }, [ctx.classes]);

  // Step 3 — subjects per grade
  const [defaultMax, setDefaultMax] = useState(String(template?.maxMarks ?? 100));
  const [defaultPass, setDefaultPass] = useState(String(template?.passMarks ?? 33));
  const [overrides, setOverrides] = useState<Record<string, Partial<SubjectSetting>>>({});
  const subjectName = useMemo(() => new Map(ctx.subjects.map((s) => [s.id, s.name])), [ctx.subjects]);
  const selectedGrades = grades
    .map(([grade, sections]) => ({ grade, sections: sections.filter((s) => classIds.has(s.id)) }))
    .filter((g) => g.sections.length);
  const setting = (grade: string, subjectId: string): SubjectSetting => ({
    include: overrides[`${grade}:${subjectId}`]?.include ?? true,
    max: overrides[`${grade}:${subjectId}`]?.max ?? defaultMax,
    pass: overrides[`${grade}:${subjectId}`]?.pass ?? defaultPass,
  });
  const setOverride = (grade: string, subjectId: string, patch: Partial<SubjectSetting>) =>
    setOverrides((current) => ({ ...current, [`${grade}:${subjectId}`]: { ...current[`${grade}:${subjectId}`], ...patch } }));

  // Step 4 — schedule
  const [autoSchedule, setAutoSchedule] = useState(true);
  const [skipWeekdays, setSkipWeekdays] = useState<number[]>([0]);
  const [papersPerDay, setPapersPerDay] = useState("1");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");

  const papers = selectedGrades.flatMap(({ grade, sections }) =>
    sections.flatMap((cls) =>
      cls.subjectIds
        .filter((subjectId) => setting(grade, subjectId).include)
        .map((subjectId) => {
          const s = setting(grade, subjectId);
          return { classId: cls.id, subjectId, maxMarks: Number(s.max), passMarks: Number(s.pass) };
        }),
    ),
  );
  const classesWithoutSubjects = selectedGrades.flatMap((g) => g.sections).filter((c) => !c.subjectIds.length);

  function applyTemplate(id: string) {
    const next = EXAM_TEMPLATES.find((t) => t.id === id);
    setTemplateId(id);
    if (!next) return;
    setName(next.name);
    setWeight(String(next.weight));
    setDefaultMax(String(next.maxMarks));
    setDefaultPass(String(next.passMarks));
    setOverrides({});
  }

  function validate(target: number) {
    if (target >= 1) {
      if (!name.trim()) return "Name the exam";
      if (!startsOn) return "Pick the first exam day";
      if (endsOn < startsOn) return "The last day can't be before the first";
    }
    if (target >= 2 && !classIds.size) return "Pick at least one class";
    if (target >= 3) {
      if (!papers.length) return "Include at least one subject";
      const bad = papers.find((p) => !(p.maxMarks > 0) || p.passMarks < 0 || p.passMarks > p.maxMarks);
      if (bad) return `Check marks for ${subjectName.get(bad.subjectId)}: pass marks must be between 0 and max marks`;
    }
    return null;
  }

  function go(target: number) {
    const problem = target > step ? validate(target) : null;
    setError(problem);
    if (!problem) setStep(target);
  }

  const create = useMutation({
    mutationFn: async () => {
      const exam = await examsApi.create({
        kind: "EXAM",
        name: name.trim(),
        termId: termId || null,
        gradingScaleId: gradingScaleId || null,
        startsOn,
        endsOn: endsOn < startsOn ? startsOn : endsOn,
        weight: Number(weight) || 0,
        includeInReportCard,
        instructions,
        papers,
      });
      if (autoSchedule) {
        await examsApi.schedule(exam.id, { startsOn, skipWeekdays, holidays: [], papersPerDay: Number(papersPerDay), startTime, endTime });
      }
      return exam;
    },
    onSuccess: async (exam) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      navigate(`/exams/${exam.id}?tab=${autoSchedule ? "schedule" : "overview"}&created=1`);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't create the exam"),
  });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <Link to="/exams/list" className="text-sm text-indigo">
        All exams
      </Link>
      <PageHeader title="Create exam" description={`For ${ctx.year?.name ?? "the selected academic year"}. Four quick steps — you can edit everything afterwards.`} />

      <ol className="flex flex-wrap gap-2" aria-label="Steps">
        {STEPS.map((label, index) => (
          <li key={label}>
            <button
              type="button"
              onClick={() => go(index)}
              aria-current={index === step ? "step" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm ${index === step ? "bg-indigo text-white" : index < step ? "bg-indigo/10 text-indigo" : "bg-paper text-muted-foreground"}`}
            >
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-white/20 text-xs">{index < step ? <Check className="size-3.5" /> : index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>

      <div className="rounded-3xl bg-surface p-6">
        {step === 0 ? (
          <FieldGroup>
            <Field>
              <FieldLabel id="template-label">Start from</FieldLabel>
              <div role="radiogroup" aria-labelledby="template-label" className="flex flex-wrap gap-2">
                {EXAM_TEMPLATES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={templateId === t.id}
                    onClick={() => applyTemplate(t.id)}
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${templateId === t.id ? "border-indigo bg-indigo/10" : "border-line hover:bg-muted"}`}
                  >
                    <span className="block font-medium">{t.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      Out of {t.maxMarks} · pass {t.passMarks}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
            <div className="grid gap-5 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="exam-name">Exam name</FieldLabel>
                <Input id="exam-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mid Term Exam" />
              </Field>
              <Field>
                <FieldLabel htmlFor="exam-term">Term</FieldLabel>
                <FormSelect
                  id="exam-term"
                  value={termId || "none"}
                  onValueChange={(v) => setTermId(v === "none" ? "" : (v ?? ""))}
                  options={[{ value: "none", label: "No term" }, ...ctx.terms.map((t) => ({ value: t.id, label: t.name }))]}
                />
                <FieldDescription>
                  {ctx.terms.length ? "Picked from the start date. Term results combine the exams in a term." : (
                    <>
                      No terms yet — <Link to="/exams/settings/terms" className="text-indigo">add terms</Link> to get term report cards.
                    </>
                  )}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="exam-start">First exam day</FieldLabel>
                <DatePicker
                  id="exam-start"
                  value={startsOn}
                  onChange={(value) => {
                    setStartsOn(value);
                    if (endsOn < value) setEndsOn(value);
                    const t = termFor(ctx, value);
                    if (t) setTermId(t);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="exam-end">Last exam day</FieldLabel>
                <DatePicker id="exam-end" value={endsOn} onChange={setEndsOn} />
                <FieldDescription>Updated automatically if you generate the date sheet.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="exam-scale">Grading scale</FieldLabel>
                <FormSelect id="exam-scale" value={gradingScaleId || null} onValueChange={(v) => setGradingScaleId(v ?? "")} options={ctx.gradingScales.map((s) => ({ value: s.id, label: s.name }))} placeholder="School default" />
              </Field>
              <Field>
                <FieldLabel htmlFor="exam-weight">Weight in term result</FieldLabel>
                <Input id="exam-weight" type="number" min={0} max={100} value={weight} onChange={(e) => setWeight(e.target.value)} className="max-w-32" />
                <FieldDescription>E.g. Mid term 40 and Final 60. Weights are relative to other exams in the term.</FieldDescription>
              </Field>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <FieldLabel htmlFor="exam-report">Count in report cards</FieldLabel>
                <FieldDescription>Turn off for practice tests that shouldn't affect term or annual results.</FieldDescription>
              </div>
              <Switch id="exam-report" checked={includeInReportCard} onCheckedChange={setIncludeInReportCard} />
            </div>
            <Field>
              <FieldLabel htmlFor="exam-notes">Instructions (optional)</FieldLabel>
              <Textarea id="exam-notes" rows={2} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Shown to teachers, e.g. 'Submit marks within 5 days of each paper.'" />
            </Field>
          </FieldGroup>
        ) : step === 1 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {classIds.size} of {ctx.classes.length} classes selected
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setClassIds(new Set(ctx.classes.map((c) => c.id)))}>
                  Select all classes
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setClassIds(new Set())}>
                  Clear
                </Button>
              </div>
            </div>
            {!ctx.classes.length ? (
              <p className="text-sm text-muted-foreground">
                No classes in this academic year. <Link to="/academics" className="text-indigo">Set up classes</Link> first.
              </p>
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {grades.map(([grade, sections]) => {
                  const picked = sections.filter((s) => classIds.has(s.id)).length;
                  const all = picked === sections.length;
                  return (
                    <li key={grade} className="rounded-2xl bg-paper p-4">
                      <label className="flex items-center gap-3 font-medium">
                        <Checkbox
                          checked={all}
                          indeterminate={picked > 0 && !all}
                          onCheckedChange={(checked) =>
                            setClassIds((current) => {
                              const next = new Set(current);
                              sections.forEach((s) => (checked ? next.add(s.id) : next.delete(s.id)));
                              return next;
                            })
                          }
                        />
                        {grade}
                        <span className="text-xs font-normal text-muted-foreground">{sections.length} {sections.length === 1 ? "section" : "sections"}</span>
                      </label>
                      {sections.length > 1 ? (
                        <div className="mt-3 flex flex-wrap gap-3 pl-7">
                          {sections.map((s) => (
                            <label key={s.id} className="flex items-center gap-2 text-sm">
                              <Checkbox
                                checked={classIds.has(s.id)}
                                onCheckedChange={(checked) =>
                                  setClassIds((current) => {
                                    const next = new Set(current);
                                    if (checked) next.add(s.id);
                                    else next.delete(s.id);
                                    return next;
                                  })
                                }
                              />
                              {s.section} <span className="text-xs text-muted-foreground">({s.students})</span>
                            </label>
                          ))}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ) : step === 2 ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-paper p-4">
              <Field className="w-32">
                <FieldLabel htmlFor="default-max">Max marks</FieldLabel>
                <Input id="default-max" type="number" min={1} value={defaultMax} onChange={(e) => setDefaultMax(e.target.value)} />
              </Field>
              <Field className="w-32">
                <FieldLabel htmlFor="default-pass">Pass marks</FieldLabel>
                <Input id="default-pass" type="number" min={0} value={defaultPass} onChange={(e) => setDefaultPass(e.target.value)} />
              </Field>
              <p className="pb-2 text-sm text-muted-foreground">Used for every subject unless you change one below.</p>
            </div>
            {classesWithoutSubjects.length ? (
              <p className="flex items-start gap-2 rounded-2xl bg-orange/10 p-3 text-sm text-orange">
                <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  {classesWithoutSubjects.map((c) => c.label).join(", ")} {classesWithoutSubjects.length === 1 ? "has" : "have"} no subjects yet.{" "}
                  <Link to="/academics" className="underline">Add subjects in Classes & subjects</Link>.
                </span>
              </p>
            ) : null}
            {selectedGrades.map(({ grade, sections }) => {
              const subjectIds = [...new Set(sections.flatMap((s) => s.subjectIds))].sort((a, b) => (subjectName.get(a) ?? "").localeCompare(subjectName.get(b) ?? ""));
              if (!subjectIds.length) return null;
              return (
                <section key={grade} aria-labelledby={`grade-${grade}`}>
                  <h3 id={`grade-${grade}`} className="font-display text-lg">
                    {grade} <span className="text-sm font-normal text-muted-foreground">· {sections.map((s) => s.section).join(", ")}</span>
                  </h3>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-muted-foreground">
                        <tr>
                          <th scope="col" className="w-10 py-2 font-medium"><span className="sr-only">Include</span></th>
                          <th scope="col" className="py-2 font-medium">Subject</th>
                          <th scope="col" className="w-28 py-2 font-medium">Max</th>
                          <th scope="col" className="w-28 py-2 font-medium">Pass</th>
                        </tr>
                      </thead>
                      <tbody>
                        {subjectIds.map((subjectId) => {
                          const s = setting(grade, subjectId);
                          const label = subjectName.get(subjectId) ?? "Subject";
                          return (
                            <tr key={subjectId} className={`border-t border-line ${s.include ? "" : "opacity-50"}`}>
                              <td className="py-2">
                                <Checkbox aria-label={`Include ${label}`} checked={s.include} onCheckedChange={(checked) => setOverride(grade, subjectId, { include: Boolean(checked) })} />
                              </td>
                              <td className="py-2">{label}</td>
                              <td className="py-2 pr-2">
                                <Input aria-label={`${label} max marks`} type="number" min={1} value={s.max} disabled={!s.include} onChange={(e) => setOverride(grade, subjectId, { max: e.target.value })} />
                              </td>
                              <td className="py-2">
                                <Input aria-label={`${label} pass marks`} type="number" min={0} value={s.pass} disabled={!s.include} onChange={(e) => setOverride(grade, subjectId, { pass: e.target.value })} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <FieldLabel htmlFor="auto-schedule">Build the date sheet for me</FieldLabel>
                <FieldDescription>One subject per slot, every section of a grade writes the same subject together. You can move any paper afterwards.</FieldDescription>
              </div>
              <Switch id="auto-schedule" checked={autoSchedule} onCheckedChange={setAutoSchedule} />
            </div>
            {autoSchedule ? (
              <div className="grid gap-5 md:grid-cols-2">
                <Field>
                  <FieldLabel id="skip-days-label">Days off</FieldLabel>
                  <div role="group" aria-labelledby="skip-days-label" className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map((day, index) => {
                      const off = skipWeekdays.includes(index);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={off}
                          onClick={() => setSkipWeekdays((current) => (off ? current.filter((d) => d !== index) : [...current, index]))}
                          className={`h-8 w-11 rounded-lg border text-xs ${off ? "border-orange bg-orange/10 text-orange" : "border-line hover:bg-muted"}`}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                  <FieldDescription>No papers on highlighted days.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="per-day">Papers per day</FieldLabel>
                  <FormSelect id="per-day" value={papersPerDay} onValueChange={(v) => setPapersPerDay(v ?? "1")} options={["1", "2", "3"].map((n) => ({ value: n, label: n === "1" ? "One paper a day" : `${n} papers a day` }))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="start-time">Paper starts</FieldLabel>
                  <Input id="start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="max-w-36" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="end-time">Paper ends</FieldLabel>
                  <Input id="end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="max-w-36" />
                </Field>
              </div>
            ) : null}
            <div className="rounded-2xl bg-paper p-4 text-sm">
              <h3 className="font-display text-lg">Review</h3>
              <dl className="mt-2 grid grid-cols-[9rem_1fr] gap-y-1.5">
                <dt className="text-muted-foreground">Exam</dt>
                <dd>{name}</dd>
                <dt className="text-muted-foreground">Dates</dt>
                <dd>{autoSchedule ? `From ${dateRange(startsOn)} (end date set by the date sheet)` : dateRange(startsOn, endsOn)}</dd>
                <dt className="text-muted-foreground">Term</dt>
                <dd>{ctx.terms.find((t) => t.id === termId)?.name ?? "No term"}</dd>
                <dt className="text-muted-foreground">Classes</dt>
                <dd>{selectedGrades.map((g) => `${g.grade} (${g.sections.map((s) => s.section).join(", ")})`).join("; ")}</dd>
                <dt className="text-muted-foreground">Papers</dt>
                <dd>{papers.length} class × subject papers</dd>
              </dl>
            </div>
          </div>
        )}
      </div>

      {error ? <FieldError>{error}</FieldError> : null}

      <div className="flex flex-wrap justify-between gap-2">
        <Button type="button" variant="outline" icon={<ArrowLeft />} disabled={step === 0} onClick={() => go(step - 1)}>
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => go(step + 1)}>
            Next <ArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button
            type="button"
            loading={create.isPending}
            onClick={() => {
              const problem = validate(3);
              setError(problem);
              if (!problem) create.mutate();
            }}
          >
            Create exam
          </Button>
        )}
      </div>
    </div>
  );
}
