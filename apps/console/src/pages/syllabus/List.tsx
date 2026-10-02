import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { SyllabusStatusBadge, TeachingProgress } from "@/components/syllabus/syllabus-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClampPage } from "@/lib/paging";
import { syllabusApi, syllabusKeys, SYLLABUS_STATUS_LABEL, type SyllabusStatus } from "@/lib/syllabus-api";

const PAGE_SIZE = 25;

export function SyllabusListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const gradeName = params.get("gradeName") ?? "";
  const subjectId = params.get("subjectId") ?? "";
  const status = params.get("status") ?? "";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);

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

  const overview = useQuery({ queryKey: syllabusKeys.overview(), queryFn: syllabusApi.overview });
  const query = { gradeName: gradeName || undefined, subjectId: subjectId || undefined, status: status || undefined, q: q || undefined, page: String(page), pageSize: String(PAGE_SIZE) };
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: syllabusKeys.list(query),
    queryFn: () => syllabusApi.list(query),
    placeholderData: keepPreviousData,
  });
  useClampPage(data, (p) => setParam("page", String(p), false));

  const filtered = Boolean(gradeName || subjectId || status || q);
  const statusOptions = (Object.keys(SYLLABUS_STATUS_LABEL) as SyllabusStatus[]).map((s) => ({ value: s, label: `${SYLLABUS_STATUS_LABEL[s]}${data?.statusCounts[s] ? ` (${data.statusCounts[s]})` : ""}` }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Scheme of work" description={`Every class's syllabus for ${overview.data?.year?.name ?? "this academic year"}, with teaching progress against the plan.`} />

      <div className="flex flex-wrap items-end gap-3 rounded-3xl bg-surface p-4">
        <div className="flex min-w-52 flex-1 flex-col gap-2">
          <Label htmlFor="syllabus-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="syllabus-search" type="search" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Class or subject" />
          </div>
        </div>
        <div className="flex w-44 flex-col gap-2">
          <Label htmlFor="syllabus-grade">Class</Label>
          <FormSelect id="syllabus-grade" value={gradeName || "all"} onValueChange={(v) => setParam("gradeName", v === "all" ? "" : (v ?? ""))} options={[{ value: "all", label: "All classes" }, ...(overview.data?.grades ?? []).map((g) => ({ value: g.name, label: g.name }))]} />
        </div>
        <div className="flex w-48 flex-col gap-2">
          <Label htmlFor="syllabus-subject">Subject</Label>
          <FormSelect id="syllabus-subject" value={subjectId || "all"} onValueChange={(v) => setParam("subjectId", v === "all" ? "" : (v ?? ""))} options={[{ value: "all", label: "All subjects" }, ...(overview.data?.subjects ?? []).map((s) => ({ value: s.id, label: s.name }))]} />
        </div>
        <div className="flex w-52 flex-col gap-2">
          <Label htmlFor="syllabus-status">Progress</Label>
          <FormSelect id="syllabus-status" value={status || "all"} onValueChange={(v) => setParam("status", v === "all" ? "" : (v ?? ""))} options={[{ value: "all", label: "Any progress" }, ...statusOptions]} />
        </div>
      </div>

      <FetchingIndicator show={isFetching && !isPending} label="Updating syllabi" />

      {isPending ? (
        <LoadingState variant="table" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load syllabi" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data.items.length ? (
        filtered ? (
          <EmptyState title="No syllabi match" description="Try another class, subject or progress filter." />
        ) : (
          <EmptyState title="No syllabi yet" description="Create one for each class and subject from the overview — or copy last year's." action={<Link to="/syllabus" className="text-indigo">Go to overview</Link>} />
        )
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Class & subject</th>
                <th scope="col" className="px-3 py-3 font-medium">Teacher</th>
                <th scope="col" className="px-3 py-3 font-medium">Units · topics</th>
                <th scope="col" className="px-3 py-3 font-medium">Teaching progress</th>
                <th scope="col" className="px-3 py-3 font-medium">Status</th>
                <th scope="col" className="px-3 py-3 font-medium">Locked</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => (
                <tr key={row.id} className="cursor-pointer border-t border-line hover:bg-muted/50" onClick={() => navigate(`/syllabus/${row.id}`)}>
                  <td className="px-3 py-3">
                    <Link to={`/syllabus/${row.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                      {row.gradeName} · {row.subject.name}
                    </Link>
                    {!row.canEdit ? <span className="block text-xs text-muted-foreground">View only</span> : null}
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{row.teachers.join(", ") || "—"}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {row.stats.units} · {row.stats.topics}
                  </td>
                  <td className="px-3 py-3">
                    <TeachingProgress stats={row.stats} label={`${row.gradeName} ${row.subject.name} topics taught`} />
                  </td>
                  <td className="px-3 py-3">
                    <SyllabusStatusBadge status={row.stats.status} />
                  </td>
                  <td className="px-3 py-3 tabular-nums text-muted-foreground">{row.stats.locked || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPageChange={(p) => setParam("page", String(p), false)} noun="syllabus" busy={isFetching} /> : null}
    </div>
  );
}
