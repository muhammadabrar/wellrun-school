import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { CopyIcon, ListChecksIcon, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Stat } from "@/components/exams/exam-ui";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { NewSyllabusSheet, type NewSyllabusTarget } from "@/components/syllabus/new-syllabus-sheet";
import { SyllabusStatusBadge, isSyllabusAdmin } from "@/components/syllabus/syllabus-ui";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { readSchoolContext, readYearId } from "@/lib/school-context";
import { syllabusApi, syllabusKeys, SYLLABUS_STATUS_LABEL } from "@/lib/syllabus-api";

export function SyllabusOverviewPage() {
  const admin = isSyllabusAdmin();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: syllabusKeys.overview(), queryFn: syllabusApi.overview });
  const [creating, setCreating] = useState<NewSyllabusTarget>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [fromYearId, setFromYearId] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  const otherYears = useMemo(() => (readSchoolContext()?.years ?? []).filter((y) => y.id !== readYearId()).sort((a, b) => b.startsOn.localeCompare(a.startsOn)), [data]);
  const copy = useMutation({
    mutationFn: () => syllabusApi.copyYear(fromYearId || otherYears[0]?.id),
    onSuccess: async (out) => {
      setCopyOpen(false);
      await queryClient.invalidateQueries({ queryKey: syllabusKeys.root });
      setToast(out.created ? `Copied ${out.created} syllabi (${out.topics} topics). ${out.skipped} skipped.` : "Nothing to copy — every matching syllabus already exists.");
    },
    onError: (err) => {
      setCopyOpen(false);
      setToast(err instanceof Error ? err.message : "Couldn't copy");
    },
  });

  if (isPending) return <LoadingState variant="metrics" />;
  if (isError || !data) return <ErrorState title="Couldn't load the syllabus overview" description="Check your connection and try again." onRetry={() => void refetch()} />;

  const subjectName = new Map(data.subjects.map((s) => [s.id, s.name]));
  const usedSubjects = data.subjects.filter((s) => data.grades.some((g) => g.cells.some((c) => c.subjectId === s.id)));
  const { summary } = data;
  const closed = data.year?.status === "CLOSED";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Syllabus"
        description={`Annual scheme of work for every class and subject — ${data.year?.name ?? "this academic year"}. Teachers and admins can edit it any time; topics an exam covers are locked.`}
        actions={
          <>
            <Button variant="outline" icon={<ListChecksIcon />} render={<Link to="/syllabus/list" />}>
              All syllabi
            </Button>
            {admin && !closed && otherYears.length ? (
              <Button variant="outline" icon={<CopyIcon />} onClick={() => setCopyOpen(true)}>
                Copy from another year
              </Button>
            ) : null}
          </>
        }
      />

      {closed ? <p className="rounded-2xl bg-orange/10 p-3 text-sm text-orange">{data.year?.name} is closed, so its syllabus is read-only. Re-open the year from Academic years to make changes.</p> : null}

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Syllabi created" value={`${summary.created}/${summary.slots}`} hint={summary.missing ? `${summary.missing} still to create` : "Every subject has one"} tone={summary.missing ? "warning" : "success"} />
        <Stat label="Topics taught" value={`${summary.taught}/${summary.topics}`} hint={summary.topics ? `${Math.round((summary.taught / summary.topics) * 100)}% of the year's plan` : undefined} />
        <Stat label="Behind schedule" value={summary.behind} hint={summary.behind ? <Link to="/syllabus/list?status=BEHIND" className="text-indigo">See which</Link> : "Everything on plan"} tone={summary.behind ? "warning" : undefined} />
        <Stat label="Locked for exams" value={summary.locked} hint="Topics covered by an exam" />
      </dl>

      {!data.grades.length ? (
        <EmptyState
          title="No classes with subjects yet"
          description="A syllabus belongs to a class and subject. Set up classes and their subjects first."
          action={
            <Button render={<Link to="/academics" />}>Classes & subjects</Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface p-2">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Syllabus status by class and subject</caption>
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Class</th>
                {usedSubjects.map((s) => (
                  <th key={s.id} scope="col" className="px-3 py-3 font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.grades.map((grade) => (
                <tr key={grade.name} className="border-t border-line align-top">
                  <th scope="row" className="px-3 py-3 text-left font-medium whitespace-nowrap">
                    {grade.name}
                    <span className="block text-xs font-normal text-muted-foreground">{grade.sections} {grade.sections === 1 ? "section" : "sections"}</span>
                  </th>
                  {usedSubjects.map((s) => {
                    const cell = grade.cells.find((c) => c.subjectId === s.id);
                    if (!cell) return <td key={s.id} className="px-3 py-3 text-muted-foreground" aria-label="Not taught">—</td>;
                    if (!cell.syllabusId) {
                      return (
                        <td key={s.id} className="px-3 py-3">
                          {cell.canEdit && !closed ? (
                            <Button size="sm" variant="outline" icon={<Plus />} onClick={() => setCreating({ gradeName: grade.name, subjectId: s.id, subjectName: subjectName.get(s.id) ?? "" })}>
                              Create
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">Not created</span>
                          )}
                        </td>
                      );
                    }
                    const stats = cell.stats;
                    return (
                      <td key={s.id} className="px-3 py-3">
                        <Link to={`/syllabus/${cell.syllabusId}`} className="group block rounded-xl p-1 -m-1 hover:bg-muted" title={cell.teachers.length ? `Teacher: ${cell.teachers.join(", ")}` : undefined}>
                          <span className="font-medium tabular-nums group-hover:underline">{stats ? `${stats.percent}%` : "0%"}</span>
                          <span className="ml-1 text-xs text-muted-foreground tabular-nums">of {stats?.topics ?? 0}</span>
                          {stats ? (
                            <span className="mt-1 block">
                              <SyllabusStatusBadge status={stats.status} />
                            </span>
                          ) : null}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Status: {Object.values(SYLLABUS_STATUS_LABEL).join(" · ")}. “Behind schedule” means a unit's planned end date has passed with topics not yet taught.
      </p>

      <NewSyllabusSheet target={creating} onClose={() => setCreating(null)} />
      <Dialog
        open={copyOpen}
        title="Copy syllabi from another year"
        description="Copies every syllabus whose class exists in this year and that doesn't have one yet. Units and topics come across; progress and exam links don't. Dates move to this year."
        confirmLabel="Copy syllabi"
        loading={copy.isPending}
        onClose={() => setCopyOpen(false)}
        onConfirm={() => copy.mutate()}
      >
        <Field>
          <FieldLabel htmlFor="copy-from">Copy from</FieldLabel>
          <FormSelect id="copy-from" value={fromYearId || otherYears[0]?.id || null} onValueChange={(v) => setFromYearId(v ?? "")} options={otherYears.map((y) => ({ value: y.id, label: y.name }))} />
          <FieldDescription>Existing syllabi in {data.year?.name} are never overwritten.</FieldDescription>
        </Field>
      </Dialog>
      <Toast message={toast} />
    </div>
  );
}
