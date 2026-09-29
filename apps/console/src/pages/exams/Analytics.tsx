import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { useEffect, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClassSelect, GradeSpread, PercentBars, Stat, TrendLine, pct, scopeFromString, scopeToString } from "@/components/exams/exam-ui";
import { FormSelect } from "@/components/form/form-select";
import { Label } from "@/components/ui/label";
import { examKeys, examsApi, type ResultScopeOption } from "@/lib/exams-api";

/** Scope picker limited to result sets that have been calculated. */
function useAnalyticsScope() {
  const [params, setParams] = useSearchParams();
  const scopes = useQuery({ queryKey: examKeys.scopes(), queryFn: examsApi.scopes });
  const scope = scopeFromString(params.get("scope"));
  useEffect(() => {
    if (!scope && scopes.data?.length) {
      const next = new URLSearchParams(params);
      next.set("scope", scopeToString(scopes.data[0]));
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopes.data]);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  return { scopes, scope, params, set, query: scope ? { scope: scope.scope, scopeId: scope.scope === "ANNUAL" ? undefined : scope.scopeId } : null };
}

function ScopePicker({ options, value, onChange }: { options: ResultScopeOption[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex w-64 flex-col gap-2">
      <Label htmlFor="analytics-scope">Results for</Label>
      <FormSelect id="analytics-scope" value={value || null} onValueChange={(v) => onChange(v ?? "")} options={options.map((o) => ({ value: scopeToString(o), label: o.label }))} placeholder="Pick a result" />
    </div>
  );
}

function NoResults() {
  return (
    <EmptyState
      title="No results to analyse yet"
      description="Analytics use calculated results. Approve marks, then generate results on the Class results page."
    />
  );
}

export function ClassPerformancePage() {
  const a = useAnalyticsScope();
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: examKeys.analytics("classes", a.query ?? {}),
    queryFn: () => examsApi.classPerformance(a.query ?? {}),
    enabled: Boolean(a.query),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Class performance" description="How each class and section did — averages, pass rates and grade spread." />
      <div className="rounded-3xl bg-surface p-4">
        <ScopePicker options={a.scopes.data ?? []} value={scopeToString(a.scope)} onChange={(v) => a.set("scope", v)} />
      </div>
      <FetchingIndicator show={isFetching && !isPending} label="Updating" />
      {a.scopes.isPending || (a.query && isPending) ? (
        <LoadingState variant="metrics" />
      ) : !a.scopes.data?.length ? (
        <NoResults />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load analytics" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Students" value={data.overall.students} />
            <Stat label="School average" value={pct(data.overall.avg)} hint={`Median ${pct(data.overall.median)}`} />
            <Stat label="Pass rate" value={pct(data.overall.passPct)} />
            <Stat label="Highest" value={pct(data.overall.high)} />
          </dl>
          <section className="rounded-3xl bg-surface p-5" aria-labelledby="class-avg">
            <h2 id="class-avg" className="font-display text-xl">
              Average by class
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">The line marks the school average.</p>
            <PercentBars threshold={data.overall.avg ?? undefined} rows={data.classes.map((c) => ({ id: c.classId, label: c.label, value: c.avg, detail: `${c.passPct}% passed` }))} />
          </section>
          <div className="overflow-x-auto rounded-3xl bg-surface p-2">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">Class</th>
                  <th scope="col" className="px-3 py-3 font-medium">Students</th>
                  <th scope="col" className="px-3 py-3 font-medium">Average</th>
                  <th scope="col" className="px-3 py-3 font-medium">Pass rate</th>
                  <th scope="col" className="px-3 py-3 font-medium">Topper</th>
                  <th scope="col" className="w-1/3 px-3 py-3 font-medium">Grades</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => (
                  <tr key={c.classId} className="border-t border-line align-top">
                    <td className="px-3 py-3">
                      <Link to={`/exams/results/class?scope=${scopeToString(a.scope)}&classId=${c.classId}`} className="font-medium hover:underline">
                        {c.label}
                      </Link>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{c.students}</td>
                    <td className="px-3 py-3 tabular-nums">{pct(c.avg)}</td>
                    <td className={`px-3 py-3 tabular-nums ${c.failed ? "" : "text-success"}`}>
                      {pct(c.passPct)}
                      {c.failed ? <span className="block text-xs text-danger">{c.failed} failed</span> : null}
                    </td>
                    <td className="px-3 py-3">
                      {c.topper ? (
                        <Link to={`/students/${c.topper.studentId}?tab=results`} className="hover:underline">
                          {c.topper.name} <span className="text-muted-foreground">{pct(c.topper.percentage)}</span>
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <GradeSpread grades={c.grades} order={[...data.gradeLabels].sort()} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function SubjectPerformancePage() {
  const a = useAnalyticsScope();
  const classId = a.params.get("classId") ?? "";
  const context = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context });
  const query = a.query ? { ...a.query, classId: classId || undefined } : null;
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: examKeys.analytics("subjects", query ?? {}),
    queryFn: () => examsApi.subjectPerformance(query ?? {}),
    enabled: Boolean(query),
    placeholderData: keepPreviousData,
  });
  const subjectIds = data?.subjects.map((s) => s.subjectId) ?? [];
  const subjectName = new Map((data?.subjects ?? []).map((s) => [s.subjectId, s.name]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Subject performance" description="Which subjects students find hardest, and how each class did in each subject." />
      <div className="flex flex-wrap items-end gap-3 rounded-3xl bg-surface p-4">
        <ScopePicker options={a.scopes.data ?? []} value={scopeToString(a.scope)} onChange={(v) => a.set("scope", v)} />
        <ClassSelect id="subject-class" value={classId} onChange={(v) => a.set("classId", v)} classes={context.data?.classes ?? []} allowAll="All classes" />
      </div>
      <FetchingIndicator show={isFetching && !isPending} label="Updating" />
      {a.scopes.isPending || (query && isPending) ? (
        <LoadingState variant="metrics" />
      ) : !a.scopes.data?.length ? (
        <NoResults />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load analytics" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data.subjects.length ? (
        <EmptyState title="No subject results" description="No marks were counted for this selection." />
      ) : (
        <>
          <section className="rounded-3xl bg-surface p-5" aria-labelledby="subject-avg">
            <h2 id="subject-avg" className="font-display text-xl">
              Average by subject
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">Lowest first — these need the most attention.</p>
            <PercentBars rows={data.subjects.map((s) => ({ id: s.subjectId, label: s.name, value: s.avg, detail: `${s.passPct}% passed · ${s.failed} failed` }))} />
          </section>
          <div className="overflow-x-auto rounded-3xl bg-surface p-2">
            <table className="w-full text-left text-sm">
              <caption className="px-3 py-2 text-left text-sm text-muted-foreground">Class × subject averages, with the subject teacher where assigned.</caption>
              <thead className="text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-3 font-medium">Class</th>
                  {subjectIds.map((id) => (
                    <th key={id} scope="col" className="px-3 py-3 text-center font-medium">
                      {subjectName.get(id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.matrix.map((row) => (
                  <tr key={row.classId} className="border-t border-line">
                    <th scope="row" className="px-3 py-2 text-left font-medium">
                      {row.label}
                    </th>
                    {subjectIds.map((id) => {
                      const cell = row.cells[id];
                      const avg = cell?.avg ?? null;
                      return (
                        <td
                          key={id}
                          className="px-3 py-2 text-center tabular-nums"
                          style={avg != null ? { background: `color-mix(in oklch, #4642ff ${Math.round((avg / 100) * 35)}%, transparent)` } : undefined}
                          title={cell?.teacher ? `Teacher: ${cell.teacher}` : undefined}
                        >
                          {pct(avg)}
                          {cell?.teacher ? <span className="block text-[10px] text-muted-foreground">{cell.teacher}</span> : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

export function StudentPerformancePage() {
  const [params, setParams] = useSearchParams();
  const studentId = params.get("studentId") ?? "";
  const classId = params.get("classId") ?? "";
  const context = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context });
  const atRiskQuery = { classId: classId || undefined };
  const atRisk = useQuery({
    queryKey: examKeys.analytics("at-risk", atRiskQuery),
    queryFn: () => examsApi.atRisk(atRiskQuery),
    enabled: !studentId,
    placeholderData: keepPreviousData,
  });
  const trend = useQuery({ queryKey: examKeys.analytics("student", { studentId }), queryFn: () => examsApi.studentTrend(studentId), enabled: Boolean(studentId) });
  const trendPoints = useMemo(() => (trend.data?.trend ?? []).map((t) => ({ label: t.exam, value: t.percentage })), [trend.data]);

  if (studentId) {
    return (
      <div className="flex flex-col gap-6">
        <button type="button" className="self-start text-sm text-indigo" onClick={() => setParams({})}>
          Back to students needing attention
        </button>
        <PageHeader title="Student performance" description="Exam-by-exam progress, overall and per subject." actions={<Link to={`/students/${studentId}?tab=results`} className="text-sm text-indigo">Open profile</Link>} />
        {trend.isPending ? (
          <LoadingState variant="metrics" />
        ) : trend.isError || !trend.data ? (
          <ErrorState title="Couldn't load this student" description="Check your connection and try again." onRetry={() => void trend.refetch()} />
        ) : !trend.data.trend.length ? (
          <EmptyState title="No exam results yet" description="Trends appear once this student has calculated exam results this year." />
        ) : (
          <>
            <section className="rounded-3xl bg-surface p-5">
              <h2 className="font-display text-xl">Overall</h2>
              <TrendLine points={trendPoints} height={180} />
            </section>
            <div className="overflow-x-auto rounded-3xl bg-surface p-2">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-medium">Subject</th>
                    {trend.data.trend.map((t) => (
                      <th key={t.examId} scope="col" className="px-3 py-3 text-center font-medium">
                        {t.exam}
                      </th>
                    ))}
                    <th scope="col" className="px-3 py-3 text-center font-medium">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.data.subjects.map((s) => {
                    const values = s.points.filter((v): v is number => v != null);
                    const change = values.length >= 2 ? values[values.length - 1] - values[0] : null;
                    return (
                      <tr key={s.subjectId} className="border-t border-line">
                        <th scope="row" className="px-3 py-2 text-left font-medium">
                          {s.name}
                        </th>
                        {s.points.map((v, i) => (
                          <td key={i} className="px-3 py-2 text-center tabular-nums">
                            {pct(v)}
                          </td>
                        ))}
                        <td className={`px-3 py-2 text-center tabular-nums ${change == null ? "" : change < 0 ? "text-danger" : "text-success"}`}>
                          {change == null ? "—" : `${change > 0 ? "+" : ""}${change.toFixed(1)}`}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="border-t border-line font-medium">
                    <th scope="row" className="px-3 py-2 text-left">
                      Overall
                    </th>
                    {trend.data.trend.map((t) => (
                      <td key={t.examId} className="px-3 py-2 text-center tabular-nums">
                        {pct(t.percentage)} <span className="text-xs text-muted-foreground">{t.grade}</span>
                      </td>
                    ))}
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Student performance" description="Students who need attention: below the school's threshold, failed their latest exam, or dropped 10+ points." />
      <div className="rounded-3xl bg-surface p-4">
        <ClassSelect id="risk-class" value={classId} onChange={(v) => setParams(v ? { classId: v } : {}, { replace: true })} classes={context.data?.classes ?? []} allowAll="All classes" />
      </div>
      <FetchingIndicator show={atRisk.isFetching && !atRisk.isPending} label="Updating" />
      {atRisk.isPending ? (
        <LoadingState variant="table" />
      ) : atRisk.isError || !atRisk.data ? (
        <ErrorState title="Couldn't load students" description="Check your connection and try again." onRetry={() => void atRisk.refetch()} />
      ) : !atRisk.data.atRisk.length ? (
        <EmptyState title="No one needs attention" description={`No student is below ${atRisk.data.threshold}%, failing or dropping sharply in the latest exams.`} />
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Student</th>
                <th scope="col" className="px-3 py-3 font-medium">Latest exam</th>
                <th scope="col" className="px-3 py-3 font-medium">Score</th>
                <th scope="col" className="px-3 py-3 font-medium">Why</th>
                <th scope="col" className="px-3 py-3 font-medium">Weak subjects</th>
              </tr>
            </thead>
            <tbody>
              {atRisk.data.atRisk.map((s) => (
                <tr key={s.studentId} className="border-t border-line align-top">
                  <td className="px-3 py-2.5">
                    <button type="button" className="font-medium hover:underline" onClick={() => setParams({ studentId: s.studentId })}>
                      {s.name}
                    </button>
                    <span className="block text-xs text-muted-foreground">
                      {s.className} · {s.admissionNo}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">{s.latestExam}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {pct(s.percentage)} <span className="text-xs text-muted-foreground">{s.grade}</span>
                    {s.previous != null ? <span className="block text-xs text-muted-foreground">was {pct(s.previous)}</span> : null}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {s.reasons.map((r) => (
                        <Badge key={r} tone={r === "Failed" ? "danger" : "warning"}>
                          {r}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{s.weakSubjects.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
