import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { suggestedCopies } from "@wellrun/shared";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { Minus, Plus, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isExamAdmin } from "@/components/exams/exam-ui";
import { PaperSheet } from "@/components/question-papers/paper-sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldDescription, FieldError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { questionPaperKeys, questionPapersApi, type QuestionPaperDetail } from "@/lib/question-papers-api";

/** Scoped print rules: A4, no app chrome, every copy starts on a fresh page. */
const PRINT_CSS = `
@page { size: A4; margin: 14mm; }
@media print {
  body { background: #fff !important; }
  [data-slot="sidebar-gap"], [data-slot="sidebar-container"] { display: none !important; }
  [data-slot="sidebar-inset"] { margin: 0 !important; padding: 0 !important; box-shadow: none !important; background: #fff !important; }
  .qp-print { display: block !important; }
}
`;

export function QuestionPaperPrintPage() {
  const { id = "" } = useParams();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: questionPaperKeys.detail(id), queryFn: () => questionPapersApi.detail(id), enabled: Boolean(id) });
  if (!isExamAdmin()) return <EmptyState title="Admins only" description="Only a school admin can print question papers." action={<Link to="/exams/question-papers" className="text-indigo">Back to question papers</Link>} />;
  if (isPending) return <LoadingState variant="form" />;
  if (isError || !data) return <ErrorState title="Couldn't open this paper" description="Check your connection and try again." onRetry={() => void refetch()} />;
  if (data.status !== "APPROVED") {
    return (
      <EmptyState
        title="This paper isn't approved yet"
        description="Only approved papers can be printed, so an unfinished paper never reaches the exam hall."
        action={<Link to={`/exams/question-papers/${data.id}`} className="text-indigo">Open the paper</Link>}
      />
    );
  }
  return <PrintView paper={data} />;
}

function PrintView({ paper }: { paper: QuestionPaperDetail }) {
  const queryClient = useQueryClient();
  const [copies, setCopies] = useState<Record<string, string>>(() => Object.fromEntries(paper.slots.map((s) => [s.classId, String(suggestedCopies(s.students))])));
  const [included, setIncluded] = useState<Set<string>>(() => new Set(paper.slots.map((s) => s.classId)));
  const [answerLines, setAnswerLines] = useState(true);
  const [studentLines, setStudentLines] = useState(true);
  const [keyMode, setKeyMode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const plan = useMemo(
    () =>
      paper.slots
        .filter((s) => included.has(s.classId))
        .map((s) => ({ slot: s, count: keyMode ? 1 : Math.max(0, Math.min(1000, Math.floor(Number(copies[s.classId])) || 0)) }))
        .filter((p) => p.count > 0),
    [paper.slots, included, copies, keyMode],
  );
  const total = plan.reduce((n, p) => n + p.count, 0);
  const students = paper.slots.filter((s) => included.has(s.classId)).reduce((n, s) => n + s.students, 0);

  const print = useMutation({
    mutationFn: () => questionPapersApi.recordPrint(paper.id, { copies: plan.map((p) => ({ classId: p.slot.classId, copies: p.count })), answerKey: keyMode }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: questionPaperKeys.root });
      setError(null);
      // Let the log land first, then open the browser's print dialog.
      window.setTimeout(() => window.print(), 50);
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't record the print"),
  });

  const bump = (classId: string, delta: number) => setCopies((c) => ({ ...c, [classId]: String(Math.max(1, (Number(c[classId]) || 0) + delta)) }));

  return (
    <div className="flex flex-col gap-6">
      <style>{PRINT_CSS}</style>
      <div className="print:hidden">
        <Link to={`/exams/question-papers/${paper.id}`} className="text-sm text-indigo">
          Back to the paper
        </Link>
        <PageHeader title={`Print · ${paper.gradeName} ${paper.subject.name}`} description={`${paper.exam.name} · ${paper.totalMarks} marks. Print as many copies as you need — extra copies are fine; every print is logged.`} />
      </div>

      <section className="grid gap-4 rounded-3xl bg-surface p-5 lg:grid-cols-[1.4fr_1fr] print:hidden" aria-label="Print settings">
        <div>
          <h2 className="font-display text-xl">{keyMode ? "Answer key" : "Copies per class"}</h2>
          {keyMode ? (
            <p className="mt-2 text-sm text-muted-foreground">One teacher's copy with correct options and model answers is printed for each selected class.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {paper.slots.map((s) => {
                const on = included.has(s.classId);
                const n = Number(copies[s.classId]) || 0;
                return (
                  <li key={s.classId} className={`flex flex-wrap items-center gap-3 rounded-2xl bg-paper px-3 py-2.5 ${on ? "" : "opacity-60"}`}>
                    <label className="flex min-w-36 flex-1 items-center gap-3">
                      <Checkbox
                        checked={on}
                        onCheckedChange={(checked) =>
                          setIncluded((current) => {
                            const next = new Set(current);
                            if (checked) next.add(s.classId);
                            else next.delete(s.classId);
                            return next;
                          })
                        }
                        aria-label={`Print for ${s.label}`}
                      />
                      <span>
                        <span className="block font-medium">{s.label}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">{s.students} students enrolled</span>
                      </span>
                    </label>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="outline" size="icon-sm" aria-label={`One fewer copy for ${s.label}`} disabled={!on} onClick={() => bump(s.classId, -1)}>
                        <Minus />
                      </Button>
                      <Input aria-label={`Copies for ${s.label}`} className="w-20 text-center tabular-nums" type="number" min={1} max={1000} value={copies[s.classId]} disabled={!on} onChange={(e) => setCopies((c) => ({ ...c, [s.classId]: e.target.value }))} />
                      <Button type="button" variant="outline" size="icon-sm" aria-label={`One more copy for ${s.label}`} disabled={!on} onClick={() => bump(s.classId, 1)}>
                        <Plus />
                      </Button>
                    </div>
                    <div className="w-28 text-xs text-muted-foreground tabular-nums">
                      {on && n > s.students ? `${n - s.students} spare` : on && n < s.students ? <span className="text-orange">{s.students - n} short</span> : on ? "exact" : ""}
                    </div>
                    <Button type="button" variant="ghost" size="sm" disabled={!on} onClick={() => setCopies((c) => ({ ...c, [s.classId]: String(suggestedCopies(s.students)) }))}>
                      Reset
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-xl">Options</h2>
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label htmlFor="opt-lines" className="text-sm font-medium">
                    Ruled answer lines
                  </label>
                  <FieldDescription>Print lines under each question for the student's answer.</FieldDescription>
                </div>
                <Switch id="opt-lines" checked={answerLines} onCheckedChange={setAnswerLines} disabled={keyMode} />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label htmlFor="opt-name" className="text-sm font-medium">
                    Name and roll number lines
                  </label>
                  <FieldDescription>For papers students write on directly.</FieldDescription>
                </div>
                <Switch id="opt-name" checked={studentLines} onCheckedChange={setStudentLines} disabled={keyMode} />
              </div>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <label htmlFor="opt-key" className="text-sm font-medium">
                    Print the answer key instead
                  </label>
                  <FieldDescription>A teacher's copy — keep it away from students.</FieldDescription>
                </div>
                <Switch id="opt-key" checked={keyMode} onCheckedChange={setKeyMode} />
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-paper p-4">
            <p className="font-display text-3xl tabular-nums">{total}</p>
            <p className="text-sm text-muted-foreground">
              {keyMode ? "answer key copies" : `copies for ${students} students`}
              {!keyMode && total > students ? ` (${total - students} spare)` : ""}
            </p>
            <Button className="mt-3 w-full" icon={<Printer />} disabled={!total} loading={print.isPending} onClick={() => print.mutate()}>
              Print {total || ""} {total === 1 ? "copy" : "copies"}
            </Button>
            {error ? <FieldError className="mt-2">{error}</FieldError> : null}
          </div>
        </div>
      </section>

      {!total ? (
        <p className="text-sm text-muted-foreground print:hidden">Pick at least one class with one or more copies to see the preview.</p>
      ) : (
        <div className="qp-print flex flex-col gap-6 print:gap-0">
          {plan.flatMap(({ slot, count }, classIndex) =>
            Array.from({ length: count }, (_, i) => (
              <div
                key={`${slot.classId}-${i}`}
                className={`mx-auto w-full max-w-[210mm] rounded-xl shadow-[0_12px_40px_rgba(22,22,29,0.12)] print:max-w-none print:rounded-none print:shadow-none ${classIndex > 0 || i > 0 ? "print:break-before-page" : ""} ${i > 0 ? "hidden print:block" : ""}`}
              >
                <PaperSheet paper={paper} slot={slot} options={{ answerLines: keyMode ? false : answerLines, studentLines: keyMode ? false : studentLines, answerKey: keyMode }} />
                {i === 0 && count > 1 ? <p className="rounded-b-xl bg-paper px-4 py-2 text-center text-xs text-muted-foreground print:hidden">{slot.label}: this page prints {count} times.</p> : null}
              </div>
            )),
          )}
        </div>
      )}
    </div>
  );
}
