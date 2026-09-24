import { describe, expect, it } from "vitest";
import {
  allocateOldestFirst,
  buildInvoiceLines,
  computeLateFeePkr,
  invoiceStatusFromAmounts,
} from "./billing";

describe("billing", () => {
  const structure = [
    { feeHeadId: "tuition", name: "Tuition", amountPkr: 10000, isOptional: false, taxable: false },
    { feeHeadId: "bus", name: "Bus", amountPkr: 2000, isOptional: true, taxable: false },
  ];

  it("builds snapshot lines from structure, overrides, and discounts", () => {
    const lines = buildInvoiceLines(
      structure,
      [{ feeHeadId: "tuition", amountPkr: 8000, enabled: true }],
      [{ type: "PERCENT", value: 10, feeHeadIds: ["tuition"] }],
    );
    expect(lines).toHaveLength(1);
    expect(lines[0].unitAmountPkr).toBe(8000);
    expect(lines[0].discountAmountPkr).toBe(800);
    expect(lines[0].netAmountPkr).toBe(7200);
  });

  it("skips disabled override heads", () => {
    const lines = buildInvoiceLines(structure, [{ feeHeadId: "tuition", amountPkr: null, enabled: false }], []);
    expect(lines).toHaveLength(0);
  });

  it("does not mutate later structure edits because lines are copies", () => {
    const lines = buildInvoiceLines(structure, [], []);
    structure[0].amountPkr = 1;
    expect(lines[0].unitAmountPkr).toBe(10000);
  });

  it("allocates oldest-due first and keeps leftover as credit", () => {
    const result = allocateOldestFirst(
      [
        { id: "a", balancePkr: 500 },
        { id: "b", balancePkr: 700 },
      ],
      1000,
    );
    expect(result.allocations).toEqual([
      { invoiceId: "a", amountPkr: 500 },
      { invoiceId: "b", amountPkr: 500 },
    ]);
    expect(result.leftoverPkr).toBe(0);
    expect(allocateOldestFirst([{ id: "a", balancePkr: 200 }], 500).leftoverPkr).toBe(300);
  });

  it("computes late fees by mode", () => {
    expect(computeLateFeePkr({ mode: "NONE", amountPkr: 100, percent: 10, capPkr: 0, daysLate: 3, baseAmountPkr: 1000 })).toBe(0);
    expect(computeLateFeePkr({ mode: "FIXED", amountPkr: 200, percent: 0, capPkr: 0, daysLate: 2, baseAmountPkr: 1000 })).toBe(200);
    expect(computeLateFeePkr({ mode: "DAILY", amountPkr: 50, percent: 0, capPkr: 80, daysLate: 3, baseAmountPkr: 1000 })).toBe(80);
    expect(computeLateFeePkr({ mode: "PERCENT", amountPkr: 0, percent: 10, capPkr: 0, daysLate: 1, baseAmountPkr: 1000 })).toBe(100);
  });

  it("derives invoice status from paid amount and due date", () => {
    const due = new Date("2026-01-01");
    expect(invoiceStatusFromAmounts({ totalPkr: 1000, paidPkr: 1000, dueDate: due })).toBe("PAID");
    expect(invoiceStatusFromAmounts({ totalPkr: 1000, paidPkr: 200, dueDate: due, asOf: new Date("2025-12-01") })).toBe("PARTIALLY_PAID");
    expect(invoiceStatusFromAmounts({ totalPkr: 1000, paidPkr: 0, dueDate: due, asOf: new Date("2026-02-01") })).toBe("OVERDUE");
    expect(invoiceStatusFromAmounts({ totalPkr: 1000, paidPkr: 0, dueDate: due, cancelled: true })).toBe("CANCELLED");
  });
});
