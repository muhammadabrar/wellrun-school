import { useQuery } from "@tanstack/react-query";
import { EXAM_KIND_LABELS } from "@wellrun/shared";
import { Badge, EmptyState, ErrorState, LoadingState } from "@wellrun/ui";
import { FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TrendLine, fmtNum, formatDay, openPdf, ordinal, pct } from "@/components/exams/exam-ui";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { examKeys, examsApi, type StudentResults, type SubjectLine } from "@/lib/exams-api";

type Result = StudentResults["results"][number];

/** A student's results for one academic year: term/annual summaries, each exam's subjects, assessments and the trend. */
export function StudentResultsPanel({ studentId }: { studentId: string }) {
  const [yearId, setYearId] = useState<string | undefined>(undefined);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: examKeys.studentResults(studentId, yearId ?? "default"),
    queryFn: () => examsApi.studentResults(studentId, yearId),
  });

  const exams = useMemo(
    () => (data?.results ?? []).filter((r) => r.scope === "EXAM").sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "")),
    [data],
  );
  const summaries = (data?.results ?? []).filter((r) => r.scope !== "EXAM").sort((a, b) => (a.scope === "ANNUAL" ? 1 : b.scope === "ANNUAL" ? -1 : a.label.localeCompare(b.label)));
  const assessments = (data?.marks ?? []).filter((m) => m.kind !== "EXAM");
  const unapprovedExamPapers = (data?.marks ?? []).filter((m) => m.kind === "EXAM" && !m.approved).length;

  if (isPending) return <LoadingState variant="form" />;
  if (isError || !data) return <ErrorState title="Couldn't load results" description="Check your connection and try again." onRetry={() => void refetch()} />;

  async function reportCard(r: Result) {
    setPdfError(null);
    try {
      await openPdf(() => examsApi.reportCardUrl({ scope: r.scope, scopeId: r.scope === "ANNUAL" ? undefined : r.scopeKey, studentId, yearId: data?.yearId ?? undefined }));
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Couldn't create the report card");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">Results</h2>
          <p className="text-sm text-muted-foreground">{[data.className, data.rollNo && `Roll ${data.rollNo}`].filter(Boolean).join(" · ") || "Not enrolled this year"}</p>
        </div>
        {data.years.length > 1 ? (
          <div className="w-44">
            <FormSelect
              id="results-year"
              value={data.yearId}
              onValueChange={(v) => setYearId(v ?? undefined)}
              options={data.years.map((y) => ({ value: y.id, label: y.name }))}
            />
          </div>
        ) : null}
      </div>

      {!data.results.length && !data.marks.length ? (
        <EmptyState title="No results yet" description="Results appear here once exam marks are approved. Quizzes and assignments show as soon as marks are entered." />
      ) : null}

      {unapprovedExamPapers ? (
        <p className="rounded-2xl bg-orange/10 p-3 text-sm text-orange">
          {unapprovedExamPapers} exam {unapprovedExamPapers === 1 ? "paper is" : "papers are"} still being marked or verified and aren't in the results yet.
        </p>
      ) : null}

      {summaries.length ? (
        <section aria-labelledby="summary-results" className="flex flex-col gap-3">
          <h3 id="summary-results" className="sr-only">
            Term and annual results
          </h3>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summaries.map((r) => (
              <div key={r.id} className="rounded-2xl bg-paper p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium">{r.label}</p>
                  <Badge tone={r.passed ? "success" : "danger"}>{r.passed ? "Pass" : "Fail"}</Badge>
                </div>
                <p className="mt-2 font-display text-3xl tabular-nums">{pct(r.percentage)}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Grade {r.grade || "—"}
                  {r.rank ? ` · ${ordinal(r.rank)} in class` : ""}
                  {r.attendancePct != null ? ` · ${fmtNum(r.attendancePct)}% attendance` : ""}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{r.published ? "Published" : "Not published yet"}</span>
                  <Button size="sm" variant="outline" icon={<FileText />} onClick={() => void reportCard(r)}>
                    Report card
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {exams.length >= 2 ? (
        <section aria-labelledby="trend" className="rounded-2xl bg-paper p-4">
          <h3 id="trend" className="font-medium">
            Exam trend
          </h3>
          <TrendLine points={exams.map((e) => ({ label: e.label, value: e.percentage }))} />
        </section>
      ) : null}

      {exams.length ? (
        <section aria-labelledby="exam-results" className="flex flex-col gap-3">
          <h3 id="exam-results" className="font-display text-lg">
            Exams
          </h3>
          {[...exams].reverse().map((r, index) => (
            <details key={r.id} open={index === 0} className="group rounded-2xl bg-paper p-4">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDay(r.date)} · {r.className}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <span className="tabular-nums">
                    {fmtNum(r.totalObtained)}/{fmtNum(r.totalMax)}
                  </span>
                  <span className="font-display text-xl tabular-nums">{pct(r.percentage)}</span>
                  <span className="font-medium">{r.grade}</span>
                  {r.rank ? <span className="text-muted-foreground">{ordinal(r.rank)}</span> : null}
                  <Badge tone={r.passed ? "success" : "danger"}>{r.passed ? "Pass" : `Fail${r.failedSubjects ? ` (${r.failedSubjects})` : ""}`}</Badge>
                </div>
              </summary>
              <SubjectTable lines={r.subjects} />
              <div className="mt-3 flex justify-end">
                <Button size="sm" variant="ghost" icon={<FileText />} onClick={() => void reportCard(r)}>
                  Report card
                </Button>
              </div>
            </details>
          ))}
        </section>
      ) : null}

      {assessments.length ? (
        <section aria-labelledby="assessments" className="flex flex-col gap-2">
          <h3 id="assessments" className="font-display text-lg">
            Quizzes & assignments
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3 font-medium">Title</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Subject</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Marks</th>
                  <th scope="col" className="py-2 font-medium">%</th>
                </tr>
              </thead>
              <tbody>
                {assessments.map((m) => (
                  <tr key={m.paperId} className="border-t border-line">
                    <td className="py-2 pr-3">
                      {m.examName}
                      <span className="block text-xs text-muted-foreground">
                        {EXAM_KIND_LABELS[m.kind]}
                        {!m.approved ? " · not verified" : ""}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{m.subject}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatDay(m.date)}</td>
                    <td className="py-2 pr-3 tabular-nums">{m.attendance === "PRESENT" ? `${fmtNum(m.marks)}/${fmtNum(m.maxMarks)}` : m.attendance.toLowerCase()}</td>
                    <td className={`py-2 tabular-nums ${m.pct != null && m.marks != null && m.marks < m.passMarks ? "text-danger" : ""}`}>{pct(m.pct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {pdfError ? <p className="text-sm text-danger" role="alert">{pdfError}</p> : null}
      <p className="text-xs text-muted-foreground">
        Full analysis: <Link to={`/exams/analytics/student?studentId=${studentId}`} className="text-indigo">student performance</Link>.
      </p>
    </div>
  );
}

export function SubjectTable({ lines }: { lines: SubjectLine[] }) {
  const byMarks = lines.some((l) => l.attendance !== "MIXED");
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">Subject</th>
            {byMarks ? <th scope="col" className="py-1.5 pr-3 font-medium">Marks</th> : <th scope="col" className="py-1.5 pr-3 font-medium">Made up of</th>}
            <th scope="col" className="py-1.5 pr-3 font-medium">%</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">Grade</th>
            <th scope="col" className="py-1.5 font-medium">Result</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.subjectId} className="border-t border-line">
              <td className="py-1.5 pr-3">{l.name}</td>
              <td className="py-1.5 pr-3 tabular-nums">
                {byMarks
                  ? l.attendance === "ABSENT"
                    ? "Absent"
                    : l.pct == null
                      ? l.attendance === "PRESENT" ? "—" : l.attendance.toLowerCase()
                      : `${fmtNum(l.obtained)}/${fmtNum(l.max)}${l.grace ? ` (+${l.grace} grace)` : ""}`
                  : (l.parts ?? []).map((p) => `${p.label} ${pct(p.pct)}`).join(" · ")}
              </td>
              <td className="py-1.5 pr-3 tabular-nums">{pct(l.pct)}</td>
              <td className="py-1.5 pr-3 font-medium">{l.grade || "—"}</td>
              <td className={`py-1.5 ${l.pct != null && !l.passed ? "text-danger" : "text-muted-foreground"}`}>{l.pct == null ? "—" : l.passed ? "Pass" : "Fail"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
