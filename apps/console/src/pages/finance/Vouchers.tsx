import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { VOUCHER_TYPES } from "@wellrun/shared";
import { Badge, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Flow, TYPE_SHORT, TypeBadge, day } from "@/components/finance/finance-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { financeApi, financeKeys } from "@/lib/finance-api";
import { pkr, todayIso } from "@/lib/format";
import { useClampPage } from "@/lib/paging";

const ALL = "all";

export function VouchersPage() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const from = params.get("from") ?? `${today.slice(0, 4)}-01-01`;
  const to = params.get("to") ?? today;
  const type = params.get("type") ?? ALL;
  const accountId = params.get("accountId") ?? ALL;
  const categoryId = params.get("categoryId") ?? ALL;
  const cancelled = params.get("cancelled") === "1";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);

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

  useEffect(() => {
    const timer = window.setTimeout(() => search.trim() !== q && setParam("q", search.trim() || null), 300);
    return () => window.clearTimeout(timer);
  }, [search, q, setParam]);

  const accounts = useQuery({ queryKey: financeKeys.accounts, queryFn: financeApi.accounts });
  const categories = useQuery({ queryKey: financeKeys.categories, queryFn: financeApi.categories });
  const query = { from, to, type: type === ALL ? undefined : type, accountId: accountId === ALL ? undefined : accountId, categoryId: categoryId === ALL ? undefined : categoryId, status: cancelled ? "ALL" : undefined, q: q || undefined, page: page > 1 ? page : undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: financeKeys.vouchers(query), queryFn: () => financeApi.vouchers(query), placeholderData: keepPreviousData });
  useClampPage(data, (next) => setParam("page", next > 1 ? String(next) : null));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vouchers"
        description="Every payment, receipt and transfer written by hand. A mistake is cancelled and written again, so the record stays honest."
        actions={
          <Button render={<Link to="/finance/vouchers/new" />}>
            <Plus className="size-4" aria-hidden /> New voucher
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Label htmlFor="v-from">From</Label>
          <DatePicker id="v-from" value={from} onChange={(value) => setParam("from", value)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
        </div>
        <div className="w-44">
          <Label htmlFor="v-to">To</Label>
          <DatePicker id="v-to" value={to} onChange={(value) => setParam("to", value)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
        </div>
        <div className="w-44">
          <Label htmlFor="v-type">Kind</Label>
          <FormSelect id="v-type" value={type} onValueChange={(value) => setParam("type", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "All kinds" }, ...VOUCHER_TYPES.map((t) => ({ value: t, label: TYPE_SHORT[t] }))]} />
        </div>
        <div className="w-48">
          <Label htmlFor="v-account">Account</Label>
          <FormSelect id="v-account" value={accountId} onValueChange={(value) => setParam("accountId", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "All accounts" }, ...(accounts.data ?? []).map((a) => ({ value: a.id, label: a.name }))]} />
        </div>
        <div className="w-56">
          <Label htmlFor="v-cat">Category</Label>
          <FormSelect id="v-cat" value={categoryId} onValueChange={(value) => setParam("categoryId", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "All categories" }, ...(categories.data ?? []).filter((c) => !c.system).map((c) => ({ value: c.id, label: c.name }))]} />
        </div>
        <div className="w-56">
          <Label htmlFor="v-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="v-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Number, person, note" className="pl-9" />
          </div>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={cancelled} onChange={(event) => setParam("cancelled", event.target.checked ? "1" : null)} /> Show cancelled
        </label>
        <FetchingIndicator show={isFetching && !isPending} />
      </div>

      {isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load vouchers" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data.total.toLocaleString("en-PK")} {data.total === 1 ? "voucher" : "vouchers"} · money in <strong className="text-success">{pkr(data.totalInPkr)}</strong> · money out <strong className="text-danger">{pkr(data.totalOutPkr)}</strong>
            <span className="ml-1">(transfers are not counted)</span>
          </p>
          {data.items.length ? (
            <div className="overflow-x-auto rounded-3xl bg-surface">
              <table className="w-full min-w-max text-sm">
                <caption className="sr-only">Vouchers</caption>
                <thead>
                  <tr className="border-b border-line text-left text-muted-foreground">
                    <th scope="col" className="px-4 py-3 font-medium">Voucher</th>
                    <th scope="col" className="px-4 py-3 font-medium">Date</th>
                    <th scope="col" className="px-4 py-3 font-medium">Kind</th>
                    <th scope="col" className="px-4 py-3 font-medium">Details</th>
                    <th scope="col" className="px-4 py-3 font-medium">Category</th>
                    <th scope="col" className="px-4 py-3 font-medium">Account</th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.items.map((v) => (
                    <tr key={v.id} className={v.status === "VOIDED" ? "text-muted-foreground line-through decoration-muted-foreground/60" : ""}>
                      <td className="px-4 py-2.5">
                        <Link to={`/finance/vouchers/${v.id}`} className="font-medium text-indigo hover:underline">{v.number}</Link>
                        {v.status === "VOIDED" ? <Badge tone="neutral" className="ml-2 no-underline">Cancelled</Badge> : null}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">{day(v.date)}</td>
                      <td className="px-4 py-2.5"><TypeBadge type={v.type} /></td>
                      <td className="max-w-xs truncate px-4 py-2.5" title={[v.party, v.note].filter(Boolean).join(": ")}>{[v.party, v.note].filter(Boolean).join(": ") || "—"}</td>
                      <td className="px-4 py-2.5">{v.categoryName ?? "—"}</td>
                      <td className="px-4 py-2.5">{v.toAccountName ? `${v.accountName} → ${v.toAccountName}` : v.accountName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {v.type === "TRANSFER" ? pkr(v.amountPkr) : <Flow inPkr={v.type === "RECEIPT" ? v.amountPkr : 0} outPkr={v.type === "PAYMENT" ? v.amountPkr : 0} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No vouchers match" description="Widen the dates or clear a filter, or write a new voucher." action={<Button render={<Link to="/finance/vouchers/new" />}>New voucher</Button>} />
          )}
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="voucher" busy={isFetching} onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)} />
        </>
      )}
    </div>
  );
}
