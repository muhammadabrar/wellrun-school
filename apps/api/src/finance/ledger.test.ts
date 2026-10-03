import { describe, expect, it } from "vitest";
import { accountKindForMethod, accountLedger, balanceBefore, balanceOn, dayBook, flowSummary, legsOf, monthlyFlow, type AccountBasis, type LedgerEntry } from "./ledger";

const cash: AccountBasis = { id: "cash", name: "Cash in hand", openingBalancePkr: 10_000, openingOn: "2026-10-01" };
const bank: AccountBasis = { id: "bank", name: "Bank account", openingBalancePkr: 100_000, openingOn: "2026-10-01" };
const names = new Map([["cash", "Cash in hand"], ["bank", "Bank account"]]);
let n = 0;
const entry = (over: Partial<LedgerEntry>): LedgerEntry => ({
  date: "2026-10-05",
  order: String(++n).padStart(4, "0"),
  description: "x",
  reference: "",
  category: "Other",
  kind: "IN",
  amountPkr: 1000,
  accountId: "cash",
  toAccountId: null,
  source: "VOUCHER",
  voucherId: null,
  ...over,
});

describe("legsOf", () => {
  it("moves money in or out of one account", () => {
    expect(legsOf(entry({ kind: "IN", amountPkr: 700 }))).toEqual([{ accountId: "cash", inPkr: 700, outPkr: 0 }]);
    expect(legsOf(entry({ kind: "OUT", amountPkr: 300 }))).toEqual([{ accountId: "cash", inPkr: 0, outPkr: 300 }]);
  });

  it("takes a transfer out of one account and puts the same amount into the other", () => {
    expect(legsOf(entry({ kind: "TRANSFER", amountPkr: 5000, accountId: "cash", toAccountId: "bank" }))).toEqual([
      { accountId: "cash", inPkr: 0, outPkr: 5000 },
      { accountId: "bank", inPkr: 5000, outPkr: 0 },
    ]);
  });
});

describe("account balances", () => {
  const entries = [
    entry({ date: "2026-10-02", kind: "IN", amountPkr: 20_000 }),
    entry({ date: "2026-10-03", kind: "OUT", amountPkr: 4_500 }),
    entry({ date: "2026-10-04", kind: "TRANSFER", amountPkr: 8_000, accountId: "cash", toAccountId: "bank" }),
    entry({ date: "2026-10-04", kind: "IN", amountPkr: 60_000, accountId: "bank" }),
  ];

  it("is the opening balance plus everything since, as of the end of a day", () => {
    expect(balanceOn(cash, entries, "2026-10-01")).toBe(10_000);
    expect(balanceOn(cash, entries, "2026-10-02")).toBe(30_000);
    expect(balanceOn(cash, entries, "2026-10-03")).toBe(25_500);
    expect(balanceOn(cash, entries, "2026-10-04")).toBe(17_500);
    expect(balanceOn(bank, entries, "2026-10-04")).toBe(168_000);
  });

  it("keeps the total across accounts unchanged by a transfer", () => {
    const before = balanceOn(cash, entries, "2026-10-03") + balanceOn(bank, entries, "2026-10-03");
    const after = balanceOn(cash, entries, "2026-10-04") + balanceOn(bank, entries, "2026-10-04");
    expect(after - before).toBe(60_000); // only the bank receipt added money
  });

  it("ignores anything from before the account opened", () => {
    const early = [entry({ date: "2026-09-20", kind: "IN", amountPkr: 99_999 })];
    expect(balanceOn(cash, early, "2026-10-05")).toBe(10_000);
  });

  it("can go negative when more was paid out than held", () => {
    expect(balanceOn(cash, [entry({ kind: "OUT", amountPkr: 15_000 })], "2026-10-05")).toBe(-5_000);
  });

  it("is the same when asked before a day or after the previous one", () => {
    expect(balanceBefore(cash, entries, "2026-10-04")).toBe(balanceOn(cash, entries, "2026-10-03"));
  });
});

describe("accountLedger", () => {
  const entries = [
    entry({ date: "2026-10-02", kind: "IN", amountPkr: 20_000, description: "Donation" }),
    entry({ date: "2026-10-03", kind: "OUT", amountPkr: 4_500, description: "Chalk" }),
    entry({ date: "2026-10-04", kind: "TRANSFER", amountPkr: 8_000, accountId: "cash", toAccountId: "bank", description: "" }),
    entry({ date: "2026-10-06", kind: "OUT", amountPkr: 1_000, description: "Tea" }),
  ];

  it("lists lines with a running balance that ends at the closing balance", () => {
    const ledger = accountLedger(cash, entries, "2026-10-01", "2026-10-31", names);
    expect(ledger.openingPkr).toBe(10_000);
    expect(ledger.rows.map((r) => r.balancePkr)).toEqual([30_000, 25_500, 17_500, 16_500]);
    expect(ledger.closingPkr).toBe(16_500);
    expect(ledger.totalInPkr).toBe(20_000);
    expect(ledger.totalOutPkr).toBe(13_500);
    expect(ledger.openingPkr + ledger.totalInPkr - ledger.totalOutPkr).toBe(ledger.closingPkr);
  });

  it("starts a later period from what the account held that morning", () => {
    const ledger = accountLedger(cash, entries, "2026-10-04", "2026-10-31", names);
    expect(ledger.openingPkr).toBe(25_500);
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.closingPkr).toBe(16_500);
  });

  it("starts at the opening date when asked for earlier days", () => {
    const ledger = accountLedger(cash, entries, "2026-09-01", "2026-10-03", names);
    expect(ledger.openingPkr).toBe(10_000);
    expect(ledger.closingPkr).toBe(25_500);
  });

  it("describes a transfer from each side", () => {
    const fromCash = accountLedger(cash, entries, "2026-10-01", "2026-10-31", names).rows.find((r) => r.category === "Transfer");
    const intoBank = accountLedger(bank, entries, "2026-10-01", "2026-10-31", names).rows.find((r) => r.category === "Transfer");
    expect(fromCash?.description).toBe("Moved to Bank account");
    expect(fromCash?.outPkr).toBe(8_000);
    expect(intoBank?.description).toBe("Received from Cash in hand");
    expect(intoBank?.inPkr).toBe(8_000);
  });

  it("puts lines on the same day in the order they were written", () => {
    const same = [entry({ date: "2026-10-05", order: "b", description: "second" }), entry({ date: "2026-10-05", order: "a", description: "first" })];
    expect(accountLedger(cash, same, "2026-10-01", "2026-10-31", names).rows.map((r) => r.description)).toEqual(["first", "second"]);
  });

  it("shows nothing but the balance for an account with no activity", () => {
    const ledger = accountLedger(bank, [], "2026-10-01", "2026-10-31", names);
    expect(ledger.rows).toEqual([]);
    expect(ledger.openingPkr).toBe(100_000);
    expect(ledger.closingPkr).toBe(100_000);
  });
});

describe("dayBook", () => {
  it("shows every account's lines, with transfers listed once and counted in neither total", () => {
    const entries = [
      entry({ date: "2026-10-02", kind: "IN", amountPkr: 20_000 }),
      entry({ date: "2026-10-03", kind: "OUT", amountPkr: 4_500, accountId: "bank" }),
      entry({ date: "2026-10-04", kind: "TRANSFER", amountPkr: 8_000, accountId: "cash", toAccountId: "bank", description: "Deposit" }),
    ];
    const book = dayBook(entries, "2026-10-01", "2026-10-31", names);
    expect(book.rows).toHaveLength(3);
    expect(book.totalInPkr).toBe(20_000);
    expect(book.totalOutPkr).toBe(4_500);
    expect(book.rows[2]).toMatchObject({ category: "Transfer", inPkr: 0, outPkr: 0, balancePkr: null });
    expect(book.rows[2]!.description).toContain("Cash in hand to Bank account");
    expect(book.rows[1]!.account).toBe("Bank account");
  });
});

describe("flowSummary", () => {
  const entries = [
    entry({ kind: "IN", amountPkr: 500_000, category: "Fee collection", source: "FEE" }),
    entry({ kind: "IN", amountPkr: 25_000, category: "Donations" }),
    entry({ kind: "OUT", amountPkr: 300_000, category: "Salaries", source: "PAYROLL" }),
    entry({ kind: "OUT", amountPkr: 40_000, category: "Rent" }),
    entry({ kind: "OUT", amountPkr: 5_000, category: "Rent" }),
    entry({ kind: "TRANSFER", amountPkr: 100_000, accountId: "cash", toAccountId: "bank" }),
    entry({ date: "2026-09-30", kind: "OUT", amountPkr: 999_999, category: "Rent" }),
  ];

  it("adds up income and expense for the period only, and ignores transfers", () => {
    const f = flowSummary(entries, "2026-10-01", "2026-10-31");
    expect(f.incomePkr).toBe(525_000);
    expect(f.expensePkr).toBe(345_000);
    expect(f.netPkr).toBe(180_000);
  });

  it("groups by category, income first and biggest first", () => {
    const f = flowSummary(entries, "2026-10-01", "2026-10-31");
    expect(f.byCategory).toEqual([
      { name: "Fee collection", kind: "INCOME", amountPkr: 500_000 },
      { name: "Donations", kind: "INCOME", amountPkr: 25_000 },
      { name: "Salaries", kind: "EXPENSE", amountPkr: 300_000 },
      { name: "Rent", kind: "EXPENSE", amountPkr: 45_000 },
    ]);
  });

  it("is zero for a period with nothing in it", () => {
    expect(flowSummary(entries, "2026-01-01", "2026-01-31")).toEqual({ incomePkr: 0, expensePkr: 0, netPkr: 0, byCategory: [] });
  });
});

describe("monthlyFlow", () => {
  it("returns a row for every month asked for, even empty ones", () => {
    const rows = monthlyFlow([entry({ date: "2026-09-10", kind: "IN", amountPkr: 100 }), entry({ date: "2026-10-10", kind: "OUT", amountPkr: 40 })], ["2026-08", "2026-09", "2026-10"]);
    expect(rows).toEqual([
      { month: "2026-08", incomePkr: 0, expensePkr: 0 },
      { month: "2026-09", incomePkr: 100, expensePkr: 0 },
      { month: "2026-10", incomePkr: 0, expensePkr: 40 },
    ]);
  });
});

describe("accountKindForMethod", () => {
  it("sends cash to the cash box and everything else to the bank", () => {
    expect(accountKindForMethod("cash")).toBe("CASH");
    expect(accountKindForMethod(" Cash ")).toBe("CASH");
    for (const m of ["bank", "cheque", "online", "other", ""]) expect(accountKindForMethod(m)).toBe("BANK");
  });
});
