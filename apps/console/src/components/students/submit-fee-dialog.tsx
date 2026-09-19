import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "@wellrun/ui";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

type FeeRow = {
  id: string;
  name: string;
  amountPkr: number;
  paidPkr: number;
  dueOn: string;
  receiptId: string | null;
  status: string;
};

export function SubmitFeeDialog({
  studentId,
  studentName,
  open,
  onClose,
}: {
  studentId: string;
  studentName: string;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.studentTab(studentId, "fees"),
    queryFn: () => api.studentTab<FeeRow[]>(studentId, "fees"),
    enabled: open && Boolean(studentId),
  });
  const [payingId, setPayingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const due = (data ?? []).filter((row) => row.status !== "VOID" && row.status !== "DRAFT" && row.paidPkr < row.amountPkr);

  async function pay(row: FeeRow) {
    const remaining = row.amountPkr - row.paidPkr;
    if (remaining <= 0) return;
    setPayingId(row.id);
    setError(null);
    try {
      const payment = await api.pay({ invoiceId: row.id, amountPkr: remaining, method: "cash" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentTab(studentId, "fees") });
      await queryClient.invalidateQueries({ queryKey: queryKeys.student(studentId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentsRoot });
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
      onClose();
      navigate(`/fees/receipt/${payment.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not record this payment.");
    } finally {
      setPayingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="submit-fee-title">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close submit fee" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-surface p-6 shadow-lg">
        <h2 id="submit-fee-title" className="font-display text-2xl">
          Submit fee
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">Record a payment for {studentName}.</p>
        <div className="mt-4">
          {isPending && !data ? (
            <LoadingState variant="form" />
          ) : isError ? (
            <ErrorState title="Could not load fees" description="Check the connection and try again." onRetry={() => void refetch()} />
          ) : !due.length ? (
            <EmptyState title="No outstanding fees" description="This student has no unpaid invoices right now." />
          ) : (
            <ul className="space-y-3">
              {due.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
                  <div>
                    <p className="font-medium">{row.name}</p>
                    <p className="text-sm text-muted-foreground">Due {String(row.dueOn).slice(0, 10)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm">{pkr(row.amountPkr - row.paidPkr)}</p>
                    <Button type="button" size="sm" className="mt-1" loading={payingId === row.id} onClick={() => void pay(row)}>
                      Record payment
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
