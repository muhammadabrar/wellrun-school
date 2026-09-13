import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { t } from "@wellrun/i18n";
import { api, type Payment } from "../lib/api";
import { pkr } from "../lib/format";

export function ReceiptPage() {
  const copy = t("en");
  const { id } = useParams();
  const [payment, setPayment] = useState<Payment | null>(null);

  useEffect(() => {
    if (id) api.receipt(id).then(setPayment);
  }, [id]);

  if (!payment) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;

  const student = payment.invoice.student;

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/fees" className="text-sm text-indigo">
        Back to fees
      </Link>
      <article className="mt-4 rounded-3xl bg-surface p-10 shadow-[0_12px_40px_rgba(22,22,29,0.06)]">
        <p className="font-display text-xs tracking-[0.18em] text-indigo uppercase">Wellrun School</p>
        <h1 className="mt-2 font-display text-3xl">{copy.console.receipt}</h1>
        <p className="mt-1 text-muted">{payment.school?.name}</p>
        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted">Receipt</dt>
            <dd className="font-medium">{payment.receiptNo}</dd>
          </div>
          <div>
            <dt className="text-muted">Date</dt>
            <dd>{new Date(payment.paidAt).toLocaleDateString("en-PK")}</dd>
          </div>
          <div>
            <dt className="text-muted">Student</dt>
            <dd>
              {student.firstName} {student.lastName} ({student.admissionNo})
            </dd>
          </div>
          <div>
            <dt className="text-muted">For</dt>
            <dd>{payment.invoice.feePlan.name}</dd>
          </div>
        </dl>
        <p className="mt-8 font-display text-4xl">{pkr(payment.amountPkr)}</p>
        <p className="mt-2 text-sm text-muted">Received by cash. Keep this receipt for school records.</p>
      </article>
    </div>
  );
}
