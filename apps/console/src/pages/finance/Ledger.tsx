import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ExportButtons } from "@/components/attendance/attendance-ui";
import { Balance, Flow, day } from "@/components/finance/finance-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Label } from "@/components/ui/label";
import { downloadCsv, downloadXlsx } from "@/lib/export";
import { financeApi, financeKeys, type LedgerView } from "@/lib/finance-api";
import { pkr, todayIso } from "@/lib/format";
import { useClampPage } from "@/lib/paging";

const ALL = "all";

function matrix(ledger: LedgerView, withTitle: boolean) {
  const all = ledger.accountId === null;
  const header = ["Date", "Details", "Reference", "Category", ...(all ? ["Account"] : []), "Money in (Rs.)", "Money out (Rs.)", ...(all ? [] : ["Balance (Rs.)"])];
  const lines = ledger.rows.map((r) => [r.date, r.description, r.reference, r.category, ...(all ? [r.account] : []), r.inPkr || "", r.outPkr || "", ...(all ? [] : [r.balancePkr ?? ""])]);
  const summary = all ? [] : [["", "Opening balance", "", "", ledger.openingPkr ?? ""], ["", "Closing balance", "", "", ledger.closingPkr ?? ""]];
  const body = [header, ...lines, [], ["", "Total", "", "", ...(all ? [""] : []), ledger.totalInPkr, ledger.totalOutPkr]];
  return withTitle ? [[`Ledger: ${ledger.accountName}`], [`${ledger.from} to ${ledger.to}`], ...summary, [], ...body] : body;
}

export function LedgerPage() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const accountId = params.get("accountId") ?? ALL;
  const from = params.get("from") ?? `${today.slice(0, 7)}-01`;
  const to = params.get("to") ?? today;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [printing, setPrinting] = useState<LedgerView | null>(null);

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

  const accounts = useQuery({ queryKey: financeKeys.accounts, queryFn: financeApi.accounts });
  const query = { accountId, from, to, page: page > 1 ? page : undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: financeKeys.ledger(query), queryFn: () => financeApi.ledger(query), placeholderData: keepPreviousData });
  useClampPage(data ? { items: data.rows, total: data.total, page: data.page, pageSize: data.pageSize } : undefined, (next) => setParam("page", next > 1 ? String(next) : null));

  const fetchAll = () => financeApi.ledger({ accountId, from, to, export: "1" });

  // Print every line, not just the page on screen.
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

  const showAccount = data?.accountId === null;
  const table = (ledger: LedgerView) => (
    <div className="overflow-x-auto rounded-3xl bg-surface print:rounded-none">
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">Ledger for {ledger.accountName}</caption>
        <thead>
          <tr className="border-b border-line text-left text-muted-foreground">
            <th scope="col" className="px-4 py-3 font-medium">Date</th>
            <th scope="col" className="px-4 py-3 font-medium">Details</th>
            <th scope="col" className="px-4 py-3 font-medium">Category</th>
            {ledger.accountId === null ? <th scope="col" className="px-4 py-3 font-medium">Account</th> : null}
            <th scope="col" className="px-4 py-3 text-right font-medium">Money in</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Money out</th>
            {ledger.accountId === null ? null : <th scope="col" className="px-4 py-3 text-right font-medium">Balance</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {ledger.rows.map((row, i) => (
            <tr key={`${row.date}-${row.reference}-${i}`}>
              <td className="px-4 py-2.5 whitespace-nowrap">{day(row.date)}</td>
              <td className="px-4 py-2.5">
                {row.voucherId ? <Link to={`/finance/vouchers/${row.voucherId}`} className="hover:underline">{row.description}</Link> : row.description}
                {row.reference ? <span className="block text-xs text-muted-foreground">{row.reference}</span> : null}
              </td>
              <td className="px-4 py-2.5">{row.category}</td>
              {ledger.accountId === null ? <td className="px-4 py-2.5">{row.account}</td> : null}
              <td className="px-4 py-2.5 text-right tabular-nums">{row.inPkr ? <Flow inPkr={row.inPkr} outPkr={0} /> : "—"}</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{row.outPkr ? <Flow inPkr={0} outPkr={row.outPkr} /> : "—"}</td>
              {ledger.accountId === null ? null : <td className="px-4 py-2.5 text-right font-medium tabular-nums"><Balance value={row.balancePkr ?? 0} /></td>}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-line bg-paper font-semibold">
            <td className="px-4 py-3" colSpan={ledger.accountId === null ? 4 : 3}>Total for these dates</td>
            <td className="px-4 py-3 text-right tabular-nums">{pkr(ledger.totalInPkr)}</td>
            <td className="px-4 py-3 text-right tabular-nums">{pkr(ledger.totalOutPkr)}</td>
            {ledger.accountId === null ? null : <td className="px-4 py-3 text-right tabular-nums">{ledger.closingPkr === null ? "" : <Balance value={ledger.closingPkr} />}</td>}
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PageHeader
          title="Ledger"
          description="One account's lines with a running balance, or the day book of every account together."
          actions={
            <ExportButtons
              disabled={!data || data.total === 0}
              onExcel={async () => {
                const full = await fetchAll();
                await downloadXlsx(`Ledger ${full.accountName} ${full.from} to ${full.to}`, [{ name: "Ledger", rows: matrix(full, true), widths: [14, 44, 18, 26, 16, 16, 16] }]);
              }}
              onCsv={async () => {
                const full = await fetchAll();
                downloadCsv(`Ledger ${full.accountName} ${full.from} to ${full.to}`, matrix(full, false));
              }}
              onPrint={async () => setPrinting(await fetchAll())}
            />
          }
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="w-56">
          <Label htmlFor="l-account">Account</Label>
          <FormSelect id="l-account" value={accountId} onValueChange={(value) => setParam("accountId", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "All accounts (day book)" }, ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
        </div>
        <div className="w-44">
          <Label htmlFor="l-from">From</Label>
          <DatePicker id="l-from" value={from} onChange={(value) => setParam("from", value)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
        </div>
        <div className="w-44">
          <Label htmlFor="l-to">To</Label>
          <DatePicker id="l-to" value={to} onChange={(value) => setParam("to", value)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
        </div>
        <FetchingIndicator show={isFetching && !isPending} />
      </div>

      <div className="print:hidden">
        {isPending ? (
          <LoadingState variant="page" />
        ) : isError || !data ? (
          <ErrorState title="Couldn't load the ledger" description="Check the dates (the start must not be after the end) and your connection, then try again." onRetry={() => void refetch()} />
        ) : (
          <div className="space-y-4">
            {data.accountId ? (
              <section aria-label="Balances" className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl bg-surface p-4">
                  <p className="text-sm text-muted-foreground">Held on {day(data.from)}</p>
                  <p className="font-display text-2xl tabular-nums"><Balance value={data.openingPkr ?? 0} /></p>
                </div>
                <div className="rounded-3xl bg-surface p-4">
                  <p className="text-sm text-muted-foreground">In minus out</p>
                  <p className="font-display text-2xl tabular-nums"><Balance value={data.totalInPkr - data.totalOutPkr} /></p>
                </div>
                <div className="rounded-3xl bg-surface p-4">
                  <p className="text-sm text-muted-foreground">Held on {day(data.to)}</p>
                  <p className="font-display text-2xl tabular-nums"><Balance value={data.closingPkr ?? 0} /></p>
                </div>
              </section>
            ) : (
              <p className="text-sm text-muted-foreground">
                {data.total.toLocaleString("en-PK")} lines · in <strong className="text-success">{pkr(data.totalInPkr)}</strong> · out <strong className="text-danger">{pkr(data.totalOutPkr)}</strong>. Moving money between accounts is shown but not counted.
              </p>
            )}
            {data.rows.length ? table(data) : <EmptyState title="No money moved on these dates" description={showAccount ? "Try wider dates." : "Try wider dates. The balance above is still correct."} />}
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="line" busy={isFetching} onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)} />
          </div>
        )}
      </div>

      {printing ? (
        <div className="hidden print:block">
          <h1 className="font-display text-2xl">Ledger: {printing.accountName}</h1>
          <p className="mb-3 text-sm">
            {day(printing.from)} to {day(printing.to)}
            {printing.openingPkr !== null ? ` · opening ${pkr(printing.openingPkr)} · closing ${pkr(printing.closingPkr ?? 0)}` : ""}
          </p>
          {table(printing)}
        </div>
      ) : null}
    </div>
  );
}
