import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { t } from "@wellrun/i18n";
import { api, type Invoice } from "../lib/api";
import { pkr } from "../lib/format";
import { Toast } from "../components/motion";

export function FeesPage() {
  const copy = t("en");
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    api.invoices().then(setInvoices);
  }, []);

  async function pay(invoice: Invoice) {
    const paid = invoice.payments.reduce((sum, p) => sum + p.amountPkr, 0);
    const remaining = invoice.amountPkr - paid;
    if (remaining <= 0) return;
    const payment = await api.pay({ invoiceId: invoice.id, amountPkr: remaining, method: "cash" });
    setToast(`Receipt ${payment.receiptNo} issued`);
    navigate(`/fees/receipt/${payment.id}`);
  }

  return (
    <div>
      <h1 className="font-display text-4xl">{copy.console.fees}</h1>
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
                      <button
                        type="button"
                        onClick={() => pay(invoice)}
                        className="rounded-xl bg-indigo px-3 py-2 text-sm font-medium text-white"
                      >
                        {copy.console.recordPayment}
                      </button>
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
      <Toast message={toast} />
    </div>
  );
}
