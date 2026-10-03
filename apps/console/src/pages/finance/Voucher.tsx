import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, ErrorState, LoadingState } from "@wellrun/ui";
import { ArrowLeft, Printer } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { TypeBadge, day, typeLabel } from "@/components/finance/finance-ui";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { financeApi, financeKeys } from "@/lib/finance-api";
import { pkr } from "@/lib/format";

/** One voucher, laid out to print and sign. */
export function VoucherPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: financeKeys.voucher(id), queryFn: () => financeApi.voucher(id) });

  const cancel = useMutation({
    mutationFn: () => financeApi.voidVoucher(id, reason),
    onSuccess: (voucher) => {
      queryClient.setQueryData(financeKeys.voucher(id), voucher);
      void queryClient.invalidateQueries({ queryKey: financeKeys.root });
      setCancelling(false);
      setReason("");
      setToast("Voucher cancelled");
      setTimeout(() => setToast(null), 2200);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't cancel the voucher"),
  });

  if (isPending) return <LoadingState variant="page" />;
  if (isError || !data) return <ErrorState title="Couldn't load this voucher" description="It may have been removed, or the connection dropped." onRetry={() => void refetch()} />;

  const rows: [string, string][] = [
    ["Date", day(data.date)],
    ["Kind", typeLabel(data.type)],
    [data.type === "TRANSFER" ? "From account" : data.type === "PAYMENT" ? "Paid from" : "Paid into", data.accountName],
    ...(data.toAccountName ? ([["Into account", data.toAccountName]] as [string, string][]) : []),
    ...(data.categoryName ? ([[data.type === "PAYMENT" ? "Spent on" : "Source", data.categoryName]] as [string, string][]) : []),
    ...(data.party ? ([[data.type === "PAYMENT" ? "Paid to" : "Received from", data.party]] as [string, string][]) : []),
    ...(data.method ? ([["How", data.method.charAt(0).toUpperCase() + data.method.slice(1)]] as [string, string][]) : []),
    ...(data.reference ? ([["Cheque or slip no.", data.reference]] as [string, string][]) : []),
    ...(data.note ? ([["Note", data.note]] as [string, string][]) : []),
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <div className="print:hidden">
        <Link to="/finance/vouchers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Vouchers
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print
          </Button>
          {data.canVoid ? (
            <Button variant="outline" onClick={() => { setError(null); setCancelling(true); }}>
              Cancel this voucher
            </Button>
          ) : null}
        </div>
        {data.source === "INVENTORY" && data.status === "POSTED" ? <p className="mt-3 text-sm text-muted-foreground">This voucher came from buying stock. To cancel it, cancel the purchase on the item in Inventory.</p> : null}
      </div>

      <article className="rounded-3xl bg-surface p-8 print:rounded-none print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
          <div>
            <p className="text-sm text-muted-foreground">{data.type === "PAYMENT" ? "Payment voucher" : data.type === "RECEIPT" ? "Receipt voucher" : "Transfer voucher"}</p>
            <h1 className="font-display text-3xl">{data.number}</h1>
          </div>
          <div className="text-right">
            <TypeBadge type={data.type} />
            <p className="mt-2 font-display text-3xl tabular-nums">{pkr(data.amountPkr)}</p>
          </div>
        </header>

        {data.status === "VOIDED" ? (
          <p role="status" className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">
            Cancelled{data.voidedAt ? ` on ${day(data.voidedAt.slice(0, 10))}` : ""}{data.voidedBy ? ` by ${data.voidedBy}` : ""}: {data.voidReason}
          </p>
        ) : null}

        <dl className="mt-4 divide-y divide-line text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[10rem_1fr] gap-3 py-2.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd dir="auto">{value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-xs text-muted-foreground">Written {data.createdBy ? `by ${data.createdBy} ` : ""}on {day(data.createdAt.slice(0, 10))}</p>

        <div className="mt-12 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground">
          {["Prepared by", "Approved by", data.type === "RECEIPT" ? "Received from" : "Received by"].map((label) => (
            <div key={label}>
              <div className="h-10 border-b border-ink/40" />
              <p className="mt-1">{label}</p>
            </div>
          ))}
        </div>
      </article>

      <Dialog
        open={cancelling}
        title="Cancel this voucher?"
        description={`${data.number} will stay in the book, marked as cancelled. To correct it, write a new voucher afterwards.`}
        confirmLabel="Cancel voucher"
        cancelLabel="Keep it"
        danger
        loading={cancel.isPending}
        onConfirm={() => (reason.trim().length >= 3 ? cancel.mutate() : setError("Say why it is being cancelled"))}
        onClose={() => setCancelling(false)}
      >
        <Label htmlFor="void-reason">Why is it being cancelled?</Label>
        <Textarea id="void-reason" rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} dir="auto" />
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
      <Toast message={toast} />
    </div>
  );
}
