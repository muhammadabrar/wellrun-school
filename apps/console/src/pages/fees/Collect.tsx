import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeCollectPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [studentId, setStudentId] = useState("");
  const [method, setMethod] = useState("cash");
  const [error, setError] = useState<string | null>(null);
  const students = useQuery({
    queryKey: queryKeys.students({ q, page: 1, pageSize: 20 }),
    queryFn: () => api.students({ q, page: 1, pageSize: 20 }),
    enabled: q.trim().length >= 2 || Boolean(studentId),
  });
  const invoices = useQuery({
    queryKey: queryKeys.feeInvoices("open"),
    queryFn: () => api.feeInvoices(),
  });
  const collect = useMutation({
    mutationFn: api.collectFeePayment,
    onSuccess: async (payment) => {
      await queryClient.invalidateQueries({ queryKey: ["fees"] });
      navigate(`/fees/receipt/${payment.id}`);
    },
  });

  const open = useMemo(
    () =>
      (invoices.data ?? []).filter(
        (row) =>
          row.status !== "CANCELLED" &&
          row.status !== "PAID" &&
          row.status !== "DRAFT" &&
          (!studentId || row.student?.id === studentId) &&
          (!params.get("invoiceId") || row.id === params.get("invoiceId")),
      ),
    [invoices.data, params, studentId],
  );

  if (invoices.isPending && !invoices.data) return <LoadingState variant="form" />;
  if (invoices.isError) {
    return <ErrorState title="Could not load invoices" description="Try again." onRetry={() => void invoices.refetch()} />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const selected = form.getAll("invoiceId").map(String);
    const amountPkr = Number(form.get("amountPkr"));
    setError(null);
    try {
      await collect.mutateAsync({
        studentId: studentId || undefined,
        invoiceIds: selected.length ? selected : undefined,
        invoiceId: selected[0] || params.get("invoiceId") || undefined,
        amountPkr,
        method,
        referenceNumber: String(form.get("referenceNumber") || ""),
        notes: String(form.get("notes") || ""),
        paymentDate: String(form.get("paymentDate") || ""),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this payment");
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Collect payment" description="Allocate cash, bank, or online receipts across one or more invoices. Extra amount becomes student credit." />
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-6 rounded-3xl bg-surface p-6">
        <Field>
          <FieldLabel htmlFor="student-search">Student</FieldLabel>
          <Input
            id="student-search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by name or admission no."
          />
          {students.data?.items?.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {students.data.items.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    className={`rounded-xl px-3 py-2 ${studentId === row.id ? "bg-paper" : ""}`}
                    onClick={() => {
                      setStudentId(row.id);
                      setQ(`${row.firstName} ${row.lastName}`);
                    }}
                  >
                    {row.firstName} {row.lastName} ({row.admissionNo || row.rollNo})
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Open invoices</legend>
          {!open.length ? (
            <EmptyState title="No open invoices" description="Search for a student with an unpaid invoice." />
          ) : (
            <ul className="space-y-2">
              {open.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
                  <label className="flex items-center gap-3 text-sm">
                    <input type="checkbox" name="invoiceId" value={row.id} defaultChecked={params.get("invoiceId") === row.id || open.length === 1} />
                    <span>
                      {row.feePlan.name}
                      <span className="block text-muted-foreground">
                        {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Applicant"}
                      </span>
                    </span>
                  </label>
                  <span>{pkr(row.balanceAmountPkr ?? row.amountPkr)}</span>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="amount">Amount (Rs.)</FieldLabel>
            <Input id="amount" name="amountPkr" type="number" min={1} step={1} required defaultValue={open[0]?.balanceAmountPkr || open[0]?.amountPkr || ""} />
          </Field>
          <Field>
            <FieldLabel htmlFor="method">Method</FieldLabel>
            <FormSelect
              id="method"
              value={method}
              onValueChange={(value) => setMethod(value || "cash")}
              options={[
                { value: "cash", label: "Cash" },
                { value: "bank", label: "Bank" },
                { value: "cheque", label: "Cheque" },
                { value: "online", label: "Online" },
                { value: "other", label: "Other" },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="reference">Reference</FieldLabel>
            <Input id="reference" name="referenceNumber" />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-date">Date</FieldLabel>
            <Input id="pay-date" name="paymentDate" type="date" />
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor="notes">Notes</FieldLabel>
          <Textarea id="notes" name="notes" rows={3} />
        </Field>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" loading={collect.isPending} disabled={!open.length}>
          Record payment
        </Button>
      </form>
    </div>
  );
}
