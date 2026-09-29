import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { TimePicker } from "@/components/form/time-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { api, type TimetablePeriod } from "@/lib/api";

type Draft = { label: string; startTime: string; endTime: string; isBreak: boolean };

function addMinutes(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function BellScheduleSheet({
  open,
  periods,
  onClose,
  onChanged,
}: {
  open: boolean;
  periods: TimetablePeriod[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const last = periods[periods.length - 1];
  const nextStart = last?.endTime ?? "08:00";
  const teachingCount = periods.filter((period) => !period.isBreak).length;

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader className="pr-12">
          <SheetTitle className="font-display text-2xl">Bell schedule</SheetTitle>
          <SheetDescription>
            The periods every class follows. Changes apply to all classes on all days.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {periods.map((period) => (
            <PeriodRow key={`${period.id}-${period.startTime}-${period.endTime}-${period.label}-${period.isBreak}`} period={period} onSaved={onChanged} />
          ))}
          <NewPeriodRow
            key={`new-${periods.length}-${nextStart}`}
            defaults={{ label: `Period ${teachingCount + 1}`, startTime: nextStart, endTime: addMinutes(nextStart, 40), isBreak: false }}
            sortOrder={(last?.sortOrder ?? 0) + 1}
            onSaved={onChanged}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PeriodFields({ draft, setDraft, idPrefix }: { draft: Draft; setDraft: (next: Draft) => void; idPrefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-[1fr_8.5rem_8.5rem_auto] sm:items-end">
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-label`}>Name</FieldLabel>
        <Input id={`${idPrefix}-label`} value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-start`}>Starts</FieldLabel>
        <TimePicker id={`${idPrefix}-start`} value={draft.startTime} onChange={(startTime) => setDraft({ ...draft, startTime })} />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-end`}>Ends</FieldLabel>
        <TimePicker id={`${idPrefix}-end`} value={draft.endTime} onChange={(endTime) => setDraft({ ...draft, endTime })} />
      </Field>
      <Field orientation="horizontal" className="h-10 w-auto">
        <Switch id={`${idPrefix}-break`} checked={draft.isBreak} onCheckedChange={(isBreak) => setDraft({ ...draft, isBreak })} />
        <FieldLabel htmlFor={`${idPrefix}-break`} className="font-normal">
          Break
        </FieldLabel>
      </Field>
    </div>
  );
}

function validate(draft: Draft) {
  if (!draft.label.trim()) return "Give this period a name.";
  if (draft.endTime <= draft.startTime) return "The end time must be after the start time.";
  return null;
}

function PeriodRow({ period, onSaved }: { period: TimetablePeriod; onSaved: () => Promise<void> | void }) {
  const initial: Draft = { label: period.label, startTime: period.startTime, endTime: period.endTime, isBreak: period.isBreak };
  const [draft, setDraft] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const save = useMutation({
    mutationFn: () => api.updatePeriod(period.id, { ...draft, label: draft.label.trim() }),
    onSuccess: () => onSaved(),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save this period."),
  });
  const remove = useMutation({
    mutationFn: () => api.removePeriod(period.id),
    onSuccess: () => onSaved(),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not remove this period."),
  });

  if (confirming) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-3" role="alert">
        <p className="text-sm">
          Remove <span className="font-medium">{period.label}</span>? Its lessons are removed from every class.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirming(false)}>
            Keep
          </Button>
          <Button type="button" variant="destructive" size="sm" loading={remove.isPending} onClick={() => remove.mutate()}>
            Remove period
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-line p-3 ${draft.isBreak ? "bg-muted/50" : ""}`}>
      <PeriodFields draft={draft} setDraft={setDraft} idPrefix={`period-${period.id}`} />
      {draft.isBreak && !period.isBreak ? (
        <p className="mt-2 text-xs text-muted-foreground">Turning this into a break removes the lessons placed in it.</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" icon={<Trash2 />} onClick={() => setConfirming(true)}>
          Remove
        </Button>
        {dirty ? (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setDraft(initial)}>
              Undo
            </Button>
            <Button
              type="button"
              size="sm"
              loading={save.isPending}
              onClick={() => {
                const problem = validate(draft);
                setError(problem);
                if (!problem) save.mutate();
              }}
            >
              Save
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function NewPeriodRow({ defaults, sortOrder, onSaved }: { defaults: Draft; sortOrder: number; onSaved: () => Promise<void> | void }) {
  const [draft, setDraft] = useState(defaults);
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.savePeriod({ ...draft, label: draft.label.trim(), sortOrder }),
    onSuccess: () => onSaved(),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not add this period."),
  });

  return (
    <div className="rounded-2xl border border-dashed border-line p-3">
      <p className="mb-3 text-sm font-medium">Add a period</p>
      <PeriodFields draft={draft} setDraft={setDraft} idPrefix="period-new" />
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex justify-end">
        <Button
          type="button"
          size="sm"
          loading={save.isPending}
          onClick={() => {
            const problem = validate(draft);
            setError(problem);
            if (!problem) save.mutate();
          }}
        >
          Add period
        </Button>
      </div>
    </div>
  );
}
