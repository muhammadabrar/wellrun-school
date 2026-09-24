import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeInvoicesPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("all");
  const [cancelId, setCancelId] = useState<string | null>(null);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.feeInvoices(status),
    queryFn: () => api.feeInvoices(status === "all" ? undefined : status),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelFeeInvoice(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fees", "invoices"] }),
  });

  if (isPending && !data) return <LoadingState variant="table" />;
  if (isError) return <ErrorState title="Could not load invoices" description="Try again." onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="Issued invoices for this campus and year."
        actions={
          <FormSelect
            value={status}
            onValueChange={(value) => setStatus(value || "all")}
            options={[
              { value: "all", label: "All statuses" },
              { value: "ISSUED", label: "Issued" },
              { value: "PARTIALLY_PAID", label: "Partially paid" },
              { value: "PAID", label: "Paid" },
              { value: "OVERDUE", label: "Overdue" },
              { value: "CANCELLED", label: "Cancelled" },
            ]}
          />
        }
      />
      {!data?.length ? (
        <EmptyState title="No invoices" description="Generate fees or accept an admission to create invoices." />
      ) : (
        <div className="overflow-hidden rounded-3xl bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Student</th>
                <th className="px-5 py-3 font-medium">Invoice</th>
                <th className="px-5 py-3 font-medium">Amount</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.map((invoice) => (
                <tr key={invoice.id} className="border-t border-line">
                  <td className="px-5 py-4">
                    {invoice.student
                      ? `${invoice.student.firstName} ${invoice.student.lastName}`
                      : invoice.application
                        ? `${invoice.application.firstName} ${invoice.application.lastName}`
                        : "Applicant"}
                  </td>
                  <td className="px-5 py-4">
                    {invoice.feePlan.name}
                    <span className="block text-muted-foreground">{invoice.invoiceNumber || invoice.billingPeriod}</span>
                  </td>
                  <td className="px-5 py-4">{pkr(invoice.amountPkr)}</td>
                  <td className="px-5 py-4">{invoice.status.replace("_", " ").toLowerCase()}</td>
                  <td className="px-5 py-4 text-right">
                    {(invoice.balanceAmountPkr ?? invoice.amountPkr) > 0 && invoice.status !== "CANCELLED" ? (
                      <Button size="sm" render={<Link to={`/fees/payments/collect?invoiceId=${invoice.id}`} />}>
                        Collect
                      </Button>
                    ) : null}
                    {invoice.status !== "CANCELLED" && (invoice.paidAmountPkr ?? 0) === 0 ? (
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCancelId(invoice.id)}>
                        Cancel
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Dialog
        open={Boolean(cancelId)}
        title="Cancel this invoice?"
        description="The invoice stays in the ledger as cancelled. It cannot be collected after this."
        confirmLabel="Cancel invoice"
        danger
        loading={cancel.isPending}
        onClose={() => setCancelId(null)}
        onConfirm={() => {
          if (!cancelId) return;
          void cancel.mutateAsync(cancelId).then(() => setCancelId(null));
        }}
      />
    </div>
  );
}
