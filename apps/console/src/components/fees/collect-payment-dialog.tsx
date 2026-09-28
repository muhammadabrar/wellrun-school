import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "@wellrun/ui";
import { CheckCircle2, ChevronDownIcon } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { api, type FeeInvoiceView, type PaymentResult } from "@/lib/api";
import { pkr, todayIso } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { FeeStatusBadge, PAYMENT_METHODS, formatDate, isPayable } from "./fee-ui";

const ALL = "all";

export function CollectPaymentDialog({
  open,
  studentId,
  studentName,
  invoiceId,
  onClose,
  onPaid,
}: {
  open: boolean;
  studentId: string;
  studentName: string;
  invoiceId?: string | null;
  onClose: () => void;
  onPaid?: (result: PaymentResult) => void;
}) {
  if (!open) return null;
  return (
    <CollectPaymentForm
      studentId={studentId}
      studentName={studentName}
      invoiceId={invoiceId ?? null}
      onClose={onClose}
      onPaid={onPaid}
    />
  );
}

function CollectPaymentForm({
  studentId,
  studentName,
  invoiceId,
  onClose,
  onPaid,
}: {
  studentId: string;
  studentName: string;
  invoiceId: string | null;
  onClose: () => void;
  onPaid?: (result: PaymentResult) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fees = useQuery({ queryKey: queryKeys.studentFees(studentId), queryFn: () => api.studentFees(studentId) });
  const open = (fees.data?.invoices ?? [])
    .filter((row) => isPayable(row.status) && row.balancePkr > 0)
    .sort((a, b) => new Date(a.dueOn).getTime() - new Date(b.dueOn).getTime());

  // null = not touched yet: preselect the invoice the dialog was opened for, otherwise everything due.
  const [picked, setPicked] = useState<string[] | typeof ALL | null>(invoiceId ? [invoiceId] : null);
  const selection = picked ?? ALL;
  const chosen = selection === ALL ? open : open.filter((row) => selection.includes(row.id));
  const amountDue = chosen.reduce((sum, row) => sum + row.balancePkr, 0);
  const allSelected = selection === ALL || chosen.length === open.length;

  const creditAvailable = fees.data?.creditPkr ?? 0;
  const [useCredit, setUseCredit] = useState(true);
  const creditUsed = useCredit ? Math.min(creditAvailable, amountDue) : 0;
  const toCollect = amountDue - creditUsed;

  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState("cash");
  const [paymentDate, setPaymentDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);
  // One id per dialog: if Confirm is pressed twice (or the request is retried), the server returns
  // the first payment instead of recording a second one.
  const [requestId] = useState(() => crypto.randomUUID());
  // "saving" covers the whole hand-off, not just the HTTP call, so the button never looks idle
  // between the payment being recorded and the receipt opening.
  const [phase, setPhase] = useState<"form" | "saving" | "done">("form");
  const [doneMessage, setDoneMessage] = useState("");
  const amountValue = amount ?? String(toCollect || "");
  const paid = Number(amountValue) || 0;
  const busy = phase !== "form";

  const collect = useMutation({ mutationFn: api.collectFeePayment });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Escape inside the invoice dropdown should only close the dropdown, not the whole dialog.
      if (document.querySelector('[data-slot="popover-content"]')) return;
      if (event.key === "Escape" && phase !== "saving") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, onClose]);

  function refreshCaches() {
    void queryClient.invalidateQueries({ queryKey: ["fees"] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.student(studentId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.studentsRoot });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    if (!chosen.length) {
      setError("Choose at least one invoice.");
      return;
    }
    if (paid <= 0 && creditUsed <= 0) {
      setError("Enter the amount received.");
      return;
    }
    setPhase("saving");
    try {
      const result = await collect.mutateAsync({
        studentId,
        ...(chosen.length === 1 ? { invoiceId: chosen[0].id } : { invoiceIds: chosen.map((row) => row.id) }),
        amountPkr: paid,
        useCreditPkr: creditUsed || undefined,
        requestId,
        method,
        paymentDate,
        referenceNumber: String(form.get("referenceNumber") || ""),
        notes: String(form.get("notes") || ""),
      });
      refreshCaches();
      if (result.creditOnly) {
        setDoneMessage(`${pkr(result.creditAppliedPkr)} paid from ${studentName}'s credit. No cash was collected, so there's no receipt.`);
        setPhase("done");
        return;
      }
      if (onPaid) {
        onClose();
        onPaid(result);
        return;
      }
      setDoneMessage(`Payment recorded · receipt ${result.receiptNumber}. Opening receipt…`);
      setPhase("done");
      navigate(`/fees/receipt/${result.receiptId}?new=1`);
    } catch (err) {
      setPhase("form");
      setError(err instanceof Error ? err.message : "Could not record this payment. Nothing was charged — try again.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="collect-title">
      <button type="button" className="fixed inset-0 bg-ink/40" aria-label="Close" onClick={() => phase !== "saving" && onClose()} />
      <div className="relative my-8 w-full max-w-lg rounded-3xl bg-surface p-6 shadow-lg">
        <h2 id="collect-title" className="font-display text-2xl">
          Collect payment
        </h2>
        {phase === "done" ? (
          <div className="mt-5 space-y-4" role="status">
            <div className="flex items-start gap-3 rounded-2xl bg-success/10 p-4">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
              <p className="text-sm">{doneMessage}</p>
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : fees.isPending ? (
          <div className="mt-4">
            <LoadingState variant="form" />
          </div>
        ) : fees.isError ? (
          <div className="mt-4">
            <ErrorState title="Could not load this student's fees" description="Check the connection and try again." onRetry={() => void fees.refetch()} />
          </div>
        ) : !open.length ? (
          <div className="mt-4 space-y-4">
            <EmptyState title="Nothing due" description={`${studentName} has no unpaid invoices. Generate this month's fee first if it's missing.`} />
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={(event) => void onSubmit(event)} className="mt-5">
            <fieldset disabled={busy} className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 rounded-2xl bg-paper p-4 text-sm">
              <div>
                <dt className="text-muted-foreground">Student</dt>
                <dd className="font-medium">{studentName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{creditUsed ? "To collect" : "Amount due"}</dt>
                <dd className="font-display text-xl tabular-nums">{pkr(toCollect)}</dd>
                {creditUsed ? (
                  <dd className="text-xs text-muted-foreground">
                    {pkr(amountDue)} due − {pkr(creditUsed)} credit
                  </dd>
                ) : null}
              </div>
            </dl>

            <Field>
              <FieldLabel htmlFor="collect-invoices">Invoices</FieldLabel>
              <InvoicePicker
                id="collect-invoices"
                invoices={open}
                chosen={chosen}
                allSelected={allSelected}
                onChange={(next) => {
                  setPicked(next);
                  setAmount(null);
                }}
              />
            </Field>

            {creditAvailable > 0 ? (
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-success/40 bg-success/5 px-3 py-2.5 text-sm">
                <Checkbox
                  checked={useCredit}
                  onCheckedChange={(checked) => {
                    setUseCredit(checked === true);
                    setAmount(null);
                  }}
                />
                <span className="flex-1">
                  Use credit balance <span className="text-muted-foreground">({pkr(creditAvailable)} available)</span>
                </span>
                {useCredit ? <span className="font-medium tabular-nums text-success">−{pkr(creditUsed)}</span> : null}
              </label>
            ) : null}

            <Field>
              <FieldLabel htmlFor="collect-amount">Amount received (Rs.)</FieldLabel>
              <Input
                id="collect-amount"
                type="number"
                min={0}
                step={1}
                required={!creditUsed}
                autoFocus
                value={amountValue}
                onChange={(event) => setAmount(event.target.value)}
              />
              {paid > 0 && paid < toCollect ? (
                <FieldDescription>
                  Partial payment — {pkr(toCollect - paid)} will stay due{chosen.length === 1 ? " on this invoice" : ". Oldest invoices are cleared first"}.
                </FieldDescription>
              ) : paid > toCollect ? (
                <FieldDescription>{pkr(paid - toCollect)} extra will be saved as credit and used on the next invoice.</FieldDescription>
              ) : !paid && creditUsed ? (
                <FieldDescription>Fully covered by credit — no cash to collect.</FieldDescription>
              ) : null}
            </Field>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Payment method</legend>
              <RadioGroup value={method} onValueChange={(value) => setMethod(String(value))} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PAYMENT_METHODS.map((row) => (
                  <label key={row.value} className="flex cursor-pointer items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm has-data-checked:border-primary">
                    <RadioGroupItem value={row.value} />
                    {row.label}
                  </label>
                ))}
              </RadioGroup>
            </fieldset>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="collect-date">Payment date</FieldLabel>
                <DatePicker id="collect-date" value={paymentDate} onChange={setPaymentDate} toYear={new Date().getFullYear()} />
              </Field>
              <Field>
                <FieldLabel htmlFor="collect-reference">Reference number</FieldLabel>
                <Input id="collect-reference" name="referenceNumber" autoComplete="off" />
                {method !== "cash" ? <FieldDescription>Cheque, transfer, or transaction number.</FieldDescription> : null}
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="collect-notes">Notes</FieldLabel>
              <Textarea id="collect-notes" name="notes" rows={2} />
            </Field>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            </fieldset>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" loading={busy} disabled={busy || !chosen.length}>
                {busy ? "Recording payment…" : paid ? `Confirm payment · ${pkr(paid)}` : `Pay ${pkr(creditUsed)} from credit`}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function InvoicePicker({
  id,
  invoices,
  chosen,
  allSelected,
  onChange,
}: {
  id: string;
  invoices: FeeInvoiceView[];
  chosen: FeeInvoiceView[];
  allSelected: boolean;
  onChange: (next: string[] | typeof ALL) => void;
}) {
  const chosenIds = new Set(chosen.map((row) => row.id));
  const total = invoices.reduce((sum, row) => sum + row.balancePkr, 0);
  const label = !chosen.length
    ? "Choose invoices"
    : allSelected && invoices.length > 1
      ? `All outstanding · ${invoices.length} invoices`
      : chosen.length === 1
        ? `${chosen[0].invoiceNumber} · ${chosen[0].periodLabel || chosen[0].title}`
        : `${chosen.length} invoices · ${chosen[0].periodLabel || chosen[0].title} – ${chosen[chosen.length - 1].periodLabel || chosen[chosen.length - 1].title}`;

  function toggle(invoiceId: string, checked: boolean) {
    const next = new Set(chosenIds);
    if (checked) next.add(invoiceId);
    else next.delete(invoiceId);
    onChange(next.size === invoices.length ? ALL : invoices.filter((row) => next.has(row.id)).map((row) => row.id));
  }

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button id={id} type="button" variant="outline" className="w-full justify-between font-normal" aria-label={`Invoices: ${label}`} />
        }
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon className="size-4 text-muted-foreground" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--anchor-width) min-w-80 gap-0 p-1">
        {invoices.length > 1 ? (
          <label className="flex cursor-pointer items-center gap-3 rounded-md border-b border-line px-2.5 py-2.5 hover:bg-muted">
            <Checkbox checked={allSelected} onCheckedChange={(checked) => onChange(checked ? ALL : [])} />
            <span className="flex-1 font-medium">All outstanding ({invoices.length})</span>
            <span className="tabular-nums">{pkr(total)}</span>
          </label>
        ) : null}
        <div className="max-h-72 overflow-y-auto">
          {invoices.map((row) => (
            <label key={row.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 hover:bg-muted">
              <Checkbox checked={chosenIds.has(row.id)} onCheckedChange={(checked) => toggle(row.id, checked === true)} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{row.periodLabel || row.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {row.invoiceNumber} · due {formatDate(row.dueOn)}
                </span>
              </span>
              {row.status === "OVERDUE" ? <FeeStatusBadge status={row.status} /> : null}
              <span className="tabular-nums">{pkr(row.balancePkr)}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
