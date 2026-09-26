import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FeeStatusBadge, formatDate, methodLabel } from "@/components/fees/fee-ui";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, currentUser, type FeePaymentRow } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeePaymentsPage() {
  const canReverse = currentUser()?.role === "SCHOOL_ADMIN";
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [reverse, setReverse] = useState<{ row: FeePaymentRow; mode: "void" | "refund" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = { q: q || undefined };
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feePayments(query), queryFn: () => api.feePayments(query) });
  const reverseMut = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: "void" | "refund" }) => (mode === "void" ? api.voidFeePayment(id) : api.refundFeePayment(id)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fees"] }),
  });

  const rows = data ?? [];
  const today = new Date().toDateString();
  const todayTotal = rows.filter((row) => row.status === "COMPLETED" && new Date(row.paymentDate).toDateString() === today).reduce((sum, row) => sum + row.amountPkr, 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Payments" description="Money received, with the receipt for each payment. Collect new payments from the student's fees or the Invoices list." />
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-surface p-4">
        <Field className="w-full max-w-sm">
          <FieldLabel htmlFor="pay-search">Search</FieldLabel>
          <Input id="pay-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Student, admission no. or receipt no." />
        </Field>
        <p className="text-sm text-muted-foreground">
          Received today <span className="font-display text-xl text-foreground tabular-nums">{pkr(todayTotal)}</span>
        </p>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {isPending ? (
        <LoadingState variant="list" />
      ) : isError ? (
        <ErrorState title="Could not load payments" description="We couldn't retrieve payments. Please try again." onRetry={() => void refetch()} />
      ) : !rows.length ? (
        <EmptyState
          title={q ? "No payments match this search" : "No payments yet"}
          description={q ? "Check the spelling or search by receipt number." : "Payments appear here once you collect a fee from a student's Fees tab or the Invoices list."}
        />
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface">
          <table className="w-full min-w-[52rem] text-left text-sm whitespace-nowrap">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Receipt</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Student</th>
                <th className="px-4 py-3 font-medium">Paid against</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 text-right font-medium">Amount</th>
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
                    {row.receipt ? (
                      <Link to={`/fees/receipt/${row.receipt.id}`} className="text-indigo">
                        {row.receipt.receiptNumber}
                      </Link>
                    ) : (
                      row.paymentNumber
                    )}
                    <span className="block text-muted-foreground">{row.paymentNumber}</span>
                  </td>
                  <td className="px-4 py-3">{formatDate(row.paymentDate)}</td>
                  <td className="px-4 py-3">
                    {row.student ? (
                      <Link to={`/students/${row.student.id}?tab=fees`} className="font-medium hover:text-indigo">
                        {row.student.firstName} {row.student.lastName}
                      </Link>
                    ) : (
                      "Applicant"
                    )}
                    {row.student ? <span className="block text-muted-foreground">{row.student.admissionNo}</span> : null}
                  </td>
                  <td className="px-4 py-3">
                    {row.invoices.map((inv) => (
                      <Link key={inv.id} to={`/fees/invoices/${inv.id}`} className="block text-indigo">
                        {inv.periodLabel || inv.invoiceNumber}
                      </Link>
                    ))}
                  </td>
                  <td className="px-4 py-3">
                    {methodLabel(row.method)}
                    {row.referenceNumber ? <span className="block text-muted-foreground">{row.referenceNumber}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{pkr(row.amountPkr)}</td>
                  <td className="px-4 py-3">
                    <FeeStatusBadge status={row.status} />
                  </td>
                  <td className="px-4 py-3">
                    {canReverse && row.status === "COMPLETED" ? (
                      <div className="flex justify-end gap-1">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setReverse({ row, mode: "void" })}>
                          Void
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setReverse({ row, mode: "refund" })}>
                          Refund
                        </Button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={Boolean(reverse)}
        title={reverse?.mode === "refund" ? "Refund this payment?" : "Void this payment?"}
        description={
          reverse?.mode === "refund"
            ? `Marks ${pkr(reverse.row.amountPkr)} as returned to the family. The invoices it paid become due again.`
            : `Use this when a payment was entered by mistake. ${pkr(reverse?.row.amountPkr ?? 0)} is removed and the invoices it paid become due again. The receipt is marked void.`
        }
        confirmLabel={reverse?.mode === "refund" ? "Refund" : "Void payment"}
        danger
        loading={reverseMut.isPending}
        onClose={() => setReverse(null)}
        onConfirm={() => {
          if (!reverse) return;
          setError(null);
          void reverseMut
            .mutateAsync({ id: reverse.row.id, mode: reverse.mode })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not reverse this payment."))
            .finally(() => setReverse(null));
        }}
      />
    </div>
  );
}
