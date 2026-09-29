import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EXAM_STATUSES } from "@wellrun/shared";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { FilePlus2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { EXAM_STATUS, ExamStatusBadge, MarkingProgress, dateRange, isExamAdmin } from "@/components/exams/exam-ui";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { examKeys, examsApi } from "@/lib/exams-api";

export function ExamsListPage() {
  const navigate = useNavigate();
  const admin = isExamAdmin();
  const [params, setParams] = useSearchParams();
  const termId = params.get("termId") ?? "";
  const status = params.get("status") ?? "";
  const q = params.get("q") ?? "";
  const [search, setSearch] = useState(q);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search === q) return;
      const next = new URLSearchParams(params);
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
      setParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, q, params, setParams]);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const query = { kind: "EXAM", termId: termId || undefined, status: status || undefined, q: q || undefined };
  const context = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context });
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: examKeys.list(query),
    queryFn: () => examsApi.list(query),
    placeholderData: keepPreviousData,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="All exams"
        description={`School exams for ${context.data?.year?.name ?? "this academic year"}. Quizzes and assignments live under Assessments.`}
        actions={
          admin ? (
            <Button icon={<FilePlus2 />} render={<Link to="/exams/new" />}>
              Create exam
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-end gap-3 rounded-3xl bg-surface p-4">
        <div className="flex min-w-56 flex-1 flex-col gap-2">
          <Label htmlFor="exam-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="exam-search" type="search" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Exam name" />
          </div>
        </div>
        <div className="flex w-48 flex-col gap-2">
          <Label htmlFor="exam-term">Term</Label>
          <FormSelect
            id="exam-term"
            value={termId || "all"}
            onValueChange={(v) => setParam("termId", v === "all" ? "" : (v ?? ""))}
            options={[{ value: "all", label: "All terms" }, ...(context.data?.terms ?? []).map((t) => ({ value: t.id, label: t.name }))]}
          />
        </div>
        <div className="flex w-48 flex-col gap-2">
          <Label htmlFor="exam-status">Status</Label>
          <FormSelect
            id="exam-status"
            value={status || "all"}
            onValueChange={(v) => setParam("status", v === "all" ? "" : (v ?? ""))}
            options={[{ value: "all", label: "Any status" }, ...EXAM_STATUSES.map((s) => ({ value: s, label: EXAM_STATUS[s].label }))]}
          />
        </div>
      </div>

      <FetchingIndicator show={isFetching && !isPending} label="Updating exams" />

      {isPending ? (
        <LoadingState variant="table" />
      ) : isError ? (
        <ErrorState title="Couldn't load exams" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data?.length ? (
        q || termId || status ? (
          <EmptyState title="No exams match" description="Try a different name, term or status." />
        ) : (
          <EmptyState
            title="No exams yet"
            description="Create a mid-term, final or monthly test for the whole school. Subjects and the date sheet are filled in for you."
            action={
              admin ? (
                <Button icon={<FilePlus2 />} render={<Link to="/exams/new" />}>
                  Create exam
                </Button>
              ) : undefined
            }
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Exam</th>
                <th scope="col" className="px-3 py-3 font-medium">Dates</th>
                <th scope="col" className="px-3 py-3 font-medium">Classes</th>
                <th scope="col" className="px-3 py-3 font-medium">Marking</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((exam) => (
                <tr key={exam.id} className="cursor-pointer border-t border-line hover:bg-muted/50" onClick={() => navigate(`/exams/${exam.id}`)}>
                  <td className="px-3 py-3">
                    <Link to={`/exams/${exam.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {exam.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {[exam.term?.name, exam.code, `weight ${exam.weight}`].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{dateRange(exam.startsOn, exam.endsOn)}</td>
                  <td className="px-3 py-3">
                    {exam.classCount} {exam.classCount === 1 ? "class" : "classes"}
                    <span className="block max-w-56 truncate text-xs text-muted-foreground">
                      {exam.classes.join(", ")}
                      {exam.classCount > exam.classes.length ? "…" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <MarkingProgress approved={exam.paperStatus.APPROVED} submitted={exam.paperStatus.SUBMITTED} total={exam.paperCount} label={`${exam.name} papers approved`} />
                  </td>
                  <td className="px-3 py-3">
                    <ExamStatusBadge status={exam.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
