import { useQuery } from "@tanstack/react-query";
import { fmt } from "@wellrun/i18n";
import { FileText, Receipt } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { BigButton, Card, Chip, Empty, ErrorBox, Loading, Screen } from "@/components/ui";
import { api, openPdf } from "@/lib/api";
import { formatDate, formatMonth, pkr } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { keys, useChild } from "@/lib/queries";

const STATUS_TONE: Record<string, "green" | "red" | "orange" | "indigo" | "grey"> = { PAID: "green", OVERDUE: "red", PARTIALLY_PAID: "orange", ISSUED: "indigo" };

export function FeesPage() {
  const { id = "" } = useParams();
  const { m, locale } = useLocale();
  const { child } = useChild(id);
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: keys.fees(id), queryFn: () => api.fees(id) });
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState(false);

  async function open(key: string, path: string) {
    setOpening(key);
    setOpenError(false);
    try {
      await openPdf(path);
    } catch {
      setOpenError(true);
    } finally {
      setOpening(null);
    }
  }

  const statusLabel = (status: string) => (m.fees[`status_${status}` as "status_PAID"] as string | undefined) ?? status;
  const periodLabel = (period: string) => (/^\d{4}-\d{2}$/.test(period) ? formatMonth(period, locale) : period);
  const methodLabel = (method: string) => (m.fees.methods as Record<string, string>)[method.toLowerCase()] ?? method;

  return (
    <Screen title={child ? `${child.firstName} · ${m.fees.title}` : m.fees.title} back={`/child/${id}`}>
      {isPending ? (
        <Loading />
      ) : isError || !data ? (
        <ErrorBox error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <Card className="text-center">
            <p className="text-lg text-muted">{m.fees.totalDue}</p>
            {data.totalDuePkr > 0 ? <p className="ltr-num mt-1 text-5xl font-semibold text-danger">{pkr(data.totalDuePkr)}</p> : <p className="mt-1 text-3xl font-semibold text-success">{m.fees.nothingDue}</p>}
          </Card>
          {openError ? (
            <p role="alert" className="text-center text-lg font-semibold text-danger">
              {m.fees.openFailed}
            </p>
          ) : null}

          <h2 className="pt-2 text-xl font-semibold">{m.fees.invoices}</h2>
          {data.invoices.length ? (
            <ul className="space-y-4">
              {data.invoices.map((invoice) => (
                <li key={invoice.id}>
                  <Card>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xl font-semibold">{periodLabel(invoice.period)}</p>
                      <Chip tone={STATUS_TONE[invoice.status] ?? "grey"}>{statusLabel(invoice.status)}</Chip>
                    </div>
                    <p className="ltr-num mt-2 text-3xl font-semibold">{pkr(invoice.totalPkr)}</p>
                    {invoice.paidPkr > 0 ? <p className="mt-1 text-lg text-muted">{fmt(m.fees.paidOf, { paid: pkr(invoice.paidPkr), total: pkr(invoice.totalPkr) })}</p> : null}
                    {invoice.balancePkr > 0 ? <p className="mt-1 text-lg font-semibold text-danger">{fmt(m.fees.balance, { amount: pkr(invoice.balancePkr) })}</p> : null}
                    <p className="mt-1 text-base text-muted">{fmt(m.fees.due, { date: formatDate(invoice.dueOn, locale) })}</p>
                    <div className="mt-4">
                      <BigButton tone="light" disabled={opening === invoice.id} onClick={() => void open(invoice.id, `/parent/children/${id}/invoices/${invoice.id}/challan`)}>
                        <FileText className="size-5" aria-hidden /> {m.fees.challan}
                      </BigButton>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title={m.fees.noInvoices} />
          )}

          <h2 className="pt-2 text-xl font-semibold">{m.fees.payments}</h2>
          {data.payments.length ? (
            <ul className="space-y-4">
              {data.payments.map((payment) => (
                <li key={payment.id}>
                  <Card>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="ltr-num text-2xl font-semibold text-success">{pkr(payment.amountPkr)}</p>
                      <p className="text-base text-muted">{formatDate(payment.date, locale)}</p>
                    </div>
                    <p className="mt-1 text-base text-muted">{fmt(m.fees.method, { method: methodLabel(payment.method) })}</p>
                    <div className="mt-4">
                      <BigButton tone="light" disabled={opening === payment.id} onClick={() => void open(payment.id, `/parent/children/${id}/payments/${payment.id}/receipt`)}>
                        <Receipt className="size-5" aria-hidden /> {m.fees.receipt}
                      </BigButton>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title={m.fees.noPayments} />
          )}
        </>
      )}
    </Screen>
  );
}
