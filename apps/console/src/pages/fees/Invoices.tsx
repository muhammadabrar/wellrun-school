import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { CollectPaymentDialog } from "@/components/fees/collect-payment-dialog";
import { FeeStatusBadge, PdfButton, formatDate, isPayable } from "@/components/fees/fee-ui";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCampus } from "@/hooks/use-campus";
import { api, currentUser, type FeeInvoiceRow } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

const STATUS_OPTIONS = [
  { value: "unpaid", label: "Unpaid (incl. partial & overdue)" },
  { value: "OVERDUE", label: "Overdue only" },
  { value: "PAID", label: "Paid" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "all", label: "All invoices" },
];

export function FeeInvoicesPage() {
  const canCollect = currentUser()?.role === "SCHOOL_ADMIN";
  const { classes } = useCampus();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "unpaid";
  const billingPeriod = params.get("billingPeriod") ?? "";
  const classId = params.get("classId") ?? "";
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [q, setQ] = useState(search);
  const [collect, setCollect] = useState<FeeInvoiceRow | null>(null);
  const selectedClass = classes.find((cls) => cls.id === classId) ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = {
    status,
    billingPeriod: billingPeriod || undefined,
    className: selectedClass?.name,
    section: selectedClass?.section,
    q: q || undefined,
  };
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feeInvoices(query), queryFn: () => api.feeInvoices(query) });

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  const rows = data ?? [];
  const balance = rows.reduce((sum, row) => sum + row.balancePkr, 0);
  const filtered = Boolean(billingPeriod || classId || q || status !== "unpaid");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Every fee invoice for this campus and year. Find a family, collect a payment, or print a challan."
        actions={<Button render={<Link to="/fees/generate" />}>Generate monthly fees</Button>}
      />
      <div className="grid gap-3 rounded-3xl bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field>
          <FieldLabel htmlFor="inv-search">Search</FieldLabel>
          <Input id="inv-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student, admission no. or invoice no." />
        </Field>
        <Field>
          <FieldLabel htmlFor="inv-status">Status</FieldLabel>
          <FormSelect id="inv-status" value={status} onValueChange={(value) => setParam("status", value && value !== "unpaid" ? value : "")} options={STATUS_OPTIONS} />
        </Field>
        <Field>
          <FieldLabel htmlFor="inv-month">Month</FieldLabel>
          <Input id="inv-month" type="month" value={billingPeriod} onChange={(event) => setParam("billingPeriod", event.target.value)} />
        </Field>
        <Field>
          <FieldLabel htmlFor="inv-class">Class</FieldLabel>
          <FormSelect
            id="inv-class"
            value={classId || "all"}
            onValueChange={(value) => setParam("classId", value && value !== "all" ? value : "")}
            options={[{ value: "all", label: "All classes" }, ...classes.map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}`.trim() }))]}
          />
        </Field>
      </div>

      {isPending ? (
        <LoadingState variant="list" />
      ) : isError ? (
        <ErrorState title="Could not load invoices" description="We couldn't retrieve the invoice list. Please try again." onRetry={() => void refetch()} />
      ) : !rows.length ? (
        <EmptyState
          title={filtered ? "No invoices match these filters" : "Nothing unpaid"}
          description={
            filtered
              ? "Try another month, class, or status."
              : "Every invoice is paid. Generate next month's fees when it's time."
          }
        />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {rows.length} invoice{rows.length === 1 ? "" : "s"}
            {balance ? ` · ${pkr(balance)} still due` : ""}
            {rows.length >= 300 ? " · showing the latest 300, narrow the filters to see more" : ""}
          </p>
          <div className="overflow-x-auto rounded-3xl bg-surface">
            <table className="w-full min-w-[56rem] text-left text-sm whitespace-nowrap">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">Student</th>
                  <th className="px-4 py-3 font-medium">For</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <Link to={`/fees/invoices/${row.id}`} className="text-indigo">
                        {row.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      {row.student ? (
                        <Link to={`/students/${row.student.id}?tab=fees`} className="font-medium hover:text-indigo">
                          {row.student.name}
                        </Link>
                      ) : (
                        "Applicant"
                      )}
                      {row.student ? (
                        <span className="block text-muted-foreground">
                          {row.student.admissionNo} · {`${row.student.className} ${row.student.section}`.trim()}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{row.periodLabel || row.title}</td>
                    <td className="px-4 py-3">{formatDate(row.dueOn)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pkr(row.totalPkr)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pkr(row.paidPkr)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{pkr(row.balancePkr)}</td>
                    <td className="px-4 py-3">
                      <FeeStatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canCollect && row.student && isPayable(row.status) && row.balancePkr > 0 ? (
                          <Button type="button" size="sm" onClick={() => setCollect(row)}>
                            Collect
                          </Button>
                        ) : null}
                        {row.status !== "CANCELLED" ? <PdfButton kind="challan" id={row.id} label="Challan" variant="ghost" /> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {collect?.student ? (
        <CollectPaymentDialog
          open
          studentId={collect.student.id}
          studentName={collect.student.name}
          invoiceId={collect.id}
          onClose={() => setCollect(null)}
        />
      ) : null}
    </div>
  );
}
