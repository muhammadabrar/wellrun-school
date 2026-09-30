import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, EmptyState, ErrorState, LoadingState } from "@wellrun/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { api, type FeeInvoiceView } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { readYearId } from "@/lib/school-context";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useCampus } from "@/hooks/use-campus";
import { CollectPaymentDialog } from "./collect-payment-dialog";
import { FeeStatusBadge, InvoiceBreakdown, PdfButton, formatDate, isPayable, methodLabel } from "./fee-ui";

export function StudentFeesPanel({ studentId, studentName, canMutate }: { studentId: string; studentName: string; canMutate: boolean }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.studentFees(studentId), queryFn: () => api.studentFees(studentId) });
  const [collectFor, setCollectFor] = useState<{ invoiceId: string | null } | null>(null);
  const [generate, setGenerate] = useState<"current" | "year" | null>(null);
  const [yearFrom, setYearFrom] = useState<"year_start" | "this_month">("year_start");
  const [message, setMessage] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { years } = useCampus();
  const yearId = data?.assignment?.academicYearId || readYearId();
  const year = years.find((row) => row.id === yearId) ?? null;
  const yearRange = year ? `${monthYear(year.startsOn)} – ${monthYear(year.endsOn)}` : "the academic year";

  const generateMut = useMutation({
    mutationFn: async (kind: "current" | "year") => {
      if (kind === "year") {
        const result = await api.generateYearForStudent(studentId, yearId, yearFrom);
        return result.createdInvoiceIds.length
          ? `Created ${result.createdInvoiceIds.length} invoice(s), ${pkr(result.totalPkr)} in total.`
          : "Every month in that range is already invoiced.";
      }
      const result = await api.generateCurrentForStudent(studentId, yearId);
      if (result.created) return `This month's invoice was created: ${pkr(result.totalPkr ?? 0)}.`;
      if (result.reason === "no_assignment") return "This student has no fee structure assigned, so there is nothing to bill.";
      if (result.reason === "zero_total") return "Nothing to bill this month after discounts.";
      return "This month is already invoiced.";
    },
    onSuccess: async (text) => {
      setMessage(text);
      await queryClient.invalidateQueries({ queryKey: ["fees"] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : "Could not generate the invoice."),
  });

  if (isPending) return <LoadingState variant="form" />;
  if (isError || !data) {
    return <ErrorState title="Could not load fees" description="We couldn't load this student's invoices. Try again." onRetry={() => void refetch()} />;
  }

  const unpaid = data.invoices
    .filter((row) => isPayable(row.status) && row.balancePkr > 0)
    .sort((x, y) => new Date(x.dueOn).getTime() - new Date(y.dueOn).getTime());
  const oldest = unpaid[0];
  const hasOpen = unpaid.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className={data.overduePkr ? "ring-1 ring-danger/30" : undefined}>
          <CardHeader>
            <CardDescription>Total due now</CardDescription>
            <CardTitle className="font-display text-3xl tabular-nums">{pkr(data.outstandingPkr)}</CardTitle>
            <p className={`text-sm ${data.overduePkr ? "text-danger" : "text-muted-foreground"}`}>
              {!hasOpen
                ? "All paid up"
                : `${unpaid.length} unpaid invoice${unpaid.length === 1 ? "" : "s"} · oldest ${oldest.periodLabel || oldest.title}${oldest.status === "OVERDUE" ? ", overdue" : ""}`}
            </p>
            {data.previousYearsPkr ? <p className="text-sm text-orange">Includes {pkr(data.previousYearsPkr)} from previous years</p> : null}
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Credit available</CardDescription>
            <CardTitle className={`font-display text-3xl tabular-nums ${data.creditPkr ? "text-success" : ""}`}>{pkr(data.creditPkr)}</CardTitle>
            <p className="text-sm text-muted-foreground">{data.creditPkr ? "Extra paid earlier — used on the next payment" : "Nothing paid in advance"}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Fee plan</CardDescription>
            <CardTitle className="text-xl">{data.assignment?.structureName ?? "Not assigned"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {!data.assignment
                ? "Assign a class fee structure to bill this student"
                : data.assignment.hasCustomFees
                  ? "Custom amounts agreed at admission"
                  : "Class fee amounts"}
            </p>
          </CardHeader>
        </Card>
      </div>

      {canMutate ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={!hasOpen} onClick={() => setCollectFor({ invoiceId: null })}>
            Collect payment
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="outline" disabled={!data.assignment} />}>
              Create invoices <ChevronDownIcon data-icon="inline-end" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setGenerate("current")}>This month's invoice</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGenerate("year")}>Academic year…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {!data.assignment ? <p className="text-sm text-muted-foreground">No fee plan assigned yet.</p> : null}
        </div>
      ) : null}
      {message ? (
        <p className="text-sm text-primary" role="status">
          {message}
        </p>
      ) : null}

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium">Fee statement</h3>
          <p className="text-sm text-muted-foreground">Every invoice for this student, newest first. Click a row to see what it's for.</p>
        </div>
        {!data.invoices.length ? (
          <EmptyState
            title="No invoices yet"
            description={data.assignment ? "Use Create invoices to bill this month or the whole year." : "Assign a fee plan first, then create invoices."}
          />
        ) : (
          <div className="overflow-x-auto rounded-3xl bg-surface">
            <table className="w-full min-w-[46rem] text-left text-sm whitespace-nowrap">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">For</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((row) => (
                  <StatementRow
                    key={row.id}
                    invoice={row}
                    canMutate={canMutate}
                    expanded={expanded === row.id}
                    onToggle={() => setExpanded((current) => (current === row.id ? null : row.id))}
                    onCollect={() => setCollectFor({ invoiceId: row.id })}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-base font-medium">Payments</h3>
          <p className="text-sm text-muted-foreground">Money received, with the receipt for each payment.</p>
        </div>
        {!data.payments.length ? (
          <p className="text-sm text-muted-foreground">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl bg-surface">
            <table className="w-full min-w-[36rem] text-left text-sm whitespace-nowrap">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Receipt</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.payments.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      {row.receiptId ? (
                        <Link to={`/fees/receipt/${row.receiptId}`} className="text-indigo">
                          {row.receiptNumber}
                        </Link>
                      ) : (
                        row.paymentNumber
                      )}
                    </td>
                    <td className="px-4 py-3">{formatDate(row.paymentDate)}</td>
                    <td className="px-4 py-3">
                      {methodLabel(row.method)}
                      {row.referenceNumber ? <span className="text-muted-foreground"> · {row.referenceNumber}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{pkr(row.amountPkr)}</td>
                    <td className="px-4 py-3">
                      <FeeStatusBadge status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <CollectPaymentDialog
        open={Boolean(collectFor)}
        studentId={studentId}
        studentName={studentName}
        invoiceId={collectFor?.invoiceId}
        onClose={() => setCollectFor(null)}
      />
      <Dialog
        open={Boolean(generate)}
        title={generate === "current" ? "Generate this month's fee?" : "Invoice academic year"}
        description={
          generate === "current"
            ? `Creates this month's invoice for ${studentName} at their assigned fees. Any credit balance is taken off automatically.`
            : `Creates one invoice per month for ${studentName} at their assigned fees. Months already invoiced are skipped.`
        }
        confirmLabel="Generate"
        loading={generateMut.isPending}
        onClose={() => setGenerate(null)}
        onConfirm={() => {
          if (!generate) return;
          setMessage(null);
          void generateMut.mutateAsync(generate).finally(() => setGenerate(null));
        }}
      >
        {generate === "year" ? (
          <fieldset className="space-y-2">
            <legend className="sr-only">Which months</legend>
            <RadioGroup value={yearFrom} onValueChange={(value) => setYearFrom(value as "year_start" | "this_month")} className="gap-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-sm has-data-checked:border-primary">
                <RadioGroupItem value="year_start" className="mt-0.5" />
                <span>
                  <span className="block font-medium">Whole year ({yearRange})</span>
                  <span className="block text-muted-foreground">Includes months before admission. Past months are due right away and show as overdue.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2.5 text-sm has-data-checked:border-primary">
                <RadioGroupItem value="this_month" className="mt-0.5" />
                <span>
                  <span className="block font-medium">From this month to year end</span>
                  <span className="block text-muted-foreground">For families paying the rest of the year upfront.</span>
                </span>
              </label>
            </RadioGroup>
          </fieldset>
        ) : null}
      </Dialog>
    </div>
  );
}

function StatementRow({
  invoice,
  canMutate,
  expanded,
  onToggle,
  onCollect,
}: {
  invoice: FeeInvoiceView;
  canMutate: boolean;
  expanded: boolean;
  onToggle: () => void;
  onCollect: () => void;
}) {
  const receipt = invoice.payments.find((row) => row.status === "COMPLETED" && row.receiptId);
  return (
    <>
      <tr className="cursor-pointer border-t border-line hover:bg-paper" onClick={onToggle}>
        <td className="px-4 py-3">
          <button type="button" className="flex items-center gap-2 text-left" aria-expanded={expanded} onClick={(event) => { event.stopPropagation(); onToggle(); }}>
            <ChevronRightIcon className={`size-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden />
            <span>
              <span className="block font-medium">{invoice.periodLabel || invoice.title}</span>
              <span className="block text-xs text-muted-foreground">{invoice.invoiceNumber}</span>
            </span>
          </button>
        </td>
        <td className="px-4 py-3">{formatDate(invoice.dueOn)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{pkr(invoice.totalPkr)}</td>
        <td className="px-4 py-3 text-right tabular-nums">{pkr(invoice.paidPkr + invoice.creditAppliedPkr)}</td>
        <td className="px-4 py-3 text-right font-medium tabular-nums">{pkr(invoice.balancePkr)}</td>
        <td className="px-4 py-3">
          <FeeStatusBadge status={invoice.status} />
        </td>
        <td className="px-4 py-3" onClick={(event) => event.stopPropagation()}>
          <div className="flex justify-end gap-1">
            {canMutate && isPayable(invoice.status) && invoice.balancePkr > 0 ? (
              <Button type="button" size="sm" onClick={onCollect}>
                Collect
              </Button>
            ) : null}
            {invoice.status !== "CANCELLED" ? <PdfButton kind="challan" id={invoice.id} label="Challan" variant="ghost" /> : null}
            {receipt?.receiptId ? (
              <Button size="sm" variant="ghost" render={<Link to={`/fees/receipt/${receipt.receiptId}`} />}>
                Receipt
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" render={<Link to={`/fees/invoices/${invoice.id}`} />}>
              View
            </Button>
          </div>
        </td>
      </tr>
      {expanded ? (
        <tr className="bg-paper/60">
          <td colSpan={7} className="px-4 pb-4 pl-10">
            <div className="max-w-md whitespace-normal">
              <InvoiceBreakdown invoice={invoice} />
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function monthYear(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}
