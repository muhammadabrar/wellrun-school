import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { QUESTION_PAPER_STATUSES, QUESTION_PAPER_STATUS_LABEL } from "@wellrun/shared";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { PenLine, Printer, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { KindBadge, formatDay, isExamAdmin } from "@/components/exams/exam-ui";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { QuestionPaperStatusBadge } from "@/components/question-papers/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClampPage } from "@/lib/paging";
import { questionPaperKeys, questionPapersApi, type QuestionPaperTodo } from "@/lib/question-papers-api";

const PAGE_SIZE = 25;

export function QuestionPapersPage() {
  const admin = isExamAdmin();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);
  const [toast, setToast] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string, resetPage = true) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      if (resetPage && key !== "page") next.delete("page");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search !== q) setParam("q", search.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, q, setParam]);

  const query = { status: status || undefined, q: q || undefined, page: String(page), pageSize: String(PAGE_SIZE) };
  const list = useQuery({ queryKey: questionPaperKeys.list(query), queryFn: () => questionPapersApi.list(query), placeholderData: keepPreviousData });
  const todo = useQuery({ queryKey: questionPaperKeys.todo(), queryFn: questionPapersApi.todo });
  useClampPage(list.data, (p) => setParam("page", String(p), false));

  const start = useMutation({
    mutationFn: (item: QuestionPaperTodo) => questionPapersApi.create({ examPaperId: item.examPaperId }),
    onSuccess: async (out) => {
      await queryClient.invalidateQueries({ queryKey: questionPaperKeys.root });
      navigate(`/exams/question-papers/${out.id}`);
    },
    onError: (err) => setToast(err instanceof Error ? err.message : "Couldn't start the paper"),
  });

  const counts = list.data?.statusCounts ?? {};
  const awaiting = counts.SUBMITTED ?? 0;
  const filtered = Boolean(status || q);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Question papers"
        description={
          admin
            ? "Papers teachers write for exams. Review and approve them, then print as many copies as you need."
            : "Write the question paper for your exams — MCQs, short and long questions, translation, story writing and more. An admin approves it before printing."
        }
      />

      {admin && awaiting ? (
        <p className="rounded-2xl bg-orange/10 p-3 text-sm text-orange" role="status">
          {awaiting} {awaiting === 1 ? "paper is" : "papers are"} waiting for your approval.{" "}
          <button type="button" className="underline" onClick={() => setParam("status", "SUBMITTED")}>
            Show them
          </button>
        </p>
      ) : null}

      {todo.data?.length ? (
        <section className="rounded-3xl bg-surface p-5" aria-labelledby="to-write">
          <h2 id="to-write" className="font-display text-xl">
            {admin ? "Papers nobody has started" : "Papers for you to write"}
          </h2>
          <p className="text-sm text-muted-foreground">Upcoming exams with no question paper yet.</p>
          <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {todo.data.slice(0, 9).map((item) => (
              <li key={item.examPaperId} className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {item.gradeName} · {item.subject}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.examName}
                    {item.date ? ` · ${formatDay(item.date)}` : ""}
                  </p>
                </div>
                <Button size="sm" icon={<PenLine />} loading={start.isPending && start.variables?.examPaperId === item.examPaperId} onClick={() => start.mutate(item)}>
                  Start
                </Button>
              </li>
            ))}
          </ul>
          {todo.data.length > 9 ? <p className="mt-2 text-xs text-muted-foreground">+{todo.data.length - 9} more — open the exam and use “Question paper” on each paper.</p> : null}
        </section>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-3xl bg-surface p-4">
        <div className="flex min-w-52 flex-1 flex-col gap-2">
          <Label htmlFor="qp-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="qp-search" type="search" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Exam, class or subject" />
          </div>
        </div>
        <div className="flex w-56 flex-col gap-2">
          <Label htmlFor="qp-status">Status</Label>
          <FormSelect
            id="qp-status"
            value={status || "all"}
            onValueChange={(v) => setParam("status", v === "all" ? "" : (v ?? ""))}
            options={[{ value: "all", label: "Any status" }, ...QUESTION_PAPER_STATUSES.map((s) => ({ value: s, label: `${QUESTION_PAPER_STATUS_LABEL[s]}${counts[s] ? ` (${counts[s]})` : ""}` }))]}
          />
        </div>
      </div>

      <FetchingIndicator show={list.isFetching && !list.isPending} label="Updating papers" />

      {list.isPending ? (
        <LoadingState variant="table" />
      ) : list.isError || !list.data ? (
        <ErrorState title="Couldn't load question papers" description="Check your connection and try again." onRetry={() => void list.refetch()} />
      ) : !list.data.items.length ? (
        filtered ? (
          <EmptyState title="No papers match" description="Try another status or search." />
        ) : (
          <EmptyState title="No question papers yet" description="Start one from the list above, or open an exam and choose “Question paper” on a paper." action={<Link to="/exams/list" className="text-indigo">Go to exams</Link>} />
        )
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Paper</th>
                <th scope="col" className="px-3 py-3 font-medium">Exam</th>
                <th scope="col" className="px-3 py-3 font-medium">Marks</th>
                <th scope="col" className="px-3 py-3 font-medium">Questions</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                {admin ? <th scope="col" className="px-3 py-3 font-medium">Printed</th> : null}
                <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.data.items.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t border-line hover:bg-muted/50" onClick={() => navigate(`/exams/question-papers/${row.id}`)}>
                  <td className="px-3 py-3">
                    <Link to={`/exams/question-papers/${row.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {row.gradeName} · {row.subject.name}
                    </Link>
                    {row.status === "RETURNED" && row.reviewNote ? <span className="block max-w-64 truncate text-xs text-danger">“{row.reviewNote}”</span> : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <KindBadge kind={row.exam.kind as never} />
                      <span className="max-w-48 truncate">{row.exam.name}</span>
                    </div>
                    <span className="block text-xs text-muted-foreground">{formatDay(row.exam.startsOn)}</span>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{row.totalMarks}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {row.questions}
                    <span className="block text-xs text-muted-foreground">{row.sections} sections</span>
                  </td>
                  <td className="px-3 py-3">
                    <QuestionPaperStatusBadge status={row.status} />
                  </td>
                  {admin ? <td className="px-3 py-3 tabular-nums text-muted-foreground">{row.printed || "—"}</td> : null}
                  <td className="px-3 py-3 text-right">
                    {admin && row.status === "APPROVED" ? (
                      <Button size="sm" variant="outline" icon={<Printer />} render={<Link to={`/exams/question-papers/${row.id}/print`} onClick={(e) => e.stopPropagation()} />}>
                        Print
                      </Button>
                    ) : admin && row.status === "SUBMITTED" ? (
                      <Button size="sm" render={<Link to={`/exams/question-papers/${row.id}`} onClick={(e) => e.stopPropagation()} />}>
                        Review
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.data ? <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPageChange={(p) => setParam("page", String(p), false)} noun="paper" busy={list.isFetching} /> : null}
      <Toast message={toast} />
    </div>
  );
}
