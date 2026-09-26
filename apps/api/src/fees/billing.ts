import { addPkr, clampPkr, percentOfPkr, toPkr } from "./money";

export type StructureLine = {
  feeHeadId: string;
  name: string;
  amountPkr: number;
  isOptional: boolean;
  taxable: boolean;
};

export type OverrideLine = {
  feeHeadId: string;
  amountPkr: number | null;
  enabled: boolean;
};

export type DiscountLine = {
  type: "FIXED" | "PERCENT";
  value: number;
  feeHeadIds: string[];
};

export type BuiltLine = {
  feeHeadId: string | null;
  description: string;
  quantity: number;
  unitAmountPkr: number;
  grossAmountPkr: number;
  discountAmountPkr: number;
  taxAmountPkr: number;
  netAmountPkr: number;
};

export function feeHeadCode(name: string) {
  return name
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase()
    .slice(0, 32);
}

export function buildInvoiceLines(
  structure: StructureLine[],
  overrides: OverrideLine[],
  discounts: DiscountLine[],
  optionalEnabled: string[] = [],
): BuiltLine[] {
  const overrideByHead = new Map(overrides.map((row) => [row.feeHeadId, row]));
  const lines: BuiltLine[] = [];
  for (const item of structure) {
    const override = overrideByHead.get(item.feeHeadId);
    if (override && !override.enabled) continue;
    if (item.isOptional && !optionalEnabled.includes(item.feeHeadId) && !override?.enabled) continue;
    const unit = override?.amountPkr != null ? toPkr(override.amountPkr) : toPkr(item.amountPkr);
    const gross = unit;
    const discount = discountForHead(discounts, item.feeHeadId, gross);
    const netBeforeTax = clampPkr(gross - discount);
    lines.push({
      feeHeadId: item.feeHeadId,
      description: item.name,
      quantity: 1,
      unitAmountPkr: unit,
      grossAmountPkr: gross,
      discountAmountPkr: discount,
      taxAmountPkr: 0,
      netAmountPkr: netBeforeTax,
    });
  }
  return lines;
}

function discountForHead(discounts: DiscountLine[], feeHeadId: string, gross: number) {
  let total = 0;
  for (const discount of discounts) {
    if (discount.feeHeadIds.length && !discount.feeHeadIds.includes(feeHeadId)) continue;
    if (discount.type === "PERCENT") total += percentOfPkr(gross, discount.value);
    else total += toPkr(discount.value);
  }
  return Math.min(gross, total);
}

export function totalsFromLines(lines: BuiltLine[]) {
  const subtotalPkr = addPkr(...lines.map((line) => line.grossAmountPkr));
  const discountAmountPkr = addPkr(...lines.map((line) => line.discountAmountPkr));
  const taxAmountPkr = addPkr(...lines.map((line) => line.taxAmountPkr));
  const netPkr = addPkr(...lines.map((line) => line.netAmountPkr));
  return { subtotalPkr, discountAmountPkr, taxAmountPkr, netPkr };
}

export function computeLateFeePkr(input: {
  mode: "NONE" | "FIXED" | "DAILY" | "PERCENT";
  amountPkr: number;
  percent: number;
  capPkr: number;
  daysLate: number;
  baseAmountPkr: number;
}) {
  if (input.mode === "NONE" || input.daysLate <= 0) return 0;
  let fee = 0;
  if (input.mode === "FIXED") fee = toPkr(input.amountPkr);
  if (input.mode === "DAILY") fee = toPkr(input.amountPkr) * input.daysLate;
  if (input.mode === "PERCENT") fee = percentOfPkr(input.baseAmountPkr, input.percent);
  if (input.capPkr > 0) fee = Math.min(fee, toPkr(input.capPkr));
  return clampPkr(fee);
}

export function daysLate(dueDate: Date, asOf: Date, graceDays = 0) {
  const ms = asOf.getTime() - dueDate.getTime();
  const days = Math.floor(ms / 86_400_000) - graceDays;
  return Math.max(0, days);
}

export function invoiceStatusFromAmounts(input: {
  totalPkr: number;
  paidPkr: number;
  dueDate: Date;
  asOf?: Date;
  cancelled?: boolean;
}) {
  if (input.cancelled) return "CANCELLED" as const;
  const paid = toPkr(input.paidPkr);
  const total = toPkr(input.totalPkr);
  if (total <= 0 || paid >= total) return "PAID" as const;
  if (paid > 0) return "PARTIALLY_PAID" as const;
  const asOf = input.asOf ?? new Date();
  if (asOf.getTime() > input.dueDate.getTime()) return "OVERDUE" as const;
  return "ISSUED" as const;
}

export function allocateOldestFirst(
  invoices: { id: string; balancePkr: number }[],
  amountPkr: number,
) {
  let remaining = toPkr(amountPkr);
  const allocations: { invoiceId: string; amountPkr: number }[] = [];
  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const take = Math.min(toPkr(invoice.balancePkr), remaining);
    if (take <= 0) continue;
    allocations.push({ invoiceId: invoice.id, amountPkr: take });
    remaining -= take;
  }
  return { allocations, leftoverPkr: remaining };
}

/** Which academic-year-relative quarter (1-4) a billing period falls in, given when the academic year starts. */
export function academicQuarter(billingPeriod: string, yearStartsOn: Date): number {
  const match = /^(\d{4})-(\d{2})$/.exec(billingPeriod.trim());
  if (!match) return 1;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const startMonth = yearStartsOn.getUTCMonth() + 1;
  const startYear = yearStartsOn.getUTCFullYear();
  const monthsSinceStart = (year - startYear) * 12 + (month - startMonth);
  const normalized = ((monthsSinceStart % 12) + 12) % 12;
  return Math.floor(normalized / 3) + 1;
}

/**
 * Key identifying "this fee head, for this student, in this billing scope" for non-monthly heads.
 * MONTHLY heads have no scope key (always eligible every period). Used to stop generation from
 * re-billing a QUARTERLY/ANNUAL/ONE_TIME head every time it runs for a new monthly period.
 */
export function frequencyScopeKey(input: {
  feeHeadId: string;
  frequency: "MONTHLY" | "QUARTERLY" | "ANNUAL" | "ONE_TIME";
  billingPeriod: string;
  yearStartsOn: Date;
  academicYearId: string;
}): string | null {
  if (input.frequency === "MONTHLY") return null;
  if (input.frequency === "QUARTERLY") {
    return `${input.feeHeadId}:Q${academicQuarter(input.billingPeriod, input.yearStartsOn)}:${input.academicYearId}`;
  }
  return `${input.feeHeadId}:${input.academicYearId}`;
}

export function invoiceLabel(invoice: {
  billingPeriod?: string | null;
  feePlan?: { name: string } | null;
  items?: { description: string }[];
}) {
  return invoice.items?.[0]?.description || invoice.feePlan?.name || invoice.billingPeriod || "Fee";
}

export const IGNORED_INVOICE_STATUSES = ["CANCELLED", "DRAFT"] as const;
