import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, ErrorState, LoadingState } from "@wellrun/ui";
import { Printer } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CollectPaymentDialog } from "@/components/fees/collect-payment-dialog";
import { DetailGrid, FeeLetterhead, FeeStatusBadge, InvoiceBreakdown, PdfButton, formatDate, isPayable, methodLabel } from "@/components/fees/fee-ui";
import { Button } from "@/components/ui/button";
import { api, currentUser } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeInvoicePage() {
  const { id = "" } = useParams();
  const canMutate = currentUser()?.role === "SCHOOL_ADMIN";
  const queryClient = useQueryClient();
  const { data: invoice, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feeInvoice(id), queryFn: () => api.feeInvoice(id), enabled: Boolean(id) });
  const [collectOpen, setCollectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = useMutation({
    mutationFn: () => api.cancelFeeInvoice(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fees"] }),
  });

  if (isPending) return <LoadingState variant="form" />;
  if (isError || !invoice) {
    return <ErrorState title="Could not load this invoice" description="It may have been removed. Go back to Invoices and try again." onRetry={() => void refetch()} />;
  }

  const payable = isPayable(invoice.status) && invoice.balancePkr > 0;
  const cashPayments = invoice.payments.filter((row) => row.method !== "credit");
  const canCancel = canMutate && invoice.status !== "CANCELLED" && !cashPayments.some((row) => row.status === "COMPLETED");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to={invoice.student ? `/students/${invoice.student.id}?tab=fees` : "/fees/invoices"} className="text-sm text-indigo">
          {invoice.student ? `Back to ${invoice.student.name}'s fees` : "Back to invoices"}
        </Link>
        <div className="flex flex-wrap gap-2">
          {canMutate && payable && invoice.student ? <Button onClick={() => setCollectOpen(true)}>Collect payment</Button> : null}
          {invoice.status !== "CANCELLED" ? <PdfButton kind="challan" id={invoice.id} label="Download challan" size="default" /> : null}
          <Button type="button" variant="outline" onClick={() => window.print()}>
            <Printer data-icon="inline-start" /> Print
          </Button>
          {canCancel ? (
            <Button type="button" variant="ghost" onClick={() => setCancelOpen(true)}>
              Cancel invoice
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive print:hidden" role="alert">
          {error}
        </p>
      ) : null}

      <article className="space-y-6 rounded-3xl bg-surface p-8 shadow-[0_12px_40px_rgba(22,22,29,0.06)] print:shadow-none">
        <FeeLetterhead school={invoice.school} title="FEE INVOICE" />
        <div className="flex items-start justify-between gap-4">
          <DetailGrid
            rows={[
              ["Invoice No", invoice.invoiceNumber],
              ["For", invoice.title],
              ["Issue date", formatDate(invoice.issueDate)],
              ["Due date", formatDate(invoice.dueOn)],
              ["Student", invoice.student?.name ?? "Applicant"],
              ["Admission No", invoice.student?.admissionNo ?? ""],
              ["Class", invoice.student ? `${invoice.student.className} ${invoice.student.section}`.trim() : ""],
              [invoice.guardian?.relation ? capitalize(invoice.guardian.relation) : "Father/Guardian", invoice.guardian?.name ?? ""],
            ]}
          />
          <FeeStatusBadge status={invoice.status} />
        </div>
        <div className="rounded-2xl border border-line p-4">
          <InvoiceBreakdown invoice={invoice} />
        </div>
        <div className="flex items-baseline justify-between rounded-2xl bg-paper px-4 py-3">
          <span className="text-sm text-muted-foreground">{invoice.status === "CANCELLED" ? "Cancelled" : "Amount payable"}</span>
          <span className="font-display text-3xl tabular-nums">{pkr(invoice.balancePkr)}</span>
        </div>

        {invoice.payments.length ? (
          <section className="space-y-2">
            <h2 className="text-sm font-medium">Payments on this invoice</h2>
            <ul className="divide-y divide-line text-sm">
              {invoice.payments.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>
                    {formatDate(row.paymentDate)} · {methodLabel(row.method)}
                    {row.referenceNumber ? ` · ${row.referenceNumber}` : ""}
                    {row.status !== "COMPLETED" ? ` · ${row.status.toLowerCase()}` : ""}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{pkr(row.appliedPkr)}</span>
                    {row.receiptId ? (
                      <Link to={`/fees/receipt/${row.receiptId}`} className="text-indigo print:hidden">
                        {row.receiptNumber}
                      </Link>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </article>

      {invoice.student ? (
        <CollectPaymentDialog
          open={collectOpen}
          studentId={invoice.student.id}
          studentName={invoice.student.name}
          invoiceId={invoice.id}
          onClose={() => setCollectOpen(false)}
        />
      ) : null}
      <Dialog
        open={cancelOpen}
        title="Cancel this invoice?"
        description="The student will no longer owe this amount. Any credit that was applied to it goes back to the student. The invoice stays on record as cancelled, and the month can be generated again."
        confirmLabel="Cancel invoice"
        cancelLabel="Keep invoice"
        danger
        loading={cancel.isPending}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          setError(null);
          void cancel
            .mutateAsync()
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not cancel this invoice."))
            .finally(() => setCancelOpen(false));
        }}
      />
    </div>
  );
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}
