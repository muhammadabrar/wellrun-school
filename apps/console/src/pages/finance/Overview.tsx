import { useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Landmark, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { Balance, Flow, IncomeSpendBars, day } from "@/components/finance/finance-ui";
import { Button } from "@/components/ui/button";
import { financeApi, financeKeys } from "@/lib/finance-api";
import { pkr } from "@/lib/format";

export function FinanceOverviewPage() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: financeKeys.overview, queryFn: financeApi.overview });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Accounts"
        description="Where the school's money is, what came in and what went out. Fee payments and paid salaries appear here by themselves; you add everything else as vouchers."
        actions={
          <>
            <Button render={<Link to="/finance/vouchers/new?type=PAYMENT" />}>
              <ArrowUpRight className="size-4" aria-hidden /> Money out
            </Button>
            <Button variant="outline" render={<Link to="/finance/vouchers/new?type=RECEIPT" />}>
              <ArrowDownLeft className="size-4" aria-hidden /> Money in
            </Button>
            <Button variant="outline" render={<Link to="/finance/vouchers/new?type=TRANSFER" />}>
              <ArrowLeftRight className="size-4" aria-hidden /> Move money
            </Button>
          </>
        }
      />

      {isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load your accounts" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : (
        <>
          <section aria-label="This month" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-3xl bg-surface p-5">
              <p className="text-sm text-muted-foreground">Money held now</p>
              <p className="mt-1 font-display text-3xl tabular-nums"><Balance value={data.totalBalancePkr} /></p>
              <p className="mt-1 text-xs text-muted-foreground">Across {data.accounts.filter((a) => a.active).length} accounts</p>
            </div>
            <div className="rounded-3xl bg-surface p-5">
              <p className="text-sm text-muted-foreground">Came in, {data.month.label}</p>
              <p className="mt-1 font-display text-3xl tabular-nums text-success">{pkr(data.month.incomePkr)}</p>
            </div>
            <div className="rounded-3xl bg-surface p-5">
              <p className="text-sm text-muted-foreground">Went out, {data.month.label}</p>
              <p className="mt-1 font-display text-3xl tabular-nums text-orange">{pkr(data.month.expensePkr)}</p>
            </div>
            <div className="rounded-3xl bg-surface p-5">
              <p className="text-sm text-muted-foreground">{data.month.netPkr >= 0 ? "Left over" : "Short by"} this month</p>
              <p className={`mt-1 font-display text-3xl tabular-nums ${data.month.netPkr < 0 ? "text-danger" : ""}`}>{pkr(Math.abs(data.month.netPkr))}</p>
            </div>
          </section>

          <section aria-labelledby="accounts-h" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="accounts-h" className="font-display text-xl">Your accounts</h2>
              <Link to="/finance/settings" className="text-sm text-indigo underline">Manage accounts</Link>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {data.accounts.map((account) => (
                <li key={account.id}>
                  <Link to={`/finance/ledger?accountId=${account.id}`} className={`flex items-center gap-4 rounded-3xl bg-surface p-5 transition hover:ring-2 hover:ring-indigo/30 ${account.active ? "" : "opacity-60"}`}>
                    <span className="grid size-12 place-items-center rounded-2xl bg-indigo/10 text-indigo">
                      {account.kind === "CASH" ? <Wallet className="size-6" aria-hidden /> : <Landmark className="size-6" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{account.name}</span>
                      <span className="block font-display text-2xl tabular-nums"><Balance value={account.balancePkr} /></span>
                    </span>
                    {account.active ? null : <Badge tone="neutral">Off</Badge>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section aria-labelledby="trend-h" className="rounded-3xl bg-surface p-5">
              <h2 id="trend-h" className="mb-4 font-display text-xl">Last six months</h2>
              <IncomeSpendBars rows={data.trend} />
            </section>

            <section aria-labelledby="cats-h" className="rounded-3xl bg-surface p-5">
              <h2 id="cats-h" className="mb-4 font-display text-xl">This month by category</h2>
              {data.month.byCategory.length ? (
                <ul className="divide-y divide-line text-sm">
                  {data.month.byCategory.map((c) => (
                    <li key={`${c.kind}-${c.name}`} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate">{c.name}</span>
                      <span className={`shrink-0 tabular-nums ${c.kind === "INCOME" ? "text-success" : "text-danger"}`}>{c.kind === "INCOME" ? "+" : "-"}{pkr(c.amountPkr)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing has come in or gone out this month yet.</p>
              )}
            </section>
          </div>

          <section aria-labelledby="recent-h" className="rounded-3xl bg-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 id="recent-h" className="font-display text-xl">Latest activity</h2>
              <Link to="/finance/ledger" className="text-sm text-indigo underline">Open the day book</Link>
            </div>
            {data.recent.length ? (
              <ul className="divide-y divide-line text-sm">
                {data.recent.map((row, i) => (
                  <li key={`${row.date}-${row.reference}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate">{row.description}</span>
                      <span className="block text-xs text-muted-foreground">{day(row.date)} · {row.category} · {row.account}</span>
                    </span>
                    <span className="shrink-0 tabular-nums"><Flow inPkr={row.inPkr} outPkr={row.outPkr} /></span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing recorded yet" description="Add a voucher for money you spent or received, or record a fee payment." />
            )}
          </section>
        </>
      )}
    </div>
  );
}
