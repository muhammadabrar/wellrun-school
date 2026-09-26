import { useQuery } from "@tanstack/react-query";
import { ErrorState, LoadingState } from "@wellrun/ui";
import { CheckCircle2, MessageCircle, Printer } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { DetailGrid, FeeLetterhead, PdfButton, formatDate, methodLabel } from "@/components/fees/fee-ui";
import { Button } from "@/components/ui/button";
import { api, type FeeReceipt } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";

/** wa.me needs an international number; Pakistani numbers are usually stored as 03xx… */
function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  return digits;
}

function parentMessage(receipt: FeeReceipt) {
  const parts = [
    `Dear ${receipt.guardian?.name || "Parent"},`,
    `${receipt.school.name} has received ${pkr(receipt.amountPaidPkr)} for ${receipt.student?.name ?? "your child"}${receipt.invoices[0] ? ` (${receipt.invoices.map((row) => row.title).join(", ")})` : ""}.`,
    `Receipt No: ${receipt.receiptNumber}, ${formatDate(receipt.receiptDate)}.`,
    `Remaining balance: ${pkr(receipt.remainingBalancePkr)}.`,
  ];
  if (receipt.creditPkr) parts.push(`${pkr(receipt.creditPkr)} is kept as credit for the next invoice.`);
  parts.push("Thank you.");
  return parts.join("\n");
}

export function ReceiptPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const justPaid = params.get("new") === "1";
  const { data: receipt, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.receipt(id),
    queryFn: () => api.feeReceipt(id),
    enabled: Boolean(id),
  });

  if (isPending) return <LoadingState variant="form" />;
  if (isError || !receipt) {
    return <ErrorState title="Could not load receipt" description="This receipt may have been removed. Open it again from the student's fees." onRetry={() => void refetch()} />;
  }

  const phone = whatsappNumber(receipt.guardian?.phone ?? "");
  const voided = receipt.status !== "COMPLETED";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {justPaid && !voided ? (
        <div className="flex items-start gap-3 rounded-3xl bg-success/10 p-5 print:hidden" role="status">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden />
          <div>
            <p className="font-display text-xl">Payment successful</p>
            <p className="text-sm text-muted-foreground">
              Receipt No <span className="font-medium text-foreground">{receipt.receiptNumber}</span> · {pkr(receipt.amountPaidPkr)} received
              {receipt.creditPkr ? ` · ${pkr(receipt.creditPkr)} saved as credit for the next invoice` : ""}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {receipt.student ? (
          <Link to={`/students/${receipt.student.id}?tab=fees`} className="text-sm text-indigo">
            Back to {receipt.student.name}'s fees
          </Link>
        ) : (
          <Link to="/fees/payments" className="text-sm text-indigo">
            Back to payments
          </Link>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => window.print()}>
            <Printer data-icon="inline-start" /> Print receipt
          </Button>
          <PdfButton kind="receipt" id={receipt.id} label="Download PDF" size="default" />
          {phone ? (
            <Button
              variant="outline"
              render={<a href={`https://wa.me/${phone}?text=${encodeURIComponent(parentMessage(receipt))}`} target="_blank" rel="noopener noreferrer" />}
            >
              <MessageCircle data-icon="inline-start" /> Send to parent
            </Button>
          ) : (
            <Button variant="outline" disabled title="No guardian phone number on file">
              <MessageCircle data-icon="inline-start" /> Send to parent
            </Button>
          )}
        </div>
      </div>

      <article className="space-y-6 rounded-3xl bg-surface p-8 shadow-[0_12px_40px_rgba(22,22,29,0.06)] print:shadow-none">
        <FeeLetterhead school={receipt.school} title="FEE PAYMENT RECEIPT" />
        {receipt.header ? <p className="text-center text-sm text-muted-foreground">{receipt.header}</p> : null}
        {voided ? (
          <p className="rounded-xl bg-danger/10 px-4 py-2 text-center text-sm font-medium text-danger">
            This payment was {receipt.status.toLowerCase()} — the receipt is no longer valid.
          </p>
        ) : null}
        <DetailGrid
          rows={[
            ["Receipt No", receipt.receiptNumber],
            ["Date", formatDate(receipt.receiptDate)],
            ["Student", receipt.student?.name ?? "Applicant"],
            ["Admission No", receipt.student?.admissionNo ?? ""],
            ["Class", receipt.student ? `${receipt.student.className} ${receipt.student.section}`.trim() : ""],
            [receipt.guardian?.relation ? capitalize(receipt.guardian.relation) : "Father/Guardian", receipt.guardian?.name ?? ""],
          ]}
        />

        <table className="w-full text-sm">
          <caption className="sr-only">Payment details</caption>
          <thead>
            <tr className="bg-paper text-left">
              <th scope="col" className="rounded-l-xl px-3 py-2 font-medium">
                Description
              </th>
              <th scope="col" className="rounded-r-xl px-3 py-2 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {receipt.lines.map((line, index) => (
              <tr key={`${line.description}-${index}`}>
                <td className="px-3 py-1.5">{line.description}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pkr(line.amountPkr)}</td>
              </tr>
            ))}
            {receipt.discountPkr ? (
              <tr className="text-success">
                <td className="px-3 py-1.5">Discount</td>
                <td className="px-3 py-1.5 text-right tabular-nums">−{pkr(receipt.discountPkr)}</td>
              </tr>
            ) : null}
            {receipt.lateFeePkr ? (
              <tr>
                <td className="px-3 py-1.5">Late fee</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{pkr(receipt.lateFeePkr)}</td>
              </tr>
            ) : null}
            <tr className="border-t border-line font-medium">
              <td className="px-3 pt-2.5">Total</td>
              <td className="px-3 pt-2.5 text-right tabular-nums">{pkr(receipt.totalPkr)}</td>
            </tr>
          </tbody>
        </table>

        <dl className="grid gap-2 rounded-2xl border border-line p-4 text-sm">
          <SummaryRow label="Amount paid" value={pkr(receipt.amountPaidPkr)} strong />
          <SummaryRow label="Payment method" value={`${methodLabel(receipt.method)}${receipt.referenceNumber ? ` · Ref ${receipt.referenceNumber}` : ""}`} />
          <SummaryRow label="Previous balance" value={pkr(receipt.previousBalancePkr)} />
          <SummaryRow label="Remaining balance" value={pkr(receipt.remainingBalancePkr)} strong />
          {receipt.creditPkr ? <SummaryRow label="Credit for next invoice" value={pkr(receipt.creditPkr)} /> : null}
        </dl>
        {receipt.invoices.length ? (
          <p className="text-xs text-muted-foreground">
            Paid against {receipt.invoices.map((row) => `${row.invoiceNumber} (${pkr(row.appliedPkr)})`).join(", ")}.
          </p>
        ) : null}
        {receipt.notes ? <p className="text-sm text-muted-foreground">Note: {receipt.notes}</p> : null}
        {receipt.footer ? <p className="text-sm text-muted-foreground">{receipt.footer}</p> : null}
      </article>
    </div>
  );
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={strong ? "font-display text-lg tabular-nums" : "tabular-nums"}>{value}</dd>
    </div>
  );
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
