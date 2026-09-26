import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeesDashboardPage() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feesDashboard, queryFn: api.feesDashboard });

  if (isPending && !data) return <LoadingState variant="page" />;
  if (isError || !data) {
    return <ErrorState title="Could not load fees" description="Check the connection and try again." onRetry={() => void refetch()} />;
  }

  const cards = [
    { label: "Collected today", value: pkr(data.todayPkr) },
    { label: "Collected this month", value: pkr(data.monthPkr) },
    { label: "Outstanding", value: pkr(data.outstandingPkr) },
    { label: "Overdue", value: pkr(data.overduePkr) },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Fees"
        description="What's been collected, what's still owed, and what needs chasing — this campus and year."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button render={<Link to="/fees/generate" />}>Generate monthly fees</Button>
            <Button variant="outline" render={<Link to="/fees/invoices" />}>
              Unpaid invoices
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader>
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="font-display text-3xl">{card.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["Unpaid", data.counts.unpaid],
          ["Partial", data.counts.partial],
          ["Paid", data.counts.paid],
          ["Overdue", data.counts.overdue],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardHeader>
              <CardDescription>{label}</CardDescription>
              <CardTitle>{value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Recent payments</CardTitle>
          </CardHeader>
          <CardContent>
            {!data.recentPayments.length ? (
              <EmptyState title="No payments yet" description="Collected payments appear here." />
            ) : (
              <ul className="space-y-3 text-sm">
                {data.recentPayments.map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <span>
                      {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"}
                      <span className="block text-muted-foreground">{row.method}</span>
                    </span>
                    <span>{pkr(row.amountPkr)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Overdue invoices</CardTitle>
          </CardHeader>
          <CardContent>
            {!data.overdueInvoices.length ? (
              <EmptyState title="Nothing overdue" description="Invoices past due appear here." />
            ) : (
              <ul className="space-y-3 text-sm">
                {data.overdueInvoices.map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <Link to={`/fees/invoices/${row.id}`} className="hover:text-indigo">
                      {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"}
                      <span className="block text-muted-foreground">{row.name}</span>
                    </Link>
                    <span>{pkr(row.amountPkr)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Recent receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {!data.recentReceipts.length ? (
              <EmptyState title="No receipts yet" description="Issued receipts appear here." />
            ) : (
              <ul className="space-y-3 text-sm">
                {data.recentReceipts.map((row) => (
                  <li key={row.id} className="flex justify-between gap-3">
                    <Link to={`/fees/receipt/${row.id}`} className="text-indigo">
                      {row.receiptNumber}
                    </Link>
                    <span>{pkr(row.amountPkr)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
