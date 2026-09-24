import { BrandLogo, ErrorState, LoadingState } from "@wellrun/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";

export function ReceiptPage() {
  const { id } = useParams();
  const { data: receipt, isError, refetch } = useQuery({
    queryKey: queryKeys.receipt(id ?? ""),
    queryFn: () => api.feeReceipt(id!),
    enabled: Boolean(id),
  });

  if (isError) {
    return <ErrorState title="Could not load receipt" description="This receipt may have been removed." onRetry={() => void refetch()} />;
  }
  if (!receipt) return <LoadingState variant="form" />;

  const student = receipt.student ?? receipt.invoice?.student;
  const lines = receipt.lines?.length ? receipt.lines : [{ description: receipt.invoice?.feePlan?.name ?? "Fee", amountPkr: receipt.amountPkr }];

  return (
    <div className="mx-auto max-w-xl">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/fees/receipts" className="text-sm text-indigo">
          Back to receipts
        </Link>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void api.receiptPdf(receipt.id).then((url) => {
              window.open(url, "_blank", "noopener");
            });
          }}
        >
          Download PDF
        </Button>
      </div>
      <article className="mt-4 rounded-3xl bg-surface p-10 shadow-[0_12px_40px_rgba(22,22,29,0.06)]">
        {receipt.logoUrl ? (
          <img src={receipt.logoUrl} alt="" className="h-12 w-auto" />
        ) : (
          <BrandLogo />
        )}
        <h1 className="mt-2 font-display text-3xl">Receipt</h1>
        <p className="mt-1 text-muted-foreground">{receipt.school?.name}</p>
        {receipt.header ? <p className="mt-2 text-sm text-muted-foreground">{receipt.header}</p> : null}
        <dl className="mt-8 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Receipt</dt>
            <dd className="font-medium">{receipt.receiptNumber || receipt.receiptNo}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Date</dt>
            <dd>{new Date(receipt.paymentDate || receipt.paidAt).toLocaleDateString("en-PK")}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Student</dt>
            <dd>
              {receipt.studentName ||
                (student ? `${student.firstName} ${student.lastName} (${student.admissionNo})` : "Admission applicant")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Method</dt>
            <dd>
              {receipt.method}
              {receipt.referenceNumber ? ` · ${receipt.referenceNumber}` : ""}
            </dd>
          </div>
        </dl>
        <ul className="mt-6 space-y-2 text-sm">
          {lines.map((line, index) => (
            <li key={`${line.description}-${index}`} className="flex justify-between">
              <span>{line.description}</span>
              <span>{pkr(line.amountPkr)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-8 font-display text-4xl">{pkr(receipt.paidPkr ?? receipt.amountPkr)}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Remaining {pkr(receipt.remainingPkr ?? 0)}. Keep this receipt for school records.
        </p>
        {receipt.fbr?.number ? <p className="mt-4 text-sm">FBR invoice {receipt.fbr.number}</p> : null}
        {receipt.footer ? <p className="mt-6 text-sm text-muted-foreground">{receipt.footer}</p> : null}
      </article>
    </div>
  );
}
