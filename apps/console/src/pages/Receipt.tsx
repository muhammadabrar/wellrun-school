import { BrandLogo, LoadingState } from "@wellrun/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { t } from "@wellrun/i18n";
import { api } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";

export function ReceiptPage() {
  const copy = t("en");
  const { id } = useParams();
  const { data: payment } = useQuery({
    queryKey: queryKeys.receipt(id ?? ""),
    queryFn: () => api.receipt(id!),
    enabled: Boolean(id),
  });

  if (!payment) return <LoadingState variant="form" />;

  const student = payment.invoice.student;

  return (
    <div className="mx-auto max-w-xl">
      <Link to="/fees" className="text-sm text-indigo">
        Back to fees
      </Link>
      <article className="mt-4 rounded-3xl bg-surface p-10 shadow-[0_12px_40px_rgba(22,22,29,0.06)]">
        <BrandLogo />
        <h1 className="mt-2 font-display text-3xl">{copy.console.receipt}</h1>
        <p className="mt-1 text-muted-foreground">{payment.school?.name}</p>
        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Receipt</dt>
            <dd className="font-medium">{payment.receiptNo}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{new Date(payment.paidAt).toLocaleDateString("en-PK")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Student</dt>
            <dd>
              {student
                ? `${student.firstName} ${student.lastName} (${student.admissionNo})`
                : "Admission applicant"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">For</dt>
            <dd>{payment.invoice.feePlan.name}</dd>
          </div>
        </dl>
        <p className="mt-8 font-display text-4xl">{pkr(payment.amountPkr)}</p>
        <p className="mt-2 text-sm text-muted-foreground">Received by cash. Keep this receipt for school records.</p>
      </article>
    </div>
  );
}
