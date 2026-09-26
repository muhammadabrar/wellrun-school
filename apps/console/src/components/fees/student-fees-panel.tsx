import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, EmptyState, ErrorState, LoadingState } from "@wellrun/ui";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, type FeeInvoiceView } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { readYearId } from "@/lib/school-context";
import { CollectPaymentDialog } from "./collect-payment-dialog";
import { FeeStatusBadge, InvoiceBreakdown, PdfButton, formatDate, isPayable, methodLabel } from "./fee-ui";

export function StudentFeesPanel({ studentId, studentName, canMutate }: { studentId: string; studentName: string; canMutate: boolean }) {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.studentFees(studentId), queryFn: () => api.studentFees(studentId) });
  const [collectFor, setCollectFor] = useState<{ invoiceId: string | null } | null>(null);
  const [generate, setGenerate] = useState<"current" | "remaining" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const yearId = data?.assignment?.academicYearId || readYearId();

  const generateMut = useMutation({
    mutationFn: async (kind: "current" | "remaining") => {
      if (kind === "remaining") {
        const result = await api.generateRemainingForStudent(studentId, yearId);
        return result.createdInvoiceIds.length
          ? `Created ${result.createdInvoiceIds.length} invoice(s) for the rest of the year, ${pkr(result.totalPkr)} in total.`
          : "Every month this year is already invoiced.";
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

  const current = data.currentInvoice;
  const others = data.invoices.filter((row) => row.id !== current?.id);
  const hasOpen = data.invoices.some((row) => isPayable(row.status) && row.balancePkr > 0);
  const lastReceipt = data.payments.find((row) => row.status === "COMPLETED" && row.receiptId);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Outstanding</CardDescription>
            <CardTitle className="font-display text-3xl tabular-nums">{pkr(data.outstandingPkr)}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {data.overduePkr ? `${pkr(data.overduePkr)} is overdue` : data.outstandingPkr ? "Nothing overdue yet" : "All paid up"}
            </p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Credit balance</CardDescription>
            <CardTitle className="font-display text-3xl tabular-nums">{pkr(data.creditPkr)}</CardTitle>
            <p className="text-sm text-muted-foreground">{data.creditPkr ? "Taken off the next invoice automatically" : "No advance or extra payment"}</p>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Fee structure</CardDescription>
            <CardTitle className="text-xl">{data.assignment?.structureName ?? "Not assigned"}</CardTitle>
            <p className="text-sm text-muted-foreground">{data.assignment ? "Used for monthly invoices" : "Assign one to bill this student"}</p>
          </CardHeader>
        </Card>
      </div>

      {canMutate ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!hasOpen} onClick={() => setCollectFor({ invoiceId: null })}>
            Collect payment
          </Button>
          <Button type="button" variant="outline" disabled={!data.assignment} onClick={() => setGenerate("current")}>
            Generate this month's fee
          </Button>
          <Button type="button" variant="outline" disabled={!data.assignment} onClick={() => setGenerate("remaining")}>
            Invoice rest of the year
          </Button>
        </div>
      ) : null}
      {message ? (
        <p className="text-sm text-primary" role="status">
          {message}
        </p>
      ) : null}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle>{current ? current.title : "Current month"}</CardTitle>
            <CardDescription>
              {current ? `${current.invoiceNumber} · due ${formatDate(current.dueOn)}` : "No monthly invoice yet for this student."}
            </CardDescription>
          </div>
          {current ? <FeeStatusBadge status={current.status} /> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {current ? (
            <>
              <div className="max-w-md">
                <InvoiceBreakdown invoice={current} />
              </div>
              <InvoiceActions invoice={current} canMutate={canMutate} onCollect={() => setCollectFor({ invoiceId: current.id })} />
            </>
          ) : (
            <EmptyState
              title="No invoice this month"
              description={
                data.assignment
                  ? "Generate this month's fee above, or run Generate monthly fees for the whole class."
                  : "Assign a fee structure to this student first, then generate the month's fee."
              }
            />
          )}
          {lastReceipt?.receiptId ? (
            <p className="text-sm text-muted-foreground">
              Last payment {pkr(lastReceipt.amountPkr)} on {formatDate(lastReceipt.paymentDate)} ·{" "}
              <Link to={`/fees/receipt/${lastReceipt.receiptId}`} className="text-indigo">
                View receipt {lastReceipt.receiptNumber}
              </Link>
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <h3 className="text-base font-medium">Other invoices</h3>
        {!others.length ? (
          <p className="text-sm text-muted-foreground">No earlier invoices or admission fees for this student.</p>
        ) : (
          <div className="overflow-x-auto rounded-3xl bg-surface">
            <table className="w-full min-w-[40rem] text-left text-sm whitespace-nowrap">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Invoice</th>
                  <th className="px-4 py-3 font-medium">For</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {others.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-4 py-3">
                      <Link to={`/fees/invoices/${row.id}`} className="text-indigo">
                        {row.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{row.title}</td>
                    <td className="px-4 py-3">{formatDate(row.dueOn)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pkr(row.totalPkr)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{pkr(row.balancePkr)}</td>
                    <td className="px-4 py-3">
                      <FeeStatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canMutate && isPayable(row.status) && row.balancePkr > 0 ? (
                        <Button type="button" size="sm" onClick={() => setCollectFor({ invoiceId: row.id })}>
                          Collect
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-medium">Payments</h3>
        {!data.payments.length ? (
          <p className="text-sm text-muted-foreground">No payments recorded yet. Receipts appear here after you collect a payment.</p>
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
        title={generate === "current" ? "Generate this month's fee?" : "Invoice the rest of the year?"}
        description={
          generate === "current"
            ? `Creates this month's invoice for ${studentName} from their fee structure. Any credit balance is taken off automatically.`
            : `Creates one invoice for every remaining month this academic year — useful when a family pays the whole year upfront. Months already invoiced are skipped.`
        }
        confirmLabel="Generate"
        loading={generateMut.isPending}
        onClose={() => setGenerate(null)}
        onConfirm={() => {
          if (!generate) return;
          setMessage(null);
          void generateMut.mutateAsync(generate).finally(() => setGenerate(null));
        }}
      />
    </div>
  );
}

function InvoiceActions({ invoice, canMutate, onCollect }: { invoice: FeeInvoiceView; canMutate: boolean; onCollect: () => void }) {
  const receipt = invoice.payments.find((row) => row.status === "COMPLETED" && row.receiptId);
  return (
    <div className="flex flex-wrap gap-2">
      {canMutate && isPayable(invoice.status) && invoice.balancePkr > 0 ? (
        <Button type="button" onClick={onCollect}>
          Collect payment
        </Button>
      ) : null}
      <Button variant="outline" render={<Link to={`/fees/invoices/${invoice.id}`} />}>
        View invoice
      </Button>
      {invoice.status !== "CANCELLED" ? <PdfButton kind="challan" id={invoice.id} label="Download challan" size="default" /> : null}
      {receipt?.receiptId ? (
        <Button variant="outline" render={<Link to={`/fees/receipt/${receipt.receiptId}`} />}>
          View receipt
        </Button>
      ) : null}
    </div>
  );
}
