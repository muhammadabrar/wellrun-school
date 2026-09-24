import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeePaymentsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feePayments, queryFn: api.feePayments });
  const [voidId, setVoidId] = useState<string | null>(null);
  const [refundId, setRefundId] = useState<string | null>(null);
  const reverse = useMutation({
    mutationFn: ({ id, mode }: { id: string; mode: "void" | "refund" }) =>
      mode === "void" ? api.voidFeePayment(id) : api.refundFeePayment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fees"] }),
  });

  if (isPending && !data) return <LoadingState variant="table" />;
  if (isError) return <ErrorState title="Could not load payments" description="Try again." onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Completed collections, voids, and refunds."
        actions={<Button render={<Link to="/fees/payments/collect" />}>Collect payment</Button>}
      />
      {!data?.length ? (
        <EmptyState title="No payments yet" description="Collect a payment to issue a receipt." />
      ) : (
        <div className="overflow-hidden rounded-3xl bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Payment</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-t border-line">
                  <td className="px-5 py-4">
                    {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"}
                  </td>
                  <td className="px-5 py-4">
                    {row.paymentNumber}
                    <span className="block text-muted-foreground">{row.method}</span>
                  </td>
                  <td className="px-5 py-4">{pkr(row.amountPkr)}</td>
                  <td className="px-5 py-4">{row.status.toLowerCase()}</td>
                  <td className="px-5 py-4 text-right">
                    {row.receipt ? (
                      <Link to={`/fees/receipt/${row.id}`} className="mr-3 text-indigo">
                        Receipt
                      </Link>
                    ) : null}
                    {row.status === "COMPLETED" && row.method !== "credit" ? (
                      <>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setVoidId(row.id)}>
                          Void
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setRefundId(row.id)}>
                          Refund
                        </Button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog
        open={Boolean(voidId)}
        title="Void this payment?"
        description="Allocations reverse and invoice balances return. The payment stays in the ledger as voided."
        confirmLabel="Void payment"
        danger
        loading={reverse.isPending}
        onClose={() => setVoidId(null)}
        onConfirm={() => {
          if (!voidId) return;
          void reverse.mutateAsync({ id: voidId, mode: "void" }).then(() => setVoidId(null));
        }}
      />
      <Dialog
        open={Boolean(refundId)}
        title="Refund this payment?"
        description="The payment is marked refunded and invoice balances are restored."
        confirmLabel="Refund"
        danger
        loading={reverse.isPending}
        onClose={() => setRefundId(null)}
        onConfirm={() => {
          if (!refundId) return;
          void reverse.mutateAsync({ id: refundId, mode: "refund" }).then(() => setRefundId(null));
        }}
      />
    </div>
  );
}
