import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { defaultRangeStart, reportById, type ReportParams, type ReportResult } from "@wellrun/shared";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ExportButtons } from "@/components/attendance/attendance-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { BarList, ReportTable } from "@/components/reports/report-ui";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCampus } from "@/hooks/use-campus";
import { downloadCsv, downloadXlsx } from "@/lib/export";
import { todayIso } from "@/lib/format";
import { useClampPage } from "@/lib/paging";
import { reportFileName, reportMatrix } from "@/lib/report-format";
import { reportKeys, reportsApi } from "@/lib/reports-api";

const ALL = "all";

export function ReportPage() {
  const { id = "" } = useParams();
  const def = reportById(id);
  const { classes } = useCampus();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const [printing, setPrinting] = useState<ReportResult | null>(null);

  const has = (key: string) => Boolean(def?.filters.includes(key as never));
  const from = params.get("from") ?? defaultRangeStart(def?.range, today);
  const to = params.get("to") ?? today;
  const classId = params.get("classId") ?? "";
  const month = params.get("month") ?? today.slice(0, 7);
  const threshold = params.get("threshold") ?? "";
  const groupBy = params.get("groupBy") ?? def?.groupBy?.[0]?.value ?? "";
  const scopeValue = params.get("scope") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key !== "page") next.delete("page");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const scopes = useQuery({ queryKey: reportKeys.scopes, queryFn: reportsApi.scopes, enabled: has("scope") });
  const scopeOptions = useMemo(() => (scopes.data ?? []).map((s) => ({ value: `${s.scope}:${s.scopeId}`, label: s.label })), [scopes.data]);
  const chosenScope = scopeValue || scopeOptions[0]?.value || "";
  const [scope, scopeId] = chosenScope.split(/:(.+)/) as [string | undefined, string | undefined];

  const query = useMemo<ReportParams>(
    () => ({
      ...(has("range") ? { from, to } : {}),
      ...(has("class") && classId && classId !== ALL ? { classId } : {}),
      ...(has("month") ? { month } : {}),
      ...(has("threshold") && threshold ? { threshold } : {}),
      ...(def?.groupBy ? { groupBy } : {}),
      ...(has("scope") && scope && scopeId ? { scope, scopeId } : {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [def, from, to, classId, month, threshold, groupBy, scope, scopeId],
  );
  const pageQuery = { ...query, ...(page > 1 ? { page: String(page) } : {}) };

  const ready = Boolean(def) && (!has("scope") || scopes.isSuccess);
  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: reportKeys.run(id, pageQuery as Record<string, string>),
    queryFn: () => reportsApi.run(id, pageQuery),
    enabled: ready,
    placeholderData: keepPreviousData,
  });
  useClampPage(data ? { items: data.rows, total: data.total, page: data.page, pageSize: data.pageSize } : undefined, (next) => setParam("page", next > 1 ? String(next) : null));

  /** Exports and printing want every row, not the page on screen. */
  const fetchAll = () => reportsApi.run(id, { ...query, export: "1" });

  // Print the full report: render it print-only, open the print dialog, then clear it.
  useEffect(() => {
    if (!printing) return;
    const done = () => setPrinting(null);
    window.addEventListener("afterprint", done, { once: true });
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("afterprint", done);
    };
  }, [printing]);

  if (!def) {
    return <EmptyState title="That report doesn't exist" description="It may have been renamed. Go back to the list of reports and pick another." action={<Link to="/reports" className="text-indigo underline">All reports</Link>} />;
  }

  const classOptions = [{ value: ALL, label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: `${c.name} ${c.section}` }))];
  const showChart = Boolean(data?.chart) && data!.total > 1 && data!.total <= data!.pageSize;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link to="/reports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> All reports
        </Link>
        <PageHeader
          title={def.title}
          description={def.description}
          actions={
            <ExportButtons
              disabled={!data || data.total === 0}
              onExcel={async () => {
                const full = await fetchAll();
                await downloadXlsx(reportFileName(full), [{ name: def.title, rows: reportMatrix(full, true), widths: full.columns.map((c) => Math.max(14, c.label.length + 4)) }]);
              }}
              onCsv={async () => {
                const full = await fetchAll();
                downloadCsv(reportFileName(full), reportMatrix(full, false));
              }}
              onPrint={async () => setPrinting(await fetchAll())}
            />
          }
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {has("range") ? (
          <>
            <div className="w-48">
              <Label htmlFor="rep-from">From</Label>
              <DatePicker id="rep-from" value={from} onChange={(value) => setParam("from", value)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
            </div>
            <div className="w-48">
              <Label htmlFor="rep-to">To</Label>
              <DatePicker id="rep-to" value={to} onChange={(value) => setParam("to", value)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
            </div>
          </>
        ) : null}
        {has("month") ? (
          <div className="w-48">
            <Label htmlFor="rep-month">Month</Label>
            <Input id="rep-month" type="month" value={month} max={today.slice(0, 7)} onChange={(event) => event.target.value && setParam("month", event.target.value)} />
          </div>
        ) : null}
        {has("class") ? (
          <div className="w-52">
            <Label htmlFor="rep-class">Class</Label>
            <FormSelect id="rep-class" value={classId || ALL} onValueChange={(value) => setParam("classId", value && value !== ALL ? value : null)} options={classOptions} />
          </div>
        ) : null}
        {has("threshold") ? (
          <div className="w-44">
            <Label htmlFor="rep-threshold">Below (%)</Label>
            <Input id="rep-threshold" type="number" min={1} max={100} inputMode="numeric" value={threshold} placeholder="School limit" onChange={(event) => setParam("threshold", event.target.value || null)} />
          </div>
        ) : null}
        {has("scope") ? (
          <div className="w-64">
            <Label htmlFor="rep-scope">Exam or term</Label>
            <FormSelect id="rep-scope" value={chosenScope} onValueChange={(value) => setParam("scope", value)} options={scopeOptions} placeholder={scopes.isPending ? "Loading…" : "No results yet"} disabled={!scopeOptions.length} />
          </div>
        ) : null}
        {def.groupBy ? (
          <div className="w-52">
            <Label htmlFor="rep-group">Show</Label>
            <FormSelect id="rep-group" value={groupBy} onValueChange={(value) => value && setParam("groupBy", value)} options={def.groupBy} />
          </div>
        ) : null}
        <FetchingIndicator show={isFetching && !isPending} />
      </div>

      <div className="print:hidden">
        {!ready || isPending ? (
          <LoadingState variant="page" />
        ) : isError || !data ? (
          <ErrorState title="Couldn't build this report" description={error instanceof Error && error.message && error.message !== "error" ? error.message : "Check your connection and try again."} onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {data.subtitle} · {data.total.toLocaleString("en-PK")} {data.total === 1 ? "row" : "rows"}
            </p>
            {data.truncated ? <p className="rounded-2xl bg-orange/10 px-4 py-3 text-sm text-orange">This report is very large, so only the first 20,000 rows are included. Narrow the dates or pick a class to see the rest.</p> : null}
            {showChart ? (
              <section className="rounded-3xl bg-surface p-5">
                <BarList result={data} />
              </section>
            ) : null}
            {data.rows.length ? (
              <ReportTable columns={data.columns} rows={data.rows} totals={data.page * data.pageSize >= data.total ? data.totals : null} caption={`${data.title}, ${data.subtitle}`} />
            ) : (
              <EmptyState title="Nothing to show for these choices" description="No records match. Try a wider date range, or a different class." />
            )}
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="row" busy={isFetching} onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)} />
          </div>
        )}
      </div>

      {printing ? (
        <div className="hidden print:block">
          <h1 className="font-display text-2xl">{printing.title}</h1>
          <p className="mb-4 text-sm">{printing.subtitle}</p>
          <ReportTable columns={printing.columns} rows={printing.rows} totals={printing.totals} caption={printing.title} />
          <p className="mt-3 text-xs text-muted-foreground">Printed {new Date().toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}</p>
        </div>
      ) : null}
    </div>
  );
}
