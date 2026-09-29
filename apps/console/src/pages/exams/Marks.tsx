import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { CheckCircle2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KindBadge, PaperStatusBadge, formatDay, isExamAdmin, pct } from "@/components/exams/exam-ui";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { examKeys, examsApi, type MarkingPaper } from "@/lib/exams-api";

const MY_TABS = [
  { id: "todo", label: "To mark", status: "NOT_STARTED,DRAFT,RETURNED" },
  { id: "submitted", label: "Submitted", status: "SUBMITTED" },
  { id: "approved", label: "Approved", status: "APPROVED" },
];

function useSearch() {
  const [params, setParams] = useSearchParams();
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
  return { q, search, setSearch, params, setParams };
}

function SearchBox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative min-w-56 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" aria-label="Search by exam name" className="pl-9" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Search by exam name" />
    </div>
  );
}

export function MarksPapersPage() {
  const { q, search, setSearch, params, setParams } = useSearch();
  const tab = params.get("tab") ?? "todo";
  const status = MY_TABS.find((t) => t.id === tab)?.status ?? MY_TABS[0].status;
  const query = { status, q: q || undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: examKeys.papers(query), queryFn: () => examsApi.papers(query), placeholderData: keepPreviousData });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Enter marks" description="Papers for the subjects you teach. Open one to enter marks — drafts save automatically." />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={tab} onValueChange={(next) => setParams({ tab: String(next) }, { replace: true })}>
          <TabsList>
            {MY_TABS.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <SearchBox value={search} onChange={setSearch} />
      </div>
      <FetchingIndicator show={isFetching && !isPending} label="Updating papers" />
      {isPending ? (
        <LoadingState variant="table" />
      ) : isError ? (
        <ErrorState title="Couldn't load papers" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState
          title={tab === "todo" ? "Nothing to mark" : tab === "submitted" ? "Nothing waiting for verification" : "No approved papers yet"}
          description={tab === "todo" ? "When an exam includes your subjects, or you add a quiz, papers show up here." : "Papers move here as they progress."}
        />
      ) : (
        <PaperTable rows={data} action={(p) => (p.status === "APPROVED" || p.status === "SUBMITTED" ? "View" : p.entered ? "Continue" : "Enter marks")} />
      )}
    </div>
  );
}

export function PendingVerificationPage() {
  const queryClient = useQueryClient();
  const { q, search, setSearch, params } = useSearch();
  const examId = params.get("examId") ?? undefined;
  const query = { status: "SUBMITTED", examId, q: q || undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: examKeys.papers(query), queryFn: () => examsApi.papers(query), placeholderData: keepPreviousData });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const approve = useMutation({
    mutationFn: (paperIds: string[]) => examsApi.review({ paperIds, action: "APPROVE" }),
    onSuccess: async (out) => {
      setSelected(new Set());
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      setToast(`${out.updated} papers approved. Results were updated.`);
    },
    onError: (err) => setToast(err instanceof Error ? err.message : "Couldn't approve"),
  });
  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Pending verification"
        description="Marks teachers have submitted. Check the numbers, then approve — or open a paper to return it with a note."
        actions={
          selected.size ? (
            <Button icon={<CheckCircle2 />} loading={approve.isPending} onClick={() => approve.mutate([...selected])}>
              Approve {selected.size} selected
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox value={search} onChange={setSearch} />
        {examId ? (
          <Link to="/exams/marks/pending" className="text-sm text-indigo">
            Show all exams
          </Link>
        ) : null}
      </div>
      <FetchingIndicator show={isFetching && !isPending} label="Updating papers" />
      {isPending ? (
        <LoadingState variant="table" />
      ) : isError ? (
        <ErrorState title="Couldn't load papers" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !rows.length ? (
        <EmptyState title="All caught up" description="No marks are waiting for verification." />
      ) : (
        <PaperTable
          rows={rows}
          selectable={{
            selected,
            toggle: (id) =>
              setSelected((current) => {
                const next = new Set(current);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              }),
            toggleAll: (on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set()),
          }}
          showStats
          action={() => "Review"}
        />
      )}
      <Toast message={toast} />
    </div>
  );
}

export function ApprovedMarksPage() {
  const { q, search, setSearch } = useSearch();
  const query = { status: "APPROVED", q: q || undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: examKeys.papers(query), queryFn: () => examsApi.papers(query), placeholderData: keepPreviousData });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Approved marks"
        description={isExamAdmin() ? "Verified and locked. Open a paper to reopen it or to request a correction." : "Verified and locked. Open a paper to request a correction."}
      />
      <SearchBox value={search} onChange={setSearch} />
      <FetchingIndicator show={isFetching && !isPending} label="Updating papers" />
      {isPending ? (
        <LoadingState variant="table" />
      ) : isError ? (
        <ErrorState title="Couldn't load papers" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState title="No approved papers yet" description="Papers appear here once an admin verifies them." />
      ) : (
        <PaperTable rows={data} showStats action={() => "View"} />
      )}
    </div>
  );
}

function PaperTable({
  rows,
  action,
  showStats,
  selectable,
}: {
  rows: MarkingPaper[];
  action: (p: MarkingPaper) => string;
  showStats?: boolean;
  selectable?: { selected: Set<string>; toggle: (id: string) => void; toggleAll: (on: boolean) => void };
}) {
  const navigate = useNavigate();
  return (
    <div className="overflow-x-auto rounded-3xl bg-surface p-2">
      <table className="w-full text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            {selectable ? (
              <th scope="col" className="w-10 px-3 py-3">
                <Checkbox aria-label="Select all" checked={selectable.selected.size === rows.length} indeterminate={selectable.selected.size > 0 && selectable.selected.size < rows.length} onCheckedChange={(on) => selectable.toggleAll(Boolean(on))} />
              </th>
            ) : null}
            <th scope="col" className="px-3 py-3 font-medium">Paper</th>
            <th scope="col" className="px-3 py-3 font-medium">Exam</th>
            <th scope="col" className="px-3 py-3 font-medium">Entered</th>
            {showStats ? <th scope="col" className="px-3 py-3 font-medium">Avg · high · low</th> : null}
            {showStats ? <th scope="col" className="px-3 py-3 font-medium">Below pass</th> : null}
            <th scope="col" className="px-3 py-3 font-medium">Status</th>
            <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Open</span></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="cursor-pointer border-t border-line hover:bg-muted/50" onClick={() => navigate(`/exams/marks/${p.id}`)}>
              {selectable ? (
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Checkbox aria-label={`Select ${p.subject} ${p.className}`} checked={selectable.selected.has(p.id)} onCheckedChange={() => selectable.toggle(p.id)} />
                </td>
              ) : null}
              <td className="px-3 py-2.5">
                <span className="font-medium">
                  {p.subject} · {p.className}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {formatDay(p.date)} · out of {p.maxMarks}
                </span>
              </td>
              <td className="px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <KindBadge kind={p.kind} />
                  <span className="max-w-48 truncate">{p.examName}</span>
                </div>
              </td>
              <td className="px-3 py-2.5 tabular-nums">
                {p.entered}/{p.students}
              </td>
              {showStats ? (
                <td className="px-3 py-2.5 tabular-nums">
                  {pct(p.stats.avg)} · {p.stats.high != null ? `${Math.round((p.stats.high / 100) * p.maxMarks * 10) / 10}` : "—"} · {p.stats.low != null ? `${Math.round((p.stats.low / 100) * p.maxMarks * 10) / 10}` : "—"}
                </td>
              ) : null}
              {showStats ? (
                <td className={`px-3 py-2.5 tabular-nums ${p.stats.fails ? "text-danger" : ""}`}>
                  {p.stats.fails}
                  {p.stats.absent ? <span className="block text-xs text-muted-foreground">{p.stats.absent} absent</span> : null}
                </td>
              ) : null}
              <td className="px-3 py-2.5">
                <PaperStatusBadge status={p.status} />
                {p.status === "RETURNED" && p.reviewNote ? <span className="mt-1 block max-w-48 truncate text-xs text-danger">“{p.reviewNote}”</span> : null}
              </td>
              <td className="px-3 py-2.5 text-right">
                <Button size="sm" variant="outline" render={<Link to={`/exams/marks/${p.id}`} onClick={(e) => e.stopPropagation()} />}>
                  {action(p)}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
