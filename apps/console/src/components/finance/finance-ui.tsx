import { VOUCHER_TYPE_LABEL, type VoucherType } from "@wellrun/shared";
import { Badge } from "@wellrun/ui";
import { pkr } from "@/lib/format";

export const TYPE_TONE: Record<VoucherType, "danger" | "success" | "indigo"> = { PAYMENT: "danger", RECEIPT: "success", TRANSFER: "indigo" };

export const TYPE_SHORT: Record<VoucherType, string> = { PAYMENT: "Payment", RECEIPT: "Receipt", TRANSFER: "Transfer" };

export function TypeBadge({ type }: { type: VoucherType }) {
  return <Badge tone={TYPE_TONE[type]}>{TYPE_SHORT[type]}</Badge>;
}

/** Money with a sign and colour: money in is green, money out is red. Zero shows as a dash. */
export function Flow({ inPkr, outPkr }: { inPkr: number; outPkr: number }) {
  if (!inPkr && !outPkr) return <span className="text-muted-foreground">—</span>;
  return inPkr ? <span className="text-success">+{pkr(inPkr)}</span> : <span className="text-danger">-{pkr(outPkr)}</span>;
}

export const typeLabel = (type: VoucherType) => VOUCHER_TYPE_LABEL[type];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function day(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
}

/** Negative balances are shown in red with a minus, because an account below zero needs attention. */
export function Balance({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`${value < 0 ? "text-danger" : ""} ${className}`}>{value < 0 ? `-${pkr(-value)}` : pkr(value)}</span>;
}

/** Income against spending for each month, as paired bars on one scale. */
export function IncomeSpendBars({ rows }: { rows: { label: string; incomePkr: number; expensePkr: number }[] }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.incomePkr, r.expensePkr]));
  return (
    <div>
      <ul className="space-y-3" aria-label="Income and spending by month">
        {rows.map((row) => (
          <li key={row.label} className="grid grid-cols-[4.5rem_1fr] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{row.label}</span>
            <div className="space-y-1" title={`${row.label}: in ${pkr(row.incomePkr)}, out ${pkr(row.expensePkr)}`}>
              <div className="flex items-center gap-2">
                <div className="h-2.5 rounded-full bg-success" style={{ width: `${Math.max(row.incomePkr ? 1 : 0, (row.incomePkr / max) * 100)}%` }} />
                <span className="text-xs tabular-nums text-muted-foreground">{pkr(row.incomePkr)}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-2.5 rounded-full bg-orange" style={{ width: `${Math.max(row.expensePkr ? 1 : 0, (row.expensePkr / max) * 100)}%` }} />
                <span className="text-xs tabular-nums text-muted-foreground">{pkr(row.expensePkr)}</span>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-success" aria-hidden /> Money in</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-orange" aria-hidden /> Money out</span>
      </p>
    </div>
  );
}
