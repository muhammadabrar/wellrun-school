import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, EmptyState, LoadingState } from "@wellrun/ui";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "@wellrun/i18n";
import { api, type Invoice } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";
import { Toast } from "../components/motion";

export function FeesPage() {
  const copy = t("en");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: invoices, isPending } = useQuery({ queryKey: queryKeys.invoices, queryFn: api.invoices });
  const [toast, setToast] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);

  async function pay(invoice: Invoice) {
    const paid = invoice.payments.reduce((sum, p) => sum + p.amountPkr, 0);
    const remaining = invoice.amountPkr - paid;
    if (remaining <= 0) return;
    setPayingId(invoice.id);
    try {
      const payment = await api.pay({ invoiceId: invoice.id, amountPkr: remaining, method: "cash" });
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices });
      setToast(`Receipt ${payment.receiptNo} issued`);
      navigate(`/fees/receipt/${payment.id}`);
    } finally {
      setPayingId(null);
    }
  }

  if (isPending && !invoices) return <LoadingState variant="table" />;

  return (
    <div>
      <h1 className="font-display text-4xl">{copy.console.fees}</h1>
      {!invoices?.length ? (
        <div className="mt-8">
          <EmptyState title="No invoices this term" description="Fee invoices appear here once a student is billed." />
        </div>
      ) : (
        <div className="mt-8 overflow-hidden rounded-3xl bg-surface">
          <table className="w-full text-left">
            <thead className="text-sm text-muted">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Plan</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => {
                const paid = invoice.payments.reduce((sum, p) => sum + p.amountPkr, 0);
                return (
                  <tr key={invoice.id} className="border-t border-line">
                    <td className="px-5 py-4">
                      {invoice.student.firstName} {invoice.student.lastName}
                      <span className="block text-sm text-muted">{invoice.student.admissionNo}</span>
                    </td>
                    <td className="px-5 py-4">{invoice.feePlan.name}</td>
                    <td className="px-5 py-4">{pkr(invoice.amountPkr)}</td>
                    <td className="px-5 py-4">{invoice.status}</td>
                    <td className="px-5 py-4 text-right">
                      {paid < invoice.amountPkr ? (
                        <Button type="button" size="sm" loading={payingId === invoice.id} onClick={() => void pay(invoice)}>
                          {copy.console.recordPayment}
                        </Button>
                      ) : invoice.payments[0] ? (
                        <button
                          type="button"
                          onClick={() => navigate(`/fees/receipt/${invoice.payments[0].id}`)}
                          className="text-sm text-indigo"
                        >
                          {copy.console.receipt}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Toast message={toast} />
    </div>
  );
}
