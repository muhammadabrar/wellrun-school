import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, ErrorState, LoadingState } from "@wellrun/ui";
import { ArrowLeft, Printer } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { DetailGrid, FeeLetterhead } from "@/components/fees/fee-ui";
import { PAYMENT_METHODS, PayLinesEditor, PayslipStatusBadge, cleanLines, formatDay, linesTotal } from "@/components/staff/staff-ui";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, type PayLine, type PayslipDetail } from "@/lib/api";
import { pkr, todayIso } from "@/lib/format";
import { queryKeys } from "@/lib/query";

/** Admin view: edit drafts, finalize, record payment, print. */
export function PayslipPage() {
  const { id = "" } = useParams();
  const query = useQuery({ queryKey: queryKeys.payslip(id), queryFn: () => api.payslip(id), enabled: Boolean(id) });
  return <PayslipScreen query={query} admin backTo={query.data ? `/payroll?period=${query.data.period}` : "/payroll"} backLabel="Payroll" />;
}

/** A staff member's own payslip, read-only. */
export function MyPayslipPage() {
  const { id = "" } = useParams();
  const query = useQuery({ queryKey: queryKeys.myPayslip(id), queryFn: () => api.myPayslip(id), enabled: Boolean(id) });
  return <PayslipScreen query={query} admin={false} backTo="/me" backLabel="My portal" />;
}

function PayslipScreen({
  query,
  admin,
  backTo,
  backLabel,
}: {
  query: { data?: PayslipDetail; isPending: boolean; isError: boolean; refetch: () => unknown };
  admin: boolean;
  backTo: string;
  backLabel: string;
}) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const [dialog, setDialog] = useState<"finalize" | "pay" | "cancel" | null>(null);
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState("bank");
  const [reference, setReference] = useState("");
  const slip = query.data;

  function done(next: PayslipDetail, message: string) {
    setDialog(null);
    queryClient.setQueryData(queryKeys.payslip(next.id), next);
    void queryClient.invalidateQueries({ queryKey: ["payroll", next.period] });
    void queryClient.invalidateQueries({ queryKey: queryKeys.staffMember(next.staff.id) });
    setNotice({ message, tone: "ok" });
  }
  function failed(err: unknown, fallback: string) {
    setDialog(null);
    setNotice({ message: err instanceof Error ? err.message : fallback, tone: "error" });
  }

  const finalize = useMutation({
    mutationFn: () => api.finalizePayslip(slip!.id),
    onSuccess: (next) => done(next, `Finalized. ${next.staff.name} can now see this payslip.`),
    onError: (err) => failed(err, "Could not finalize."),
  });
  const pay = useMutation({
    mutationFn: () => api.payPayslip(slip!.id, { paidOn, method, reference: reference.trim() || undefined }),
    onSuccess: (next) => done(next, `Marked paid on ${formatDay(next.paidOn)}.`),
    onError: (err) => failed(err, "Could not record the payment."),
  });
  const cancel = useMutation({
    mutationFn: () => api.cancelPayslip(slip!.id),
    onSuccess: (next) => done(next, "Payslip cancelled. Run payroll again for this month to make a new one."),
    onError: (err) => failed(err, "Could not cancel."),
  });

  if (query.isPending) return <LoadingState variant="form" />;
  if (query.isError || !slip) {
    return <ErrorState title="Couldn't load this payslip" description="It may not be finalized yet, or your connection dropped." onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link to={backTo} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> {backLabel}
        </Link>
        <div className="flex flex-wrap gap-2">
          {admin && slip.status === "DRAFT" ? (
            <Button type="button" onClick={() => setDialog("finalize")}>
              Finalize
            </Button>
          ) : null}
          {admin && slip.status === "FINALIZED" ? (
            <Button type="button" onClick={() => setDialog("pay")}>
              Mark as paid
            </Button>
          ) : null}
          {admin && (slip.status === "DRAFT" || slip.status === "FINALIZED") ? (
            <Button type="button" variant="ghost" onClick={() => setDialog("cancel")}>
              Cancel payslip
            </Button>
          ) : null}
          <Button type="button" variant="outline" icon={<Printer />} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {notice ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm print:hidden ${notice.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/5 text-primary"}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      ) : null}

      {admin && slip.status === "DRAFT" ? <DraftEditor key={slip.id + slip.netPkr + slip.notes} slip={slip} onSaved={(next) => done(next, "Payslip updated.")} onError={(err) => failed(err, "Could not save.")} /> : null}

      <PrintedPayslip slip={slip} />

      <Dialog
        open={dialog === "finalize"}
        title="Finalize this payslip?"
        description={`Net pay ${pkr(slip.netPkr)}. It can't be edited afterwards, and ${slip.staff.name} will see it in their portal.`}
        confirmLabel="Finalize"
        loading={finalize.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => finalize.mutate()}
      />
      <Dialog
        open={dialog === "cancel"}
        title="Cancel this payslip?"
        description="It stays on record as cancelled. You can create a new one by running payroll for the month again."
        confirmLabel="Cancel payslip"
        cancelLabel="Keep it"
        danger
        loading={cancel.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => cancel.mutate()}
      />
      <Dialog
        open={dialog === "pay"}
        title={`Record ${pkr(slip.netPkr)} paid to ${slip.staff.name}`}
        confirmLabel="Mark as paid"
        loading={pay.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => pay.mutate()}
      >
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="pay-date">Paid on</FieldLabel>
            <DatePicker id="pay-date" value={paidOn} onChange={setPaidOn} fromYear={new Date().getFullYear() - 1} />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-method">Method</FieldLabel>
            <FormSelect id="pay-method" value={method} onValueChange={(value) => setMethod(value ?? "bank")} options={PAYMENT_METHODS} />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-reference">Reference</FieldLabel>
            <Input id="pay-reference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Transaction or cheque no. (optional)" capitalize="none" />
          </Field>
        </div>
      </Dialog>
    </div>
  );
}

function DraftEditor({ slip, onSaved, onError }: { slip: PayslipDetail; onSaved: (next: PayslipDetail) => void; onError: (err: unknown) => void }) {
  const [basic, setBasic] = useState(String(slip.basicPkr));
  const [allowances, setAllowances] = useState<PayLine[]>(slip.allowances);
  const [deductions, setDeductions] = useState<PayLine[]>(slip.deductions);
  const [notes, setNotes] = useState(slip.notes);
  const gross = (Number(basic) || 0) + linesTotal(allowances);
  const net = gross - linesTotal(deductions);
  const save = useMutation({
    mutationFn: () =>
      api.updatePayslip(slip.id, { basicPkr: Number(basic) || 0, allowances: cleanLines(allowances), deductions: cleanLines(deductions), notes: notes.trim() }),
    onSuccess: onSaved,
    onError,
  });

  return (
    <section className="rounded-3xl bg-surface p-6 print:hidden">
      <h2 className="font-display text-xl">Adjust this draft</h2>
      <p className="mt-1 text-sm text-muted-foreground">Add a bonus or overtime as an allowance, and advances, unpaid leave or tax as deductions.</p>
      <form
        className="mt-5 flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field className="max-w-xs">
          <FieldLabel htmlFor="draft-basic">Basic salary (Rs.)</FieldLabel>
          <Input id="draft-basic" type="number" min={0} step={1} inputMode="numeric" value={basic} onChange={(event) => setBasic(event.target.value)} />
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel>Allowances &amp; additions</FieldLabel>
            <PayLinesEditor lines={allowances} onChange={setAllowances} addLabel="Add allowance" labelPlaceholder="e.g. Overtime" idPrefix="draft-allowance" />
          </Field>
          <Field>
            <FieldLabel>Deductions</FieldLabel>
            <PayLinesEditor lines={deductions} onChange={setDeductions} addLabel="Add deduction" labelPlaceholder="e.g. Advance" idPrefix="draft-deduction" />
          </Field>
        </div>
        <Field>
          <FieldLabel htmlFor="draft-notes">Note on payslip</FieldLabel>
          <Input id="draft-notes" value={notes} onChange={(event) => setNotes(event.target.value)} />
          <FieldDescription>Printed at the bottom of the payslip.</FieldDescription>
        </Field>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={`text-sm ${net < 0 ? "text-destructive" : ""}`}>
            Net pay <span className="font-display text-lg tabular-nums">{pkr(Math.max(0, net))}</span>
            {net < 0 ? " — deductions are more than gross pay" : null}
          </p>
          <Button type="submit" loading={save.isPending} disabled={net < 0}>
            Save changes
          </Button>
        </div>
      </form>
    </section>
  );
}

function PrintedPayslip({ slip }: { slip: PayslipDetail }) {
  const bank = [slip.staff.bankName, slip.staff.bankAccountTitle, slip.staff.bankAccountNo].filter(Boolean).join(" · ");
  const earnings: PayLine[] = [{ label: "Basic salary", amountPkr: slip.basicPkr }, ...slip.allowances];
  return (
    <article className="space-y-6 rounded-3xl bg-surface p-8 shadow-[0_12px_40px_rgba(22,22,29,0.06)] print:shadow-none">
      <FeeLetterhead school={slip.school} title="SALARY SLIP" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-display text-2xl">{slip.label}</p>
        <PayslipStatusBadge status={slip.status} />
      </div>
      {slip.status === "DRAFT" ? (
        <p className="rounded-xl bg-orange/10 px-4 py-2 text-center text-sm font-medium text-orange">Draft — not final until it is finalized.</p>
      ) : null}
      {slip.status === "CANCELLED" ? (
        <p className="rounded-xl bg-danger/10 px-4 py-2 text-center text-sm font-medium text-danger">This payslip was cancelled and is not valid.</p>
      ) : null}
      <DetailGrid
        rows={[
          ["Employee", slip.staff.name],
          ["Employee No", slip.staff.employeeNo],
          ["CNIC", slip.staff.cnic],
          ["Designation", [slip.staff.title, slip.staff.department].filter(Boolean).join(", ")],
          ["Payslip No", slip.payslipNo],
          ["Joining date", slip.staff.joinDate ? formatDay(slip.staff.joinDate) : ""],
          ...(bank ? ([["Bank account", bank]] as [string, string][]) : []),
          ...(slip.staff.campus ? ([["Campus", slip.staff.campus.name]] as [string, string][]) : []),
        ]}
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <PayTable caption="Earnings" lines={earnings} total={slip.grossPkr} totalLabel="Gross pay" />
        <PayTable caption="Deductions" lines={slip.deductions} total={slip.deductionPkr} totalLabel="Total deductions" empty="No deductions" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-line p-4">
        <div>
          <p className="text-sm text-muted-foreground">Net pay</p>
          <p className="text-xs text-muted-foreground">{rupeesInWords(slip.netPkr)}</p>
        </div>
        <p className="font-display text-3xl tabular-nums">{pkr(slip.netPkr)}</p>
      </div>
      {slip.status === "PAID" ? (
        <p className="text-sm">
          Paid on {formatDay(slip.paidOn)} by {PAYMENT_METHODS.find((row) => row.value === slip.method)?.label ?? slip.method}
          {slip.reference ? ` · Ref ${slip.reference}` : ""}.
        </p>
      ) : null}
      {slip.notes ? <p className="text-sm text-muted-foreground">Note: {slip.notes}</p> : null}
      <div className="grid grid-cols-2 gap-10 pt-10 text-center text-xs text-muted-foreground">
        <p className="border-t border-line pt-2">Employee signature</p>
        <p className="border-t border-line pt-2">Authorised signature</p>
      </div>
    </article>
  );
}

function PayTable({ caption, lines, total, totalLabel, empty }: { caption: string; lines: PayLine[]; total: number; totalLabel: string; empty?: string }) {
  return (
    <table className="w-full self-start text-sm">
      <caption className="mb-2 text-left font-medium">{caption}</caption>
      <tbody>
        {lines.length ? (
          lines.map((line, index) => (
            <tr key={`${line.label}-${index}`}>
              <td className="py-1.5">{line.label}</td>
              <td className="py-1.5 text-right tabular-nums">{pkr(line.amountPkr)}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td className="py-1.5 text-muted-foreground" colSpan={2}>
              {empty}
            </td>
          </tr>
        )}
        <tr className="border-t border-line font-medium">
          <td className="pt-2">{totalLabel}</td>
          <td className="pt-2 text-right tabular-nums">{pkr(total)}</td>
        </tr>
      </tbody>
    </table>
  );
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds) parts.push(`${ONES[hundreds]} hundred`);
  if (rest) parts.push(rest < 20 ? ONES[rest] : [TENS[Math.floor(rest / 10)], ONES[rest % 10]].filter(Boolean).join("-"));
  return parts.join(" ");
}

/** Pakistani grouping: crore, lakh, thousand. */
function rupeesInWords(amount: number) {
  let n = Math.max(0, Math.round(amount));
  if (!n) return "Rupees zero only";
  const parts: string[] = [];
  for (const [size, name] of [
    [10_000_000, "crore"],
    [100_000, "lakh"],
    [1_000, "thousand"],
  ] as const) {
    const count = Math.floor(n / size);
    if (count) parts.push(`${count >= 1000 ? rupeesInWords(count).replace(/^Rupees | only$/g, "") : belowThousand(count)} ${name}`);
    n %= size;
  }
  if (n) parts.push(belowThousand(n));
  return `Rupees ${parts.join(" ")} only`;
}
