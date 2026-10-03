import type { CategoryKind, LedgerRow, LedgerSource } from "@wellrun/shared";

/** One thing that happened to the school's money, whatever recorded it: a voucher, a fee payment or a paid salary. */
export type LedgerEntry = {
  /** YYYY-MM-DD, Pakistan time. */
  date: string;
  /** Orders entries that share a day. */
  order: string;
  description: string;
  reference: string;
  category: string;
  /** IN and OUT move money into or out of one account; TRANSFER moves it between two and is neither income nor expense. */
  kind: "IN" | "OUT" | "TRANSFER";
  amountPkr: number;
  accountId: string;
  toAccountId: string | null;
  source: LedgerSource;
  voucherId: string | null;
};

export type AccountBasis = { id: string; name: string; openingBalancePkr: number; openingOn: string };

type Leg = { accountId: string; inPkr: number; outPkr: number };

/** The effect of an entry on each account it touches. */
export function legsOf(entry: LedgerEntry): Leg[] {
  if (entry.kind === "IN") return [{ accountId: entry.accountId, inPkr: entry.amountPkr, outPkr: 0 }];
  if (entry.kind === "OUT") return [{ accountId: entry.accountId, inPkr: 0, outPkr: entry.amountPkr }];
  return [
    { accountId: entry.accountId, inPkr: 0, outPkr: entry.amountPkr },
    ...(entry.toAccountId ? [{ accountId: entry.toAccountId, inPkr: entry.amountPkr, outPkr: 0 }] : []),
  ];
}

const byDate = (a: LedgerEntry, b: LedgerEntry) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order);

/** What an account held at the start of a day: its opening balance plus every movement since it opened. */
export function balanceBefore(account: AccountBasis, entries: LedgerEntry[], day: string) {
  let balance = account.openingBalancePkr;
  for (const entry of entries) {
    if (entry.date < account.openingOn || entry.date >= day) continue;
    for (const leg of legsOf(entry)) if (leg.accountId === account.id) balance += leg.inPkr - leg.outPkr;
  }
  return balance;
}

const nextDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** Balance at the end of a day, which is what the account holds "as of" that day. */
export const balanceOn = (account: AccountBasis, entries: LedgerEntry[], day: string) => balanceBefore(account, entries, nextDay(day));

/** One account's page of the book: opening balance for the period, every line with a running balance, and the closing balance. */
export function accountLedger(account: AccountBasis, entries: LedgerEntry[], from: string, to: string, names: Map<string, string>) {
  const start = from < account.openingOn ? account.openingOn : from;
  let running = balanceBefore(account, entries, start);
  const opening = running;
  const rows: LedgerRow[] = [];
  let totalIn = 0;
  let totalOut = 0;
  for (const entry of [...entries].sort(byDate)) {
    if (entry.date < start || entry.date > to) continue;
    for (const leg of legsOf(entry)) {
      if (leg.accountId !== account.id) continue;
      running += leg.inPkr - leg.outPkr;
      totalIn += leg.inPkr;
      totalOut += leg.outPkr;
      rows.push({
        date: entry.date,
        description: entry.kind === "TRANSFER" ? transferText(entry, account.id, names) : entry.description,
        reference: entry.reference,
        category: entry.kind === "TRANSFER" ? "Transfer" : entry.category,
        account: "",
        inPkr: leg.inPkr,
        outPkr: leg.outPkr,
        balancePkr: running,
        source: entry.source,
        voucherId: entry.voucherId,
      });
    }
  }
  return { openingPkr: opening, closingPkr: running, totalInPkr: totalIn, totalOutPkr: totalOut, rows };
}

function transferText(entry: LedgerEntry, viewing: string, names: Map<string, string>) {
  const from = names.get(entry.accountId) ?? "account";
  const to = (entry.toAccountId && names.get(entry.toAccountId)) || "account";
  const note = entry.description ? `. ${entry.description}` : "";
  return viewing === entry.accountId ? `Moved to ${to}${note}` : `Received from ${from}${note}`;
}

/** Every line across every account, newest information first read left to right. Transfers show once and add nothing to either total. */
export function dayBook(entries: LedgerEntry[], from: string, to: string, names: Map<string, string>) {
  const rows: LedgerRow[] = [];
  let totalIn = 0;
  let totalOut = 0;
  for (const entry of [...entries].sort(byDate)) {
    if (entry.date < from || entry.date > to) continue;
    const isTransfer = entry.kind === "TRANSFER";
    const inPkr = entry.kind === "IN" ? entry.amountPkr : 0;
    const outPkr = entry.kind === "OUT" ? entry.amountPkr : 0;
    totalIn += inPkr;
    totalOut += outPkr;
    rows.push({
      date: entry.date,
      description: isTransfer ? `${names.get(entry.accountId) ?? "Account"} to ${(entry.toAccountId && names.get(entry.toAccountId)) || "account"}: Rs. ${entry.amountPkr.toLocaleString("en-PK")}${entry.description ? `. ${entry.description}` : ""}` : entry.description,
      reference: entry.reference,
      category: isTransfer ? "Transfer" : entry.category,
      account: names.get(entry.accountId) ?? "",
      inPkr,
      outPkr,
      balancePkr: null,
      source: entry.source,
      voucherId: entry.voucherId,
    });
  }
  return { rows, totalInPkr: totalIn, totalOutPkr: totalOut };
}

export type FlowSummary = {
  incomePkr: number;
  expensePkr: number;
  netPkr: number;
  byCategory: { name: string; kind: CategoryKind; amountPkr: number }[];
};

/** Income and expense over a period. Moving money between accounts is neither, so transfers are ignored. */
export function flowSummary(entries: LedgerEntry[], from: string, to: string): FlowSummary {
  const totals = new Map<string, { name: string; kind: CategoryKind; amountPkr: number }>();
  let income = 0;
  let expense = 0;
  for (const entry of entries) {
    if (entry.kind === "TRANSFER" || entry.date < from || entry.date > to) continue;
    const kind: CategoryKind = entry.kind === "IN" ? "INCOME" : "EXPENSE";
    if (kind === "INCOME") income += entry.amountPkr;
    else expense += entry.amountPkr;
    const key = `${kind}:${entry.category}`;
    const row = totals.get(key) ?? { name: entry.category, kind, amountPkr: 0 };
    row.amountPkr += entry.amountPkr;
    totals.set(key, row);
  }
  return {
    incomePkr: income,
    expensePkr: expense,
    netPkr: income - expense,
    byCategory: [...totals.values()].sort((a, b) => (a.kind === b.kind ? b.amountPkr - a.amountPkr : a.kind === "INCOME" ? -1 : 1)),
  };
}

/** Income and expense for each month from `from` to `to`, including months where nothing happened. */
export function monthlyFlow(entries: LedgerEntry[], months: string[]) {
  return months.map((month) => {
    const f = flowSummary(entries, `${month}-01`, `${month}-31`);
    return { month, incomePkr: f.incomePkr, expensePkr: f.expensePkr };
  });
}

/** Which kind of account a payment method lands in: cash goes to the cash box, everything else to the bank. */
export const accountKindForMethod = (method: string): "CASH" | "BANK" => (method.trim().toLowerCase() === "cash" ? "CASH" : "BANK");
