import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { formatDate, methodLabel } from "@/components/fees/fee-ui";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeReportsPage() {
  const [filters, setFilters] = useState({ from: "", to: "", className: "", method: "" });
  const [method, setMethod] = useState("");
  const [page, setPage] = useState(1);
  const query = { ...filters, page: page > 1 ? String(page) : undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: queryKeys.feeReports(query),
    queryFn: () => api.feeReports(query),
    placeholderData: keepPreviousData,
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
    setPage(1);
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
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {data.count.toLocaleString("en-PK")} payment{data.count === 1 ? "" : "s"} · {pkr(data.totalPkr)}
          {filters.from || filters.to ? "" : " · last 30 days"}
        </p>
        <FetchingIndicator show={isFetching && !isPending} label="Updating report" />
      </div>
      {!data.items.length ? (
        <EmptyState title="No collections in this range" description="Widen the dates or clear the class filter." />
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl bg-surface">
            <table className="w-full min-w-[36rem] text-left text-sm whitespace-nowrap">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3 tabular-nums">{row.paymentNumber}</td>
                    <td className="px-4 py-3">{formatDate(row.paymentDate)}</td>
                    <td className="px-4 py-3">{row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"}</td>
                    <td className="px-4 py-3">{methodLabel(row.method)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{pkr(row.amountPkr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="payment" busy={isFetching} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
