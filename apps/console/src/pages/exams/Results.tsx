import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Dialog, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { CircleAlert, Download, Eye, EyeOff, FileText, Printer, RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ClassSelect,
  GradeSpread,
  ScopeSelect,
  Stat,
  fmtNum,
  formatDay,
  isExamAdmin,
  openPdf,
  ordinal,
  pct,
  scopeFromString,
  scopeToString,
  type ScopeValue,
} from "@/components/exams/exam-ui";
import { FormSelect } from "@/components/form/form-select";
import { StudentResultsPanel } from "@/components/students/student-results-panel";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { examKeys, examsApi, type ClassResults } from "@/lib/exams-api";
import { queryKeys } from "@/lib/query";

/** Scope (exam / term / year) and class from the URL, plus the options for both pickers. */
function useResultPickers() {
  const [params, setParams] = useSearchParams();
  const context = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context });
  const examQuery = { kind: "EXAM" };
  const exams = useQuery({ queryKey: examKeys.list(examQuery), queryFn: () => examsApi.list(examQuery) });
  const scope = scopeFromString(params.get("scope"));
  const classId = params.get("classId") ?? "";
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  // Default to the latest exam with approved papers, and the first class.
  useEffect(() => {
    if (!scope && exams.data?.length) {
      const withMarks = exams.data.find((e) => e.paperStatus.APPROVED > 0) ?? exams.data[0];
      set("scope", `EXAM:${withMarks.id}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exams.data]);
  useEffect(() => {
    if (!classId && context.data?.classes.length) set("classId", context.data.classes[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.data]);
  const scopeQuery = scope ? { scope: scope.scope, scopeId: scope.scope === "ANNUAL" ? undefined : scope.scopeId } : null;
  return {
    context,
    exams: exams.data ?? [],
    terms: context.data?.terms ?? [],
    classes: context.data?.classes ?? [],
    scope,
    scopeQuery,
    classId,
    setScope: (value: ScopeValue | null) => set("scope", scopeToString(value)),
    setClassId: (value: string) => set("classId", value),
    loading: context.isPending || exams.isPending,
  };
}

function Pickers({ p, children }: { p: ReturnType<typeof useResultPickers>; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl bg-surface p-4 print:hidden">
      <div className="flex flex-wrap items-end gap-3">
        <ScopeSelect id="result-scope" value={p.scope} onChange={p.setScope} exams={p.exams} terms={p.terms} />
        <ClassSelect id="result-class" value={p.classId} onChange={p.setClassId} classes={p.classes} />
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

function useClassResults(p: ReturnType<typeof useResultPickers>) {
  const query = { ...(p.scopeQuery ?? {}), classId: p.classId };
  return useQuery({
    queryKey: examKeys.classResults(query),
    queryFn: () => examsApi.classResults(query),
    enabled: Boolean(p.scopeQuery && p.classId),
    placeholderData: keepPreviousData,
  });
}

function ResultActions({ p, data, onToast }: { p: ReturnType<typeof useResultPickers>; data?: ClassResults; onToast: (m: string) => void }) {
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | null>(null);
  const payload = { ...(p.scopeQuery ?? { scope: "EXAM" as const }), classIds: p.classId ? [p.classId] : undefined };
  const compute = useMutation({
    mutationFn: () => examsApi.compute(payload),
    onSuccess: async (out) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      onToast(out.students ? `Results calculated for ${out.students} students.` : "No approved marks yet for this selection.");
    },
    onError: (err) => onToast(err instanceof Error ? err.message : "Couldn't calculate results"),
  });
  const publish = useMutation({
    mutationFn: (on: boolean) => examsApi.publish({ ...payload, publish: on }),
    onSuccess: async (_o, on) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      setConfirm(null);
      onToast(on ? "Results published." : "Results unpublished.");
    },
    onError: (err) => {
      setConfirm(null);
      onToast(err instanceof Error ? err.message : "Couldn't update");
    },
  });
  if (!isExamAdmin() || !p.scopeQuery) return null;
  return (
    <>
      <Button variant="outline" icon={<RefreshCw />} loading={compute.isPending} onClick={() => compute.mutate()}>
        {data?.rows.length ? "Recalculate" : "Generate results"}
      </Button>
      {data?.rows.length ? (
        data.published ? (
          <Button variant="outline" icon={<EyeOff />} onClick={() => setConfirm("unpublish")}>
            Unpublish
          </Button>
        ) : (
          <Button icon={<Eye />} onClick={() => setConfirm("publish")}>
            Publish
          </Button>
        )
      ) : null}
      <Dialog
        open={confirm === "publish"}
        title="Publish these results?"
        description="Results are marked as published and appear as final on report cards and student profiles. You can unpublish later."
        confirmLabel="Publish"
        loading={publish.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => publish.mutate(true)}
      />
      <Dialog
        open={confirm === "unpublish"}
        title="Unpublish these results?"
        description="They go back to draft. Nothing is deleted."
        confirmLabel="Unpublish"
        loading={publish.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => publish.mutate(false)}
      />
    </>
  );
}

function PendingNotice({ data }: { data?: ClassResults }) {
  if (!data?.pendingPapers) return null;
  return (
    <p className="flex items-start gap-2 rounded-2xl bg-orange/10 p-3 text-sm text-orange">
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      {data.pendingPapers} {data.pendingPapers === 1 ? "paper isn't" : "papers aren't"} approved yet, so {data.pendingPapers === 1 ? "it's" : "they're"} not counted.{" "}
      {isExamAdmin() ? (
        <Link to="/exams/marks/pending" className="underline">
          Review pending marks
        </Link>
      ) : null}
    </p>
  );
}

export function ClassResultsPage() {
  const p = useResultPickers();
  const { data, isPending, isFetching, isError, refetch } = useClassResults(p);
  const [toast, setToast] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, { teacherRemark?: string; principalRemark?: string }>>({});
  const queryClient = useQueryClient();
  const admin = isExamAdmin();
  const saveRemarks = useMutation({
    mutationFn: () => examsApi.saveRemarks(Object.entries(remarks).map(([resultId, r]) => ({ resultId, ...r }))),
    onSuccess: async (out) => {
      setRemarks({});
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      setToast(`${out.saved} remarks saved.`);
    },
  });
  const gradeOrder = useMemo(() => Object.keys(data?.summary.grades ?? {}).sort(), [data]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Class results" description="Ranked results for a class. Calculate after marks are approved, add remarks, then publish." />
      <Pickers p={p}>
        <ResultActions p={p} data={data} onToast={setToast} />
      </Pickers>
      <FetchingIndicator show={isFetching && !isPending} label="Updating results" />
      {p.loading || (isPending && p.scopeQuery && p.classId) ? (
        <LoadingState variant="table" />
      ) : !p.scopeQuery || !p.classId ? (
        <EmptyState title="Pick an exam and class" description="Choose which result to see — an exam, a term (combined) or the whole year." />
      ) : isError ? (
        <ErrorState title="Couldn't load results" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data?.rows.length ? (
        <>
          <PendingNotice data={data} />
          <EmptyState
            title="No results calculated yet"
            description={admin ? "Results are calculated from approved marks. Click “Generate results” above." : "Results appear after marks are approved and an admin calculates them."}
          />
        </>
      ) : (
        <>
          <PendingNotice data={data} />
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Students" value={data.rows.length} hint={data.published ? "Published" : "Not published"} tone={data.published ? "success" : "warning"} />
            <Stat label="Class average" value={pct(data.summary.avg)} hint={`Median ${pct(data.summary.median)}`} />
            <Stat label="Passed" value={`${data.summary.passed}/${data.rows.length}`} hint={`${pct(data.summary.passPct)} pass rate`} />
            <Stat label="Top score" value={pct(data.summary.high)} hint={data.rows[0]?.name} />
          </dl>
          <div className="rounded-3xl bg-surface p-4">
            <p className="mb-2 text-sm text-muted-foreground">Grade spread</p>
            <GradeSpread grades={data.summary.grades} order={gradeOrder} />
          </div>
          <div className="overflow-x-auto rounded-3xl bg-surface p-2">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  {data.showRank ? <th scope="col" className="w-16 px-3 py-3 font-medium">Rank</th> : null}
                  <th scope="col" className="px-3 py-3 font-medium">Student</th>
                  <th scope="col" className="px-3 py-3 font-medium">Total</th>
                  <th scope="col" className="px-3 py-3 font-medium">%</th>
                  <th scope="col" className="px-3 py-3 font-medium">Grade</th>
                  <th scope="col" className="px-3 py-3 font-medium">Result</th>
                  {admin ? <th scope="col" className="px-3 py-3 font-medium">Class teacher's remark</th> : null}
                  {admin ? <th scope="col" className="px-3 py-3 font-medium">Principal's remark</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    {data.showRank ? <td className="px-3 py-2.5 font-medium tabular-nums">{ordinal(r.rank)}</td> : null}
                    <td className="px-3 py-2.5">
                      <Link to={`/students/${r.studentId}?tab=results`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        Roll {r.rollNo || "—"} · {r.admissionNo}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">
                      {fmtNum(r.totalObtained)}/{fmtNum(r.totalMax)}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{pct(r.percentage)}</td>
                    <td className="px-3 py-2.5 font-medium">{r.grade || "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge tone={r.passed ? "success" : "danger"}>{r.passed ? "Pass" : `Fail${r.failedSubjects ? ` · ${r.failedSubjects}` : ""}`}</Badge>
                    </td>
                    {admin ? (
                      <td className="px-3 py-2">
                        <Textarea
                          aria-label={`Class teacher's remark for ${r.name}`}
                          rows={1}
                          className="min-h-9 min-w-48"
                          defaultValue={r.teacherRemark}
                          onChange={(e) => setRemarks((c) => ({ ...c, [r.id]: { ...c[r.id], teacherRemark: e.target.value } }))}
                        />
                      </td>
                    ) : null}
                    {admin ? (
                      <td className="px-3 py-2">
                        <Textarea
                          aria-label={`Principal's remark for ${r.name}`}
                          rows={1}
                          className="min-h-9 min-w-48"
                          defaultValue={r.principalRemark}
                          onChange={(e) => setRemarks((c) => ({ ...c, [r.id]: { ...c[r.id], principalRemark: e.target.value } }))}
                        />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {admin && Object.keys(remarks).length ? (
            <div className="sticky bottom-3 flex justify-end">
              <Button loading={saveRemarks.isPending} onClick={() => saveRemarks.mutate()}>
                Save {Object.keys(remarks).length} remarks
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Calculated {data.computedAt ? formatDay(data.computedAt) : "—"}. Approving marks or corrections updates results automatically.
          </p>
        </>
      )}
      <Toast message={toast} />
    </div>
  );
}

export function StudentResultsPage() {
  const [params, setParams] = useSearchParams();
  const studentId = params.get("studentId") ?? "";
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const search = useQuery({
    queryKey: queryKeys.students({ q: debounced, pageSize: 8, purpose: "results" }),
    queryFn: () => api.students({ q: debounced, pageSize: 8 }),
    enabled: debounced.length >= 2,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Student results" description="Look up any student's results for the selected academic year." />
      <div className="relative max-w-xl">
        <Label htmlFor="student-search" className="mb-2 block">
          Find a student
        </Label>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="student-search" type="search" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, admission no or roll no" autoComplete="off" />
        </div>
        {debounced.length >= 2 && search.data ? (
          <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-2xl bg-surface shadow-lg ring-1 ring-line" role="listbox" aria-label="Matching students">
            {search.data.items.length ? (
              search.data.items.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={s.id === studentId}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      setParams({ studentId: s.id });
                      setQ("");
                    }}
                  >
                    <span className="font-medium">
                      {s.firstName} {s.lastName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {s.admissionNo}
                      {s.class ? ` · ${s.class.name} ${s.class.section}` : ""}
                    </span>
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-3 text-sm text-muted-foreground">No students match.</li>
            )}
          </ul>
        ) : null}
      </div>
      {studentId ? (
        <div className="rounded-3xl bg-surface p-6">
          <p className="mb-4 text-sm">
            <Link to={`/students/${studentId}?tab=results`} className="text-indigo">
              Open full student profile
            </Link>
          </p>
          <StudentResultsPanel studentId={studentId} />
        </div>
      ) : (
        <EmptyState title="Search for a student" description="Type at least two letters of a name or an admission number." />
      )}
    </div>
  );
}

export function ResultSheetsPage() {
  const p = useResultPickers();
  const { data, isPending, isFetching, isError, refetch } = useClassResults(p);
  const [toast, setToast] = useState<string | null>(null);

  async function exportXlsx() {
    if (!data) return;
    const XLSX = await import("xlsx");
    const header = ["Rank", "Roll", "Admission No", "Student", ...data.subjects.map((s) => s.name), "Total", "Max", "%", "Grade", "Result"];
    const rows = data.rows.map((r) => [
      r.rank ?? "",
      r.rollNo,
      r.admissionNo,
      r.name,
      ...data.subjects.map((s) => {
        const line = r.subjects.find((l) => l.subjectId === s.id);
        return line?.attendance === "ABSENT" ? "Abs" : (line?.obtained ?? "");
      }),
      r.totalObtained,
      r.totalMax,
      r.percentage,
      r.grade,
      r.passed ? "Pass" : "Fail",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Result sheet");
    XLSX.writeFile(wb, `${data.class.label}-result-sheet.xlsx`.replace(/\s+/g, "_"));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="print:hidden">
        <PageHeader title="Result sheets" description="Tabulation sheet: every student and subject on one page. Print it or export to Excel." />
      </div>
      <Pickers p={p}>
        <ResultActions p={p} data={data} onToast={setToast} />
        {data?.rows.length ? (
          <>
            <Button variant="outline" icon={<Download />} onClick={() => void exportXlsx()}>
              Excel
            </Button>
            <Button variant="outline" icon={<Printer />} onClick={() => window.print()}>
              Print
            </Button>
          </>
        ) : null}
      </Pickers>
      <FetchingIndicator show={isFetching && !isPending} label="Updating sheet" />
      {p.loading || (isPending && p.scopeQuery && p.classId) ? (
        <LoadingState variant="table" />
      ) : !p.scopeQuery || !p.classId ? (
        <EmptyState title="Pick an exam and class" description="The sheet shows every subject for every student." />
      ) : isError ? (
        <ErrorState title="Couldn't load the sheet" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data?.rows.length ? (
        <EmptyState title="No results calculated yet" description="Generate results once marks are approved." />
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface p-2 print:rounded-none print:p-0">
          <h2 className="hidden font-display text-xl print:block">
            {data.class.label} — {p.scope?.scope === "ANNUAL" ? "Annual result" : (p.exams.find((e) => e.id === p.scope?.scopeId)?.name ?? p.terms.find((t) => t.id === p.scope?.scopeId)?.name)}
          </h2>
          <table className="w-full text-left text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-2 py-2 font-medium">#</th>
                <th scope="col" className="px-2 py-2 font-medium">Roll</th>
                <th scope="col" className="px-2 py-2 font-medium">Student</th>
                {data.subjects.map((s) => (
                  <th key={s.id} scope="col" className="px-2 py-2 text-center font-medium">
                    {s.name}
                  </th>
                ))}
                <th scope="col" className="px-2 py-2 text-center font-medium">Total</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">%</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">Grade</th>
                <th scope="col" className="px-2 py-2 text-center font-medium">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-2 py-1.5 tabular-nums">{r.rank ?? "—"}</td>
                  <td className="px-2 py-1.5 tabular-nums">{r.rollNo}</td>
                  <td className="px-2 py-1.5 font-medium whitespace-nowrap">{r.name}</td>
                  {data.subjects.map((s) => {
                    const line = r.subjects.find((l) => l.subjectId === s.id);
                    return (
                      <td key={s.id} className={`px-2 py-1.5 text-center tabular-nums ${line && line.pct != null && !line.passed ? "font-semibold text-danger" : ""}`}>
                        {!line ? "—" : line.attendance === "ABSENT" ? "Abs" : line.pct == null ? "—" : line.attendance === "MIXED" ? fmtNum(line.pct) : fmtNum(line.obtained)}
                        {line?.grade ? <span className="block text-[10px] text-muted-foreground">{line.grade}</span> : null}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center tabular-nums">
                    {fmtNum(r.totalObtained)}/{fmtNum(r.totalMax)}
                  </td>
                  <td className="px-2 py-1.5 text-center tabular-nums">{fmtNum(r.percentage)}</td>
                  <td className="px-2 py-1.5 text-center font-medium">{r.grade}</td>
                  <td className={`px-2 py-1.5 text-center ${r.passed ? "" : "text-danger"}`}>{r.passed ? "Pass" : "Fail"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 px-2 text-xs text-muted-foreground">
            Average {pct(data.summary.avg)} · Passed {data.summary.passed}/{data.rows.length} · Failed subjects in red.
          </p>
        </div>
      )}
      <Toast message={toast} />
    </div>
  );
}

export function ReportCardsPage() {
  const p = useResultPickers();
  const { data, isPending, isError, refetch } = useClassResults(p);
  const templates = useQuery({ queryKey: examKeys.templates, queryFn: examsApi.templates });
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(studentId?: string) {
    if (!p.scopeQuery) return;
    setBusy(studentId ?? "all");
    setError(null);
    try {
      await openPdf(() =>
        examsApi.reportCardUrl({ ...p.scopeQuery!, classId: studentId ? undefined : p.classId, studentId, templateId: templateId || undefined }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create report cards");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Report cards" description="Print-ready A4 report cards with your school's letterhead — one student or the whole class in one PDF." />
      <Pickers p={p}>
        <div className="flex w-56 flex-col gap-2">
          <Label htmlFor="rc-template">Template</Label>
          <FormSelect
            id="rc-template"
            value={templateId || templates.data?.[0]?.id || null}
            onValueChange={(v) => setTemplateId(v ?? "")}
            options={(templates.data ?? []).map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? " (default)" : ""}` }))}
            placeholder="Default"
          />
        </div>
      </Pickers>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      {p.loading || (isPending && p.scopeQuery && p.classId) ? (
        <LoadingState variant="table" />
      ) : !p.scopeQuery || !p.classId ? (
        <EmptyState title="Pick an exam and class" description="Choose an exam, a term or the annual result." />
      ) : isError ? (
        <ErrorState title="Couldn't load students" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data?.rows.length ? (
        <EmptyState title="No results calculated yet" description="Generate results on the Class results page first." action={<Button render={<Link to={`/exams/results/class?scope=${scopeToString(p.scope)}&classId=${p.classId}`} />}>Go to class results</Button>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-surface p-4">
            <div>
              <p className="font-medium">{data.class.label}</p>
              <p className="text-sm text-muted-foreground">
                {data.rows.length} report cards · {data.published ? "published" : "not published yet"}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" render={<Link to="/exams/settings/report-cards" />}>
                Edit template
              </Button>
              <Button icon={<FileText />} loading={busy === "all"} onClick={() => void open()}>
                Download all ({data.rows.length})
              </Button>
            </div>
          </div>
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {data.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {pct(r.percentage)} · {r.grade} {r.rank ? `· ${ordinal(r.rank)}` : ""}
                  </p>
                </div>
                <Button size="sm" variant="outline" loading={busy === r.studentId} onClick={() => void open(r.studentId)}>
                  PDF
                </Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
