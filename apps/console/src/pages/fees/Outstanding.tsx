import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeOutstandingPage() {
  const [filters, setFilters] = useState({ className: "", section: "" });
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.feeOutstanding(filters),
    queryFn: () => api.feeOutstanding(filters),
  });

  function onFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFilters({ className: String(form.get("className")), section: String(form.get("section")) });
  }

  if (isPending && !data) return <LoadingState variant="table" />;
  if (isError) return <ErrorState title="Could not load outstanding fees" description="Try again." onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Outstanding" description="Unpaid and partially paid invoices." />
      <form onSubmit={onFilter} className="rounded-3xl bg-surface p-4">
        <FieldGroup className="flex flex-wrap items-end gap-3">
          <Field>
            <FieldLabel htmlFor="out-class">Class</FieldLabel>
            <Input id="out-class" name="className" />
          </Field>
          <Field>
            <FieldLabel htmlFor="out-section">Section</FieldLabel>
            <Input id="out-section" name="section" />
          </Field>
          <Button type="submit" variant="outline">
            Filter
          </Button>
        </FieldGroup>
      </form>
      {!data?.length ? (
        <EmptyState title="No outstanding fees" description="Everyone in this filter is paid up." />
      ) : (
        <ul className="space-y-3">
          {data.map((row) => (
            <li key={row.id} className="flex items-center justify-between rounded-2xl bg-surface px-5 py-4">
              <div>
                <p className="font-medium">
                  {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {row.name} · due {String(row.dueOn).slice(0, 10)}
                </p>
              </div>
              <div className="text-right">
                <p>{pkr(row.balanceAmountPkr)}</p>
                <Button size="sm" className="mt-1" render={<Link to={`/fees/payments/collect?invoiceId=${row.id}`} />}>
                  Collect
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
