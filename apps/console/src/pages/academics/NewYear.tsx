import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  PROMOTION_ACTION_LABEL,
  nextYearDraft,
  type CopySetupResult,
  type PromotionAction,
  type PromotionPreview,
  type PromotionPreviewClass,
  type PromotionResult,
} from "@wellrun/shared";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowRight, Check, Copy, GraduationCap, PlayCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { academicYearKeys, academicYearsApi, type AcademicYearSummary } from "@/lib/academic-years-api";
import { refreshSchoolContext, viewYear } from "@/lib/school-context";
import { cn } from "@/lib/utils";

const STEPS = ["New year", "Copy setup", "Promote students", "Go live"] as const;
const GRADUATE = "__graduate";

/** End-of-session wizard: create next year → copy classes/fees/terms → move students up → switch over. */
export function NewYearPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const { data: years, isPending, isError, refetch } = useQuery({ queryKey: academicYearKeys.list, queryFn: academicYearsApi.list });
  const [step, setStep] = useState(() => Math.min(3, Math.max(0, Number(params.get("step") ?? 0))));

  if (isPending) return <LoadingState variant="form" />;
  if (isError || !years) {
    return <ErrorState title="Could not load academic years" description="We couldn't retrieve your years. Please try again." onRetry={() => void refetch()} />;
  }

  const active = years.find((y) => y.status === "ACTIVE") ?? null;
  const target = years.find((y) => y.id === params.get("year") && y.status === "PLANNING") ?? null;
  const source = years.find((y) => y.id === (params.get("from") ?? active?.id)) ?? active;
  const go = (next: number, extra: Record<string, string> = {}) => {
    setStep(next);
    const merged = new URLSearchParams(params);
    merged.set("step", String(next));
    for (const [k, v] of Object.entries(extra)) merged.set(k, v);
    setParams(merged, { replace: true });
  };
  const refreshYears = () => queryClient.invalidateQueries({ queryKey: academicYearKeys.list });
  const current = target ? step : 0;

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Start a new academic year"
        description="Set up next session from this one, move students up, then switch the whole school over. You can leave and come back — each step is saved."
        actions={
          <Button variant="ghost" render={<Link to="/academics/years" />}>
            Back to years
          </Button>
        }
      />

      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Steps">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === current ? "step" : undefined}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
              i === current ? "bg-ink text-white" : i < current ? "bg-paper text-ink" : "bg-paper text-muted-foreground",
            )}
          >
            <span className="grid size-5 place-items-center rounded-full bg-white/15 text-xs">{i < current ? <Check className="size-3" /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {current === 0 ? (
        <YearStep
          years={years}
          active={active}
          onReady={async (id) => {
            await refreshYears();
            await refreshSchoolContext();
            go(1, { year: id, ...(active ? { from: active.id } : {}) });
          }}
        />
      ) : null}
      {current === 1 && target ? <CopyStep target={target} source={source} years={years} onChangeSource={(id) => go(1, { from: id })} onNext={() => go(2)} onBack={() => go(0)} /> : null}
      {current === 2 && target ? (
        source ? (
          <PromoteStep target={target} source={source} onNext={() => go(3)} onBack={() => go(1)} />
        ) : (
          <EmptyState title="No year to promote from" description="There's no earlier year with students. Skip ahead and make this year current." />
        )
      ) : null}
      {current === 3 && target ? <GoLiveStep target={target} active={active} onBack={() => go(2)} /> : null}
    </div>
  );
}

function YearStep({ years, active, onReady }: { years: AcademicYearSummary[]; active: AcademicYearSummary | null; onReady: (id: string) => Promise<void> }) {
  const upcoming = years.filter((y) => y.status === "PLANNING");
  const draft = nextYearDraft(active ?? years[0] ?? null);
  const [name, setName] = useState(draft.name);
  const [startsOn, setStartsOn] = useState(draft.startsOn);
  const [endsOn, setEndsOn] = useState(draft.endsOn);
  const create = useMutation({
    mutationFn: () => academicYearsApi.create({ name: name.trim(), startsOn, endsOn }),
    onSuccess: (year) => onReady(year.id),
  });
  const toYear = new Date().getFullYear() + 3;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {upcoming.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Continue with an upcoming year</CardTitle>
            <CardDescription>You already added these. Pick one to set up.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {upcoming.map((y) => (
              <Button key={y.id} variant="secondary" className="w-full justify-between" onClick={() => void onReady(y.id)}>
                {y.name}
                <ArrowRight />
              </Button>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Add next year</CardTitle>
          <CardDescription>{active ? `Suggested from ${active.name}: it starts the day after it ends.` : "Name and dates of the new session."}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <Field>
              <FieldLabel htmlFor="ny-name">Name</FieldLabel>
              <Input id="ny-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel>Starts on</FieldLabel>
                <DatePicker value={startsOn} onChange={(v) => v && setStartsOn(v)} toYear={toYear} />
              </Field>
              <Field>
                <FieldLabel>Ends on</FieldLabel>
                <DatePicker value={endsOn} onChange={(v) => v && setEndsOn(v)} toYear={toYear} />
              </Field>
            </div>
            {create.error ? (
              <p className="text-sm text-danger" role="alert">
                {create.error.message}
              </p>
            ) : null}
            <Button type="submit" loading={create.isPending} disabled={!name.trim() || endsOn <= startsOn}>
              Add year & continue
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyStep({
  target,
  source,
  years,
  onChangeSource,
  onNext,
  onBack,
}: {
  target: AcademicYearSummary;
  source: AcademicYearSummary | null;
  years: AcademicYearSummary[];
  onChangeSource: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [opts, setOpts] = useState({ classes: true, fees: true, terms: true, teachers: false, timetable: false });
  const [increase, setIncrease] = useState("0");
  const copy = useMutation({
    mutationFn: () => academicYearsApi.copySetup(target.id, { fromYearId: source!.id, ...opts, feeIncreasePct: Number(increase) || 0 }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: academicYearKeys.list });
      await refreshSchoolContext();
    },
  });
  const options: { key: keyof typeof opts; label: string; hint: string; needsClasses?: boolean }[] = [
    { key: "classes", label: "Classes, sections & subjects", hint: "Same class names and sections, with the subjects each class studies." },
    { key: "fees", label: "Fee structures", hint: "Every class's monthly fees. Invoices are only billed once the year is current." },
    { key: "terms", label: "Terms", hint: "Term names and weights, with dates moved into the new year." },
    { key: "teachers", label: "Class teachers & subject teachers", hint: "Only staff who are still working here.", needsClasses: true },
    { key: "timetable", label: "Timetable", hint: "Last year's weekly timetable as a starting point.", needsClasses: true },
  ];
  const sources = years.filter((y) => y.id !== target.id && y.counts.classes > 0);

  if (!source || !sources.length) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <EmptyState title="Nothing to copy from" description="No earlier year has classes. Add classes for this year on Classes & subjects, then continue." />
          <StepNav onBack={onBack} onNext={onNext} nextLabel="Continue" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Copy setup into {target.name}</CardTitle>
        <CardDescription>Nothing already in {target.name} is overwritten — running this twice is safe.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <Field className="max-w-xs">
          <FieldLabel>Copy from</FieldLabel>
          <FormSelect value={source.id} onValueChange={(v) => v && onChangeSource(v)} options={sources.map((y) => ({ value: y.id, label: y.name }))} />
        </Field>
        <ul className="space-y-3">
          {options.map((o) => (
            <li key={o.key}>
              <label className="flex cursor-pointer items-start gap-3">
                <Checkbox
                  className="mt-0.5"
                  checked={opts[o.key]}
                  disabled={o.needsClasses && !opts.classes && target.counts.classes === 0}
                  onCheckedChange={(checked) => setOpts((prev) => ({ ...prev, [o.key]: Boolean(checked) }))}
                />
                <span>
                  <span className="block text-sm font-medium">{o.label}</span>
                  <span className="block text-sm text-muted-foreground">{o.hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {opts.fees ? (
          <Field className="max-w-xs">
            <FieldLabel htmlFor="fee-increase">Raise fees by</FieldLabel>
            <div className="flex items-center gap-2">
              <Input id="fee-increase" type="number" min={0} max={100} step={1} value={increase} onChange={(e) => setIncrease(e.target.value)} className="max-w-24" />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <FieldDescription>0 keeps last year's amounts. Rounded to the nearest Rs 10.</FieldDescription>
          </Field>
        ) : null}
        {copy.data ? <CopySummary result={copy.data} /> : null}
        {copy.error ? (
          <p className="text-sm text-danger" role="alert">
            {copy.error.message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button icon={<Copy />} loading={copy.isPending} disabled={!Object.values(opts).some(Boolean)} onClick={() => copy.mutate()}>
            Copy from {source.name}
          </Button>
          <div className="ml-auto">
            <StepNav onBack={onBack} onNext={onNext} nextLabel={copy.data || target.counts.classes ? "Continue" : "Skip"} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CopySummary({ result }: { result: CopySetupResult }) {
  const parts = [
    [result.classes, "classes"],
    [result.subjects, "class subjects"],
    [result.feeStructures, "fee structures"],
    [result.terms, "terms"],
    [result.teachers, "teacher assignments"],
    [result.lessons, "timetable lessons"],
  ] as const;
  const made = parts.filter(([n]) => n > 0);
  return (
    <p className="rounded-xl bg-success/10 px-3 py-2 text-sm" role="status">
      {made.length ? `Copied ${made.map(([n, label]) => `${n} ${label}`).join(", ")}.` : "Everything was already there — nothing new to copy."}
    </p>
  );
}

type Decision = { action: PromotionAction; toClassId?: string };

function PromoteStep({ target, source, onNext, onBack }: { target: AcademicYearSummary; source: AcademicYearSummary; onNext: () => void; onBack: () => void }) {
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: academicYearKeys.promotion(target.id, source.id),
    queryFn: () => academicYearsApi.promotionPreview(target.id, source.id),
    staleTime: 0,
  });
  const [classTargets, setClassTargets] = useState<Record<string, string>>({});
  const [actions, setActions] = useState<Record<string, PromotionAction>>({});
  const promote = useMutation({
    mutationFn: (decisions: { studentId: string; action: PromotionAction; toClassId?: string }[]) =>
      academicYearsApi.promote(target.id, { fromYearId: source.id, decisions }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      await refreshSchoolContext();
    },
  });

  const data = preview.data;
  const decisions = useMemo(() => (data ? buildDecisions(data, classTargets, actions) : { rows: [], missing: 0 }), [data, classTargets, actions]);

  if (preview.isPending) return <LoadingState variant="list" />;
  if (preview.isError || !data) {
    return <ErrorState title="Could not load students" description="We couldn't build the promotion list. Please try again." onRetry={() => void preview.refetch()} />;
  }
  const pendingCount = data.classes.reduce((n, c) => n + c.students.filter((s) => !s.alreadyMoved).length, 0);

  if (!data.targets.length) {
    return (
      <Card>
        <CardContent className="space-y-4 pt-6">
          <EmptyState title={`${target.name} has no classes yet`} description="Go back and copy classes, or add them on Classes & subjects, before moving students." />
          <StepNav onBack={onBack} onNext={onNext} nextLabel="Skip" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>
            Move students from {data.fromYear.name} to {data.toYear.name}
          </CardTitle>
          <CardDescription>
            Each class moves up to the class shown. Students who failed the annual result are set to repeat. Change anything before saving — students already moved are skipped.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Set everyone to:</span>
          {(["PROMOTE", "REPEAT", "LEAVE"] as const).map((a) => (
            <Button
              key={a}
              size="sm"
              variant="secondary"
              onClick={() => setActions(Object.fromEntries(data.classes.flatMap((c) => c.students.map((s) => [s.id, a === "PROMOTE" ? s.suggested === "GRADUATE" ? "GRADUATE" : "PROMOTE" : a]))))}
            >
              {PROMOTION_ACTION_LABEL[a]}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setActions({})}>
            Reset to suggestions
          </Button>
        </CardContent>
      </Card>

      {!data.classes.length ? <EmptyState title={`No classes in ${data.fromYear.name}`} description="There are no students to move." /> : null}
      {data.classes.map((cls) => (
        <ClassCard
          key={cls.id}
          cls={cls}
          targets={data.targets.filter((t) => t.campusId === cls.campusId || !cls.campusId)}
          targetId={classTargets[cls.id] ?? (cls.isFinal ? GRADUATE : (cls.suggestedTargetId ?? ""))}
          onTarget={(id) => setClassTargets((prev) => ({ ...prev, [cls.id]: id }))}
          actionOf={(id, suggested) => actions[id] ?? suggested}
          onAction={(id, action) => setActions((prev) => ({ ...prev, [id]: action }))}
        />
      ))}

      {promote.data ? <PromotionSummary result={promote.data} /> : null}
      {promote.error ? (
        <p className="text-sm text-danger" role="alert">
          {promote.error.message}
        </p>
      ) : null}
      {decisions.missing ? (
        <p className="text-sm text-danger" role="alert">
          {decisions.missing} student{decisions.missing === 1 ? " needs" : "s need"} a class in {data.toYear.name} — pick one above, or set them to leaving.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={<GraduationCap />}
          loading={promote.isPending}
          disabled={!decisions.rows.length || decisions.missing > 0}
          onClick={() => promote.mutate(decisions.rows)}
        >
          Save {decisions.rows.length} of {pendingCount} students
        </Button>
        <div className="ml-auto">
          <StepNav onBack={onBack} onNext={onNext} nextLabel={promote.data ? "Continue" : "Skip for now"} />
        </div>
      </div>
    </div>
  );
}

function buildDecisions(data: PromotionPreview, classTargets: Record<string, string>, actions: Record<string, PromotionAction>) {
  const rows: { studentId: string; action: PromotionAction; toClassId?: string }[] = [];
  let missing = 0;
  for (const cls of data.classes) {
    const classTarget = classTargets[cls.id] ?? (cls.isFinal ? GRADUATE : (cls.suggestedTargetId ?? ""));
    for (const s of cls.students) {
      if (s.alreadyMoved) continue;
      let action = actions[s.id] ?? s.suggested;
      if (action === "PROMOTE" && classTarget === GRADUATE) action = "GRADUATE";
      if (action === "GRADUATE" && classTarget !== GRADUATE) action = "PROMOTE";
      const d: Decision = { action };
      if (action === "PROMOTE") d.toClassId = classTarget || undefined;
      if (action === "REPEAT") d.toClassId = cls.repeatTargetId ?? undefined;
      if ((action === "PROMOTE" || action === "REPEAT") && !d.toClassId) {
        missing += 1;
        continue;
      }
      rows.push({ studentId: s.id, ...d });
    }
  }
  return { rows, missing };
}

function ClassCard({
  cls,
  targets,
  targetId,
  onTarget,
  actionOf,
  onAction,
}: {
  cls: PromotionPreviewClass;
  targets: PromotionPreview["targets"];
  targetId: string;
  onTarget: (id: string) => void;
  actionOf: (studentId: string, suggested: PromotionAction) => PromotionAction;
  onAction: (studentId: string, action: PromotionAction) => void;
}) {
  const graduating = targetId === GRADUATE;
  const actionOptions = (["PROMOTE", "REPEAT", "LEAVE"] as const)
    .filter((a) => a !== "REPEAT" || cls.repeatTargetId)
    .map((a) => ({ value: a === "PROMOTE" && graduating ? "GRADUATE" : a, label: PROMOTION_ACTION_LABEL[a === "PROMOTE" && graduating ? "GRADUATE" : a] }));
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-3">
        <CardTitle className="min-w-32">{cls.label}</CardTitle>
        <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        <div className="w-56">
          <FormSelect
            value={targetId || null}
            placeholder="Pick next class"
            onValueChange={(v) => v && onTarget(v)}
            options={[...targets.map((t) => ({ value: t.id, label: t.label })), { value: GRADUATE, label: "Graduates (leaves school)" }]}
          />
        </div>
        <span className="text-sm text-muted-foreground">{cls.students.length} students</span>
      </CardHeader>
      <CardContent>
        {!cls.students.length ? (
          <p className="text-sm text-muted-foreground">No students in this class.</p>
        ) : (
          <ul className="divide-y divide-line">
            {cls.students.map((s) => {
              const raw = actionOf(s.id, s.suggested);
              const action = raw === "PROMOTE" && graduating ? "GRADUATE" : raw === "GRADUATE" && !graduating ? "PROMOTE" : raw;
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.admissionNo} · Roll {s.rollNo || "—"}
                    </p>
                  </div>
                  {s.result ? (
                    <Badge tone={s.result.passed ? "success" : "danger"}>
                      {s.result.passed ? "Passed" : "Failed"} · {Math.round(s.result.percentage)}%{s.result.grade ? ` · ${s.result.grade}` : ""}
                    </Badge>
                  ) : (
                    <Badge>No annual result</Badge>
                  )}
                  <div className="w-40">
                    {s.alreadyMoved ? (
                      <Badge tone="indigo">Already moved</Badge>
                    ) : (
                      <FormSelect value={action} onValueChange={(v) => v && onAction(s.id, v as PromotionAction)} options={actionOptions} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function PromotionSummary({ result }: { result: PromotionResult }) {
  const parts = [
    [result.promoted, "promoted"],
    [result.repeated, "repeating"],
    [result.graduated, "graduated"],
    [result.left, "leaving"],
    [result.skipped, "skipped (already moved)"],
  ] as const;
  return (
    <div className="rounded-xl bg-success/10 px-3 py-2 text-sm" role="status">
      <p>{parts.filter(([n]) => n > 0).map(([n, label]) => `${n} ${label}`).join(" · ") || "No changes."}</p>
      {result.withoutFees ? (
        <p className="mt-1 text-orange">
          {result.withoutFees} student{result.withoutFees === 1 ? " is" : "s are"} in a class with no fee structure yet — add one under Fees → Fee structures.
        </p>
      ) : null}
    </div>
  );
}

function GoLiveStep({ target, active, onBack }: { target: AcademicYearSummary; active: AcademicYearSummary | null; onBack: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const check = useQuery({
    queryKey: academicYearKeys.closeCheck(active?.id ?? ""),
    queryFn: () => academicYearsApi.closeCheck(active!.id),
    enabled: Boolean(active),
    staleTime: 0,
  });
  const live = useMutation({
    mutationFn: () => academicYearsApi.activate(target.id, Boolean(active)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      await refreshSchoolContext();
      viewYear(target.id);
      navigate("/academics/years");
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>Make {target.name} the current year</CardTitle>
        <CardDescription>
          {active
            ? `${active.name} closes and becomes read-only. Its unpaid invoices stay payable and show as previous arrears on new challans.`
            : `${target.name} becomes the running year for admissions, attendance, exams and fees.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm">
          {target.name} has <strong>{target.counts.classes}</strong> classes and <strong>{target.counts.students}</strong> students.
        </p>
        {active && check.data?.items.length ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium">Still open in {active.name} (won't block going live):</p>
            <ul className="list-inside list-disc text-muted-foreground">
              {check.data.items.map((item) => (
                <li key={item.key}>
                  {item.label}: {item.count}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {live.error ? (
          <p className="text-sm text-danger" role="alert">
            {live.error.message}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button icon={<PlayCircle />} loading={live.isPending} onClick={() => live.mutate()}>
            {active ? `Close ${active.name} & start ${target.name}` : `Start ${target.name}`}
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StepNav({ onBack, onNext, nextLabel }: { onBack: () => void; onNext: () => void; nextLabel: string }) {
  return (
    <div className="flex gap-2">
      <Button variant="ghost" onClick={onBack}>
        Back
      </Button>
      <Button variant="secondary" icon={<ArrowRight />} onClick={onNext}>
        {nextLabel}
      </Button>
    </div>
  );
}
