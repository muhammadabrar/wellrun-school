import { Badge, BrandLogo } from "@wellrun/ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api, type FeeInvoiceView, type SchoolLetterhead } from "@/lib/api";
import { mediaUrl, pkr } from "@/lib/format";

const STATUS: Record<string, { label: string; tone: "neutral" | "indigo" | "success" | "warning" | "danger" }> = {
  ISSUED: { label: "Unpaid", tone: "warning" },
  PARTIALLY_PAID: { label: "Partially paid", tone: "indigo" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  PAID: { label: "Paid", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
  DRAFT: { label: "Draft", tone: "neutral" },
  COMPLETED: { label: "Received", tone: "success" },
  VOIDED: { label: "Voided", tone: "neutral" },
  REFUNDED: { label: "Refunded", tone: "neutral" },
};

export function FeeStatusBadge({ status }: { status: string }) {
  const row = STATUS[status] ?? { label: status.toLowerCase(), tone: "neutral" as const };
  return <Badge tone={row.tone}>{row.label}</Badge>;
}

export const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "online", label: "Online" },
  { value: "other", label: "Other" },
];

export function methodLabel(method: string) {
  if (method === "credit") return "Student credit";
  return PAYMENT_METHODS.find((row) => row.value === method)?.label ?? method;
}

export function formatDate(value: string | Date) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function isPayable(status: string) {
  return status === "ISSUED" || status === "PARTIALLY_PAID" || status === "OVERDUE";
}

/** The fee lines of one invoice the way parents read them: each fee, discount, total, then what's been paid. */
export function InvoiceBreakdown({ invoice }: { invoice: FeeInvoiceView }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Fees for {invoice.title}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Fee</th>
          <th scope="col">Amount</th>
        </tr>
      </thead>
      <tbody>
        {invoice.lines.map((line, index) => (
          <tr key={`${line.description}-${index}`}>
            <td className="py-1.5">{line.description}</td>
            <td className="py-1.5 text-right tabular-nums">{pkr(line.amountPkr)}</td>
          </tr>
        ))}
        {invoice.discountPkr ? (
          <tr className="text-success">
            <td className="py-1.5">Discount</td>
            <td className="py-1.5 text-right tabular-nums">−{pkr(invoice.discountPkr)}</td>
          </tr>
        ) : null}
        {invoice.lateFeePkr ? (
          <tr>
            <td className="py-1.5">Late fee</td>
            <td className="py-1.5 text-right tabular-nums">{pkr(invoice.lateFeePkr)}</td>
          </tr>
        ) : null}
        <tr className="border-t border-line font-medium">
          <td className="pt-2.5 pb-1.5">Total</td>
          <td className="pt-2.5 pb-1.5 text-right tabular-nums">{pkr(invoice.totalPkr)}</td>
        </tr>
        {invoice.creditAppliedPkr ? (
          <tr className="text-success">
            <td className="py-1.5">Credit from earlier payment</td>
            <td className="py-1.5 text-right tabular-nums">−{pkr(invoice.creditAppliedPkr)}</td>
          </tr>
        ) : null}
        {invoice.paidPkr ? (
          <tr>
            <td className="py-1.5">Paid</td>
            <td className="py-1.5 text-right tabular-nums">−{pkr(invoice.paidPkr)}</td>
          </tr>
        ) : null}
        {invoice.status !== "CANCELLED" && (invoice.creditAppliedPkr || invoice.paidPkr) ? (
          <tr className="border-t border-line font-medium">
            <td className="pt-2.5">Balance due</td>
            <td className="pt-2.5 text-right tabular-nums">{pkr(invoice.balancePkr)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

/** Opens a PDF the API streams (challan or receipt) in a new tab, with a busy state on the button. */
export function PdfButton({
  kind,
  id,
  label,
  variant = "outline",
  size = "sm",
}: {
  kind: "challan" | "receipt";
  id: string;
  label: string;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "default";
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  async function open() {
    setBusy(true);
    setFailed(false);
    try {
      const url = kind === "challan" ? await api.challanPdf(id) : await api.receiptPdf(id);
      window.open(url, "_blank", "noopener");
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button type="button" variant={variant} size={size} loading={busy} onClick={() => void open()} aria-describedby={failed ? `${id}-${kind}-error` : undefined}>
      {failed ? <span id={`${id}-${kind}-error`}>Couldn't open — try again</span> : label}
    </Button>
  );
}

/** School header for printed fee documents (invoice, receipt). */
export function FeeLetterhead({ school, title }: { school: SchoolLetterhead; title: string }) {
  const contact = [school.phone && `Phone: ${school.phone}`, school.email && `Email: ${school.email}`].filter(Boolean).join("   ");
  return (
    <header className="border-b-2 pb-5" style={{ borderColor: school.primaryColor || undefined }}>
      <div className="flex items-start gap-4">
        {school.logoUrl ? <img src={mediaUrl(school.logoUrl)} alt="" className="h-16 w-16 object-contain" /> : <BrandLogo />}
        <div className="min-w-0 text-sm text-muted-foreground">
          <p className="font-display text-2xl text-foreground uppercase">{school.name}</p>
          {school.address ? <p>{school.address}</p> : null}
          {contact ? <p>{contact}</p> : null}
          {school.website ? <p>{school.website}</p> : null}
          {school.registrationNo ? <p>Registration No: {school.registrationNo}</p> : null}
        </div>
      </div>
      <p className="mt-5 text-center text-lg font-semibold tracking-wide">{title}</p>
    </header>
  );
}

export function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
