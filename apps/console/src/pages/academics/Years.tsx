import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ACADEMIC_YEAR_STATUS_LABEL, nextYearDraft, type AcademicYearStatus } from "@wellrun/shared";
import { Badge, Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { CalendarPlus, Eye, Lock, Pencil, PlayCircle, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { formatDay } from "@/components/exams/exam-ui";
import { DatePicker } from "@/components/form/date-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useViewedYear } from "@/hooks/use-viewed-year";
import { academicYearKeys, academicYearsApi, type AcademicYearSummary } from "@/lib/academic-years-api";
import { pkr } from "@/lib/format";
import { refreshSchoolContext, viewYear } from "@/lib/school-context";

const STATUS_TONE: Record<AcademicYearStatus, "indigo" | "success" | "neutral"> = { PLANNING: "indigo", ACTIVE: "success", CLOSED: "neutral" };

type Pending = { kind: "close" | "activate" | "reopen" | "delete"; year: AcademicYearSummary };

export function AcademicYearsPage() {
  const queryClient = useQueryClient();
  const { year: viewed } = useViewedYear();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: academicYearKeys.list, queryFn: academicYearsApi.list });
  const [editing, setEditing] = useState<AcademicYearSummary | "new" | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const active = data?.find((y) => y.status === "ACTIVE") ?? null;
  const done = async () => {
    await refreshSchoolContext();
    await queryClient.invalidateQueries({ queryKey: academicYearKeys.list });
  };
  const action = useMutation({
    mutationFn: ({ kind, year }: Pending): Promise<unknown> => {
      if (kind === "close") return academicYearsApi.close(year.id);
      if (kind === "reopen") return academicYearsApi.reopen(year.id);
      if (kind === "delete") return academicYearsApi.remove(year.id);
      return academicYearsApi.activate(year.id, Boolean(active));
    },
    onSuccess: async (_res, { kind, year }) => {
      await done();
      if (kind === "activate" || kind === "reopen") viewYear(year.id);
      setPending(null);
    },
  });

  if (isPending) return <LoadingState variant="list" />;
  if (isError || !data) {
    return <ErrorState title="Could not load academic years" description="We couldn't retrieve your years. Please try again." onRetry={() => void refetch()} />;
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Academic years"
        description="Each year keeps its own classes, enrollments, fees, exams and attendance. Close a year when it ends to lock it as history."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<CalendarPlus />} onClick={() => setEditing("new")}>
              Add year
            </Button>
            {active ? (
              <Button icon={<Sparkles />} render={<Link to="/academics/years/new" />}>
                Start new year
              </Button>
            ) : null}
          </div>
        }
      />

      <LifecycleCard />

      {!data.length ? (
        <EmptyState
          title="No academic years yet"
          description="Classes, fees and exams all belong to a year. Add your current session to get started."
        />
      ) : (
        <ul className="space-y-3">
          {data.map((year) => (
            <YearRow
              key={year.id}
              year={year}
              viewing={viewed?.id === year.id}
              hasActive={Boolean(active)}
              onEdit={() => setEditing(year)}
              onAction={(kind) => {
                action.reset();
                setPending({ kind, year });
              }}
            />
          ))}
        </ul>
      )}

      <YearSheet
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        year={editing}
        latest={data[0] ?? null}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await done();
          setEditing(null);
        }}
      />

      <ActionDialog pending={pending} active={active} loading={action.isPending} error={action.error?.message ?? null} onConfirm={() => pending && action.mutate(pending)} onClose={() => setPending(null)} />
    </div>
  );
}

function LifecycleCard() {
  const steps = [
    { label: "Upcoming", text: "Prepare next session: add classes, fee structures and terms. Nothing is billed yet." },
    { label: "Current", text: "The running year. Only one at a time. New admissions, attendance, exams and invoices go here." },
    { label: "Closed", text: "Read-only history: report cards, attendance and fees stay viewable. Unpaid invoices can still be collected." },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle>How years work</CardTitle>
        <CardDescription>At the end of a session: add the next year, set it up, then make it current. The old year closes in the same step.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.label} className="rounded-xl bg-paper p-3">
              <p className="text-sm font-medium">
                {i + 1}. {step.label}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

function YearRow({
  year,
  viewing,
  hasActive,
  onEdit,
  onAction,
}: {
  year: AcademicYearSummary;
  viewing: boolean;
  hasActive: boolean;
  onEdit: () => void;
  onAction: (kind: Pending["kind"]) => void;
}) {
  const { counts } = year;
  const empty = !counts.classes && !counts.invoices && !counts.exams;
  return (
    <li className="flex flex-wrap items-center gap-4 rounded-3xl border border-line bg-surface p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-display text-xl">{year.name}</p>
          <Badge tone={STATUS_TONE[year.status]}>{ACADEMIC_YEAR_STATUS_LABEL[year.status]}</Badge>
          {viewing ? <Badge>Viewing</Badge> : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {formatDay(year.startsOn)} – {formatDay(year.endsOn)}
          {year.closedAt ? ` · closed ${formatDay(year.closedAt)}` : ""}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {counts.classes} classes · {counts.students} students · {counts.exams} exams · {counts.invoices} invoices
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!viewing ? (
          <Button size="sm" variant="ghost" icon={<Eye />} onClick={() => viewYear(year.id)}>
            View
          </Button>
        ) : null}
        {year.status !== "CLOSED" ? (
          <Button size="sm" variant="ghost" icon={<Pencil />} onClick={onEdit}>
            Edit
          </Button>
        ) : null}
        {year.status === "PLANNING" ? (
          <>
            {empty ? (
              <Button size="icon-sm" variant="ghost" aria-label={`Delete ${year.name}`} onClick={() => onAction("delete")}>
                <Trash2 />
              </Button>
            ) : null}
            <Button size="sm" icon={<PlayCircle />} onClick={() => onAction("activate")}>
              Make current
            </Button>
          </>
        ) : null}
        {year.status === "ACTIVE" ? (
          <Button size="sm" variant="secondary" icon={<Lock />} onClick={() => onAction("close")}>
            Close year
          </Button>
        ) : null}
        {year.status === "CLOSED" ? (
          <Button
            size="sm"
            variant="secondary"
            icon={<RotateCcw />}
            disabled={hasActive}
            title={hasActive ? "Close the current year before re-opening this one" : undefined}
            onClick={() => onAction("reopen")}
          >
            Re-open
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function ActionDialog({
  pending,
  active,
  loading,
  error,
  onConfirm,
  onClose,
}: {
  pending: Pending | null;
  active: AcademicYearSummary | null;
  loading: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // Closing (directly, or as part of making another year current) shows what's still open in the year being closed.
  const closing = pending?.kind === "close" ? pending.year : pending?.kind === "activate" ? active : null;
  const check = useQuery({
    queryKey: academicYearKeys.closeCheck(closing?.id ?? ""),
    queryFn: () => academicYearsApi.closeCheck(closing!.id),
    enabled: Boolean(closing),
    staleTime: 0,
  });
  if (!pending) return null;
  const { kind, year } = pending;
  const copy = {
    close: { title: `Close ${year.name}?`, description: "The year becomes read-only. You can re-open it later if something needs fixing.", confirm: "Close year" },
    activate: active
      ? { title: `Make ${year.name} current?`, description: `${active.name} will be closed and become read-only. ${year.name} becomes the running year.`, confirm: `Close ${active.name} & start ${year.name}` }
      : { title: `Make ${year.name} current?`, description: "It becomes the running year for admissions, attendance, exams and fees.", confirm: "Make current" },
    reopen: { title: `Re-open ${year.name}?`, description: "It becomes the current year again and its records can be edited. Close it again when you're done.", confirm: "Re-open" },
    delete: { title: `Delete ${year.name}?`, description: "This upcoming year has no classes, fees or exams yet, so nothing else is removed.", confirm: "Delete" },
  }[kind];

  return (
    <Dialog open title={copy.title} description={copy.description} confirmLabel={copy.confirm} danger={kind === "delete"} loading={loading} onConfirm={onConfirm} onClose={onClose}>
      {closing ? (
        <div className="space-y-2 text-sm">
          {check.isPending ? (
            <p className="text-muted-foreground">Checking {closing.name}…</p>
          ) : check.isError ? (
            <p className="text-muted-foreground">Couldn't run the year-end check. You can still continue.</p>
          ) : check.data.items.length ? (
            <>
              <p className="font-medium">Still open in {closing.name}:</p>
              <ul className="space-y-1 rounded-xl bg-paper p-3">
                {check.data.items.map((item) => (
                  <li key={item.key} className="flex justify-between gap-3">
                    <span>{item.label}</span>
                    <span className="font-medium tabular-nums">{item.amountPkr != null ? `${item.count} · ${pkr(item.amountPkr)}` : item.count}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground">These don't block closing — they're here so nothing is forgotten.</p>
            </>
          ) : (
            <p className="text-muted-foreground">Everything in {closing.name} looks complete.</p>
          )}
        </div>
      ) : null}
      {error ? (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}

function YearSheet({
  year,
  latest,
  onClose,
  onSaved,
}: {
  year: AcademicYearSummary | "new" | null;
  latest: AcademicYearSummary | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const existing = year && year !== "new" ? year : null;
  const draft = existing ? { name: existing.name, startsOn: existing.startsOn.slice(0, 10), endsOn: existing.endsOn.slice(0, 10) } : nextYearDraft(latest);
  const [name, setName] = useState(draft.name);
  const [startsOn, setStartsOn] = useState(draft.startsOn);
  const [endsOn, setEndsOn] = useState(draft.endsOn);
  const save = useMutation({
    mutationFn: () => {
      const payload = { name: name.trim(), startsOn, endsOn };
      return existing ? academicYearsApi.update(existing.id, payload) : academicYearsApi.create(payload);
    },
    onSuccess: onSaved,
  });
  const invalidRange = endsOn <= startsOn;
  const toYear = new Date().getFullYear() + 3;

  return (
    <Sheet open={Boolean(year)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle className="font-display text-2xl">{existing ? `Edit ${existing.name}` : "Add academic year"}</SheetTitle>
          <SheetDescription>
            {existing ? "Change the session name or dates." : "New years start as upcoming, so you can set up classes and fees before switching over."}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-5 px-4 pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field>
            <FieldLabel htmlFor="year-name">Name</FieldLabel>
            <Input id="year-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={40} />
            <FieldDescription>Shown in the year switcher, on report cards and challans, e.g. 2027-28.</FieldDescription>
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
          {invalidRange ? (
            <p className="text-sm text-danger" role="alert">
              End date must be after the start date.
            </p>
          ) : null}
          {save.error ? (
            <p className="text-sm text-danger" role="alert">
              {save.error.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button type="submit" loading={save.isPending} disabled={!name.trim() || invalidRange}>
              {existing ? "Save changes" : "Add year"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
