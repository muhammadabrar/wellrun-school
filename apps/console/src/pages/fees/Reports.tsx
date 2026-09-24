import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeReportsPage() {
  const [filters, setFilters] = useState({ from: "", to: "", className: "", method: "" });
  const [method, setMethod] = useState("");
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.feeReports(filters),
    queryFn: () => api.feeReports(filters),
  });

  function onFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setFilters({
      from: String(form.get("from")),
      to: String(form.get("to")),
      className: String(form.get("className")),
      method,
    });
  }

  if (isPending && !data) return <LoadingState variant="table" />;
  if (isError) return <ErrorState title="Could not load the report" description="Try again." onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader title="Fee reports" description="Completed collections for a date range, class, and method." />
      <form onSubmit={onFilter} className="rounded-3xl bg-surface p-4">
        <FieldGroup className="grid gap-3 sm:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="from">From</FieldLabel>
            <Input id="from" name="from" type="date" defaultValue={filters.from} />
          </Field>
          <Field>
            <FieldLabel htmlFor="to">To</FieldLabel>
            <Input id="to" name="to" type="date" defaultValue={filters.to} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rep-class">Class</FieldLabel>
            <Input id="rep-class" name="className" />
          </Field>
          <Field>
            <FieldLabel htmlFor="rep-method">Method</FieldLabel>
            <FormSelect
              id="rep-method"
              value={method || "all"}
              onValueChange={(value) => setMethod(value === "all" ? "" : value || "")}
              options={[
                { value: "all", label: "All methods" },
                { value: "cash", label: "Cash" },
                { value: "bank", label: "Bank" },
                { value: "cheque", label: "Cheque" },
                { value: "online", label: "Online" },
              ]}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" className="mt-4" variant="outline">
          Run report
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        {data.count} payments · {pkr(data.totalPkr)}
      </p>
      {!data.rows.length ? (
        <EmptyState title="No collections in this range" description="Widen the dates or clear the class filter." />
      ) : (
        <ul className="space-y-2">
          {data.rows.map((row) => (
            <li key={row.id} className="flex justify-between rounded-2xl bg-surface px-5 py-3 text-sm">
              <span>
                {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"} · {row.method}
              </span>
              <span>{pkr(row.amountPkr)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
