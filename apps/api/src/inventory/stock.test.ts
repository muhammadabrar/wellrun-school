import { isLowStock, itemSchema, movementDelta, movementSchema, stockValuePkr, voucherCreateSchema } from "@wellrun/shared";
import { describe, expect, it } from "vitest";

describe("movementDelta", () => {
  it("adds to stock for purchases and returns", () => {
    expect(movementDelta("PURCHASE", 20, 5)).toEqual({ delta: 20 });
    expect(movementDelta("RETURN", 2, 0)).toEqual({ delta: 2 });
  });

  it("takes from stock when giving out or losing, but never below zero", () => {
    expect(movementDelta("ISSUE", 5, 12)).toEqual({ delta: -5 });
    expect(movementDelta("DAMAGE", 12, 12)).toEqual({ delta: -12 });
    expect(movementDelta("ISSUE", 13, 12)).toEqual({ error: "Only 12 in stock" });
    expect(movementDelta("DAMAGE", 1, 0)).toEqual({ error: "There is none in stock" });
  });

  it("turns a stock count into whatever change gets stock to the counted number", () => {
    expect(movementDelta("ADJUST", 30, 25)).toEqual({ delta: 5 });
    expect(movementDelta("ADJUST", 20, 25)).toEqual({ delta: -5 });
    expect(movementDelta("ADJUST", 25, 25)).toEqual({ delta: 0 });
    expect(movementDelta("ADJUST", 0, 25)).toEqual({ delta: -25 });
  });
});

describe("movementSchema", () => {
  const base = { type: "PURCHASE", quantity: 10, date: "2026-10-05", unitCostPkr: 120 };

  it("needs a quantity for everything except a stock count", () => {
    expect(movementSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(movementSchema.safeParse({ ...base, type: "ISSUE", quantity: 0 }).success).toBe(false);
    expect(movementSchema.safeParse({ ...base, type: "ADJUST", quantity: 0 }).success).toBe(true);
  });

  it("takes whole numbers only and a real date", () => {
    expect(movementSchema.safeParse({ ...base, quantity: 2.5 }).success).toBe(false);
    expect(movementSchema.safeParse({ ...base, date: "5 Oct" }).success).toBe(false);
    expect(movementSchema.safeParse({ ...base, type: "THROWN" }).success).toBe(false);
  });

  it("records the expense by default", () => {
    expect(movementSchema.parse(base).recordExpense).toBe(true);
  });
});

describe("itemSchema", () => {
  it("defaults the unit and trims the name", () => {
    expect(itemSchema.parse({ name: "  Whiteboard markers ", kind: "CONSUMABLE" })).toMatchObject({ name: "Whiteboard markers", unit: "pcs", unitCostPkr: 0 });
  });

  it("refuses a missing name or an unknown kind", () => {
    expect(itemSchema.safeParse({ name: "A", kind: "ASSET" }).success).toBe(false);
    expect(itemSchema.safeParse({ name: "Desk", kind: "FURNITURE" }).success).toBe(false);
  });
});

describe("isLowStock and stockValuePkr", () => {
  const item = { kind: "CONSUMABLE" as const, onHand: 4, reorderLevel: 5 as number | null, status: "IN_USE" as const, active: true };

  it("flags a consumable at or below its reorder level", () => {
    expect(isLowStock(item)).toBe(true);
    expect(isLowStock({ ...item, onHand: 5 })).toBe(true);
    expect(isLowStock({ ...item, onHand: 6 })).toBe(false);
  });

  it("does not flag assets, items with no level set, or switched-off items", () => {
    expect(isLowStock({ ...item, kind: "ASSET" })).toBe(false);
    expect(isLowStock({ ...item, reorderLevel: null })).toBe(false);
    expect(isLowStock({ ...item, active: false })).toBe(false);
  });

  it("values stock at the latest price", () => {
    expect(stockValuePkr({ onHand: 12, unitCostPkr: 250 })).toBe(3000);
    expect(stockValuePkr({ onHand: 0, unitCostPkr: 250 })).toBe(0);
  });
});

describe("voucherCreateSchema", () => {
  const payment = { type: "PAYMENT", date: "2026-10-05", amountPkr: 4500, accountId: "a1", categoryId: "c1" };

  it("accepts a payment with an account and a category", () => {
    expect(voucherCreateSchema.safeParse(payment).success).toBe(true);
  });

  it("asks what a payment or receipt was for", () => {
    const r = voucherCreateSchema.safeParse({ ...payment, categoryId: null });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r)).toContain("What was it spent on?");
    expect(JSON.stringify(voucherCreateSchema.safeParse({ ...payment, type: "RECEIPT", categoryId: undefined }))).toContain("Where did the money come from?");
  });

  it("needs a different second account for a transfer and no category", () => {
    expect(voucherCreateSchema.safeParse({ type: "TRANSFER", date: "2026-10-05", amountPkr: 1000, accountId: "a1", toAccountId: "a2" }).success).toBe(true);
    expect(voucherCreateSchema.safeParse({ type: "TRANSFER", date: "2026-10-05", amountPkr: 1000, accountId: "a1" }).success).toBe(false);
    expect(voucherCreateSchema.safeParse({ type: "TRANSFER", date: "2026-10-05", amountPkr: 1000, accountId: "a1", toAccountId: "a1" }).success).toBe(false);
  });

  it("refuses zero, negative, fractional or absurd amounts", () => {
    for (const amountPkr of [0, -5, 10.5, 600_000_000]) expect(voucherCreateSchema.safeParse({ ...payment, amountPkr }).success).toBe(false);
  });
});
