import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "@wellrun/ui";
import { LockIcon, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { examKeys } from "@/lib/exams-api";
import { syllabusApi, syllabusKeys, type CoverageUnit } from "@/lib/syllabus-api";

/** Units with their topics as checkboxes. A unit checkbox selects or clears all of its topics. */
export function TopicTree({
  units,
  selected,
  onChange,
  disabled,
}: {
  units: CoverageUnit[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  disabled?: boolean;
}) {
  const [filter, setFilter] = useState("");
  const q = filter.trim().toLowerCase();
  const visible = units
    .map((u) => ({ ...u, topics: q ? u.topics.filter((t) => `${u.title} ${t.title}`.toLowerCase().includes(q)) : u.topics }))
    .filter((u) => u.topics.length);
  const total = units.reduce((n, u) => n + u.topics.length, 0);

  const toggle = (ids: string[], on: boolean) => {
    const next = new Set(selected);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-40 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Find a topic" className="h-9 pl-9" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a unit or topic" />
        </div>
        {!disabled ? (
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => toggle(units.flatMap((u) => u.topics.map((t) => t.id)), true)}>
              All
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange(new Set())}>
              None
            </Button>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-muted-foreground tabular-nums" aria-live="polite">
        {selected.size} of {total} topics selected
      </p>
      <ul className="flex flex-col gap-3">
        {visible.map((unit) => {
          const ids = unit.topics.map((t) => t.id);
          const picked = ids.filter((id) => selected.has(id)).length;
          return (
            <li key={unit.id} className="rounded-2xl bg-paper p-3">
              <label className="flex items-center gap-3 text-sm font-medium">
                <Checkbox checked={picked === ids.length} indeterminate={picked > 0 && picked < ids.length} disabled={disabled} onCheckedChange={(on) => toggle(ids, Boolean(on))} />
                <span className="min-w-0 flex-1 truncate">{unit.title}</span>
                {unit.termName ? <span className="text-xs font-normal text-muted-foreground">{unit.termName}</span> : null}
              </label>
              <ul className="mt-2 flex flex-col gap-1.5 pl-7">
                {unit.topics.map((t) => (
                  <li key={t.id}>
                    <label className="flex items-center gap-2.5 text-sm">
                      <Checkbox checked={selected.has(t.id)} disabled={disabled} onCheckedChange={(on) => toggle([t.id], Boolean(on))} />
                      <span className="min-w-0 flex-1">{t.title}</span>
                      {t.usedByExams > 0 ? (
                        <span title={`Already covered by ${t.usedByExams} exam paper${t.usedByExams === 1 ? "" : "s"}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <LockIcon className="size-3" aria-hidden /> {t.usedByExams}
                        </span>
                      ) : null}
                    </label>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
        {!visible.length ? <li className="py-4 text-center text-sm text-muted-foreground">No topics match.</li> : null}
      </ul>
    </div>
  );
}

function NoSyllabus({ gradeName, subject }: { gradeName: string; subject: string }) {
  return (
    <div className="rounded-2xl bg-paper p-5 text-sm">
      <p className="font-medium">
        No syllabus for {gradeName} {subject} yet
      </p>
      <p className="mt-1 text-muted-foreground">Create it first, then come back to choose what this exam covers.</p>
      <Button className="mt-3" size="sm" variant="outline" render={<Link to="/syllabus" />}>
        Open Syllabus
      </Button>
    </div>
  );
}

const LOCK_NOTE = "Topics covered by an exam are locked in the syllabus — they can't be edited or deleted while this coverage stays.";

/** Choose syllabus topics for a grade + subject while creating an exam. Returns the choice to the caller. */
export function WizardCoverageSheet({
  open,
  gradeName,
  subjectId,
  subjectName,
  value,
  onSave,
  onClose,
}: {
  open: boolean;
  gradeName: string;
  subjectId: string;
  subjectName: string;
  value: Set<string>;
  onSave: (next: Set<string>) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {open ? <WizardForm gradeName={gradeName} subjectId={subjectId} subjectName={subjectName} value={value} onSave={onSave} onClose={onClose} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function WizardForm({ gradeName, subjectId, subjectName, value, onSave, onClose }: Omit<Parameters<typeof WizardCoverageSheet>[0], "open">) {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: syllabusKeys.options(gradeName, subjectId), queryFn: () => syllabusApi.options(gradeName, subjectId) });
  const [selected, setSelected] = useState(new Set(value));
  return (
    <div className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>
          {gradeName} · {subjectName}
        </SheetTitle>
        <SheetDescription>What does this paper cover? Applies to every section of {gradeName}. {LOCK_NOTE}</SheetDescription>
      </SheetHeader>
      <div className="flex-1 px-4">
        {isPending ? (
          <LoadingState variant="list" />
        ) : isError || !data ? (
          <ErrorState title="Couldn't load the syllabus" description="Check your connection and try again." onRetry={() => void refetch()} />
        ) : !data.syllabusId || !data.units.length ? (
          <NoSyllabus gradeName={gradeName} subject={subjectName} />
        ) : (
          <TopicTree units={data.units} selected={selected} onChange={setSelected} />
        )}
      </div>
      <SheetFooter>
        <Button
          type="button"
          onClick={() => {
            onSave(selected);
            onClose();
          }}
        >
          Use {selected.size} {selected.size === 1 ? "topic" : "topics"}
        </Button>
      </SheetFooter>
    </div>
  );
}

/** Coverage of one existing exam paper: view it, and (admins, until marks are in review) change it. */
export function PaperCoverageSheet({ paperId, canEdit, onClose, onSaved }: { paperId: string | null; canEdit: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  return (
    <Sheet open={Boolean(paperId)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {paperId ? <PaperForm key={paperId} paperId={paperId} canEdit={canEdit} onClose={onClose} onSaved={onSaved} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function PaperForm({ paperId, canEdit, onClose, onSaved }: { paperId: string; canEdit: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: syllabusKeys.paperCoverage(paperId), queryFn: () => syllabusApi.paperCoverage(paperId) });
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [allSections, setAllSections] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (data && selected === null) setSelected(new Set(data.selected));
  }, [data, selected]);

  const editable = canEdit && data && !data.paper.frozen;
  const changed = useMemo(() => {
    if (!data || !selected) return false;
    return selected.size !== data.selected.length || data.selected.some((id) => !selected.has(id));
  }, [data, selected]);

  const save = useMutation({
    mutationFn: () => syllabusApi.setPaperCoverage(paperId, [...(selected ?? [])], allSections),
    onSuccess: async (out) => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: syllabusKeys.root }), queryClient.invalidateQueries({ queryKey: examKeys.root })]);
      onSaved(`Syllabus coverage saved${out.updated > 1 ? ` for ${out.updated} sections` : ""}${out.skipped ? ` (${out.skipped} skipped — marks already in review)` : ""}.`);
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save"),
  });

  return (
    <div className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>Syllabus coverage</SheetTitle>
        <SheetDescription>
          {data ? `${data.paper.examName} · ${data.paper.className} · ${data.paper.subject}. ` : ""}
          {LOCK_NOTE}
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-3 px-4">
        {isPending ? (
          <LoadingState variant="list" />
        ) : isError || !data ? (
          <ErrorState title="Couldn't load coverage" description="You may not have access to this paper." onRetry={() => void refetch()} />
        ) : (
          <>
            {data.paper.frozenReason ? <p className="rounded-2xl bg-orange/10 p-3 text-sm text-orange">{data.paper.frozenReason}</p> : null}
            {!data.syllabusId || !data.units.length ? (
              <NoSyllabus gradeName={data.paper.gradeName} subject={data.paper.subject} />
            ) : (
              <TopicTree units={data.units} selected={selected ?? new Set()} onChange={setSelected} disabled={!editable} />
            )}
            {editable && data.syllabusId ? (
              <div className="flex items-start justify-between gap-4 rounded-2xl bg-paper p-3">
                <div>
                  <label htmlFor="cov-all" className="text-sm font-medium">
                    Same for every section of {data.paper.gradeName}
                  </label>
                  <FieldDescription>Applies to the other sections' papers in this exam too.</FieldDescription>
                </div>
                <Switch id="cov-all" checked={allSections} onCheckedChange={setAllSections} />
              </div>
            ) : null}
            {error ? <FieldError>{error}</FieldError> : null}
          </>
        )}
      </div>
      {editable && data?.syllabusId ? (
        <SheetFooter>
          <Button type="button" disabled={!changed} loading={save.isPending} onClick={() => save.mutate()}>
            Save coverage
          </Button>
        </SheetFooter>
      ) : null}
    </div>
  );
}
