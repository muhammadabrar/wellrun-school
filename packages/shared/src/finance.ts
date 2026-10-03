import { z } from "zod";

/**
 * A simple cash book. Money in and out of the school's cash and bank accounts, as vouchers a person writes,
 * plus fee payments and paid salaries which arrive on their own. Transfers between accounts are not income or expense.
 */

export const ACCOUNT_KINDS = ["CASH", "BANK"] as const;
export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const CATEGORY_KINDS = ["INCOME", "EXPENSE"] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export const VOUCHER_TYPES = ["PAYMENT", "RECEIPT", "TRANSFER"] as const;
export type VoucherType = (typeof VOUCHER_TYPES)[number];

export const VOUCHER_TYPE_LABEL: Record<VoucherType, string> = {
  PAYMENT: "Payment (money out)",
  RECEIPT: "Receipt (money in)",
  TRANSFER: "Transfer between accounts",
};

export const VOUCHER_METHODS = ["cash", "bank", "cheque", "online", "other"] as const;

export const MAX_VOUCHER_PKR = 500_000_000;

/** Categories every school starts with. The two system ones are filled in by fees and payroll and can't be used on a voucher. */
export const SYSTEM_CATEGORIES = {
  FEE_COLLECTION: { key: "FEE_COLLECTION", name: "Fee collection", kind: "INCOME" as CategoryKind },
  SALARIES: { key: "SALARIES", name: "Salaries", kind: "EXPENSE" as CategoryKind },
} as const;

export const DEFAULT_CATEGORIES: { name: string; kind: CategoryKind }[] = [
  { name: "Utilities (electricity, gas, water, internet)", kind: "EXPENSE" },
  { name: "Rent", kind: "EXPENSE" },
  { name: "Repairs and maintenance", kind: "EXPENSE" },
  { name: "Supplies and stationery", kind: "EXPENSE" },
  { name: "Furniture and equipment", kind: "EXPENSE" },
  { name: "Transport and fuel", kind: "EXPENSE" },
  { name: "Events and activities", kind: "EXPENSE" },
  { name: "Other expenses", kind: "EXPENSE" },
  { name: "Donations", kind: "INCOME" },
  { name: "Uniform and book sales", kind: "INCOME" },
  { name: "Other income", kind: "INCOME" },
];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const amount = z.coerce.number().int("Use whole rupees").min(1, "Enter an amount above zero").max(MAX_VOUCHER_PKR, "That amount is too large");

export const voucherCreateSchema = z
  .object({
    type: z.enum(VOUCHER_TYPES),
    date: isoDate,
    amountPkr: amount,
    accountId: z.string().min(1, "Choose an account"),
    toAccountId: z.string().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    party: z.string().trim().max(120).default(""),
    method: z.string().trim().max(20).default(""),
    reference: z.string().trim().max(80).default(""),
    note: z.string().trim().max(500).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.type === "TRANSFER") {
      if (!v.toAccountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose the account the money goes to" });
      else if (v.toAccountId === v.accountId) ctx.addIssue({ code: "custom", path: ["toAccountId"], message: "Choose a different account" });
    } else if (!v.categoryId) {
      ctx.addIssue({ code: "custom", path: ["categoryId"], message: v.type === "PAYMENT" ? "What was it spent on?" : "Where did the money come from?" });
    }
  });

export const voucherVoidSchema = z.object({ reason: z.string().trim().min(3, "Say why it is being cancelled").max(300) });

export const accountSchema = z.object({
  name: z.string().trim().min(2, "Give the account a name").max(60),
  kind: z.enum(ACCOUNT_KINDS),
  openingBalancePkr: z.coerce.number().int().min(-MAX_VOUCHER_PKR).max(MAX_VOUCHER_PKR).default(0),
  openingOn: isoDate,
});

export const accountUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  openingBalancePkr: z.coerce.number().int().min(-MAX_VOUCHER_PKR).max(MAX_VOUCHER_PKR).optional(),
  openingOn: isoDate.optional(),
  active: z.boolean().optional(),
});

export const categorySchema = z.object({ name: z.string().trim().min(2, "Give the category a name").max(80), kind: z.enum(CATEGORY_KINDS) });
export const categoryUpdateSchema = z.object({ name: z.string().trim().min(2).max(80).optional(), active: z.boolean().optional() });

export type VoucherCreateInput = z.input<typeof voucherCreateSchema>;
export type AccountInput = z.input<typeof accountSchema>;
export type AccountUpdateInput = z.input<typeof accountUpdateSchema>;
export type CategoryInput = z.input<typeof categorySchema>;

// Views ------------------------------------------------------------------------------------------------------

export type FinanceAccountView = {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalancePkr: number;
  openingOn: string;
  active: boolean;
  /** Opening balance plus everything since, as of today. */
  balancePkr: number;
};

export type FinanceCategoryView = { id: string; name: string; kind: CategoryKind; system: boolean; active: boolean; used: boolean };

export type VoucherView = {
  id: string;
  number: string;
  type: VoucherType;
  date: string;
  amountPkr: number;
  accountId: string;
  accountName: string;
  toAccountId: string | null;
  toAccountName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  party: string;
  method: string;
  reference: string;
  note: string;
  source: "MANUAL" | "INVENTORY";
  status: "POSTED" | "VOIDED";
  voidReason: string;
  voidedAt: string | null;
  voidedBy: string | null;
  createdBy: string | null;
  createdAt: string;
  /** Vouchers from inventory purchases are cancelled by cancelling the purchase. */
  canVoid: boolean;
};

export type VoucherList = { items: VoucherView[]; total: number; page: number; pageSize: number; totalInPkr: number; totalOutPkr: number };

export type LedgerSource = "VOUCHER" | "FEE" | "PAYROLL";

export type LedgerRow = {
  date: string;
  description: string;
  reference: string;
  category: string;
  /** Which account the line touched; only filled for the all-accounts day book. */
  account: string;
  inPkr: number;
  outPkr: number;
  /** Running balance after this line. Null in the all-accounts day book, which has no single balance. */
  balancePkr: number | null;
  source: LedgerSource;
  voucherId: string | null;
};

export type LedgerView = {
  accountId: string | null;
  accountName: string;
  from: string;
  to: string;
  openingPkr: number | null;
  closingPkr: number | null;
  totalInPkr: number;
  totalOutPkr: number;
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  truncated: boolean;
};

export type FinanceOverview = {
  accounts: FinanceAccountView[];
  totalBalancePkr: number;
  month: { label: string; incomePkr: number; expensePkr: number; netPkr: number; byCategory: { name: string; kind: CategoryKind; amountPkr: number }[] };
  trend: { month: string; label: string; incomePkr: number; expensePkr: number }[];
  recent: LedgerRow[];
};

// Inventory --------------------------------------------------------------------------------------------------

export const ITEM_KINDS = ["ASSET", "CONSUMABLE"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_KIND_LABEL: Record<ItemKind, string> = { ASSET: "Asset (lasts for years)", CONSUMABLE: "Consumable (used up)" };

export const ITEM_STATUSES = ["IN_USE", "REPAIR", "DISPOSED"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export const ITEM_STATUS_LABEL: Record<ItemStatus, string> = { IN_USE: "In use", REPAIR: "Being repaired", DISPOSED: "Disposed of" };

export const MOVEMENT_TYPES = ["PURCHASE", "ISSUE", "RETURN", "DAMAGE", "ADJUST"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];
export const MOVEMENT_LABEL: Record<MovementType, string> = {
  PURCHASE: "Bought",
  ISSUE: "Given out",
  RETURN: "Returned",
  DAMAGE: "Damaged or lost",
  ADJUST: "Stock count",
};

export const itemSchema = z.object({
  name: z.string().trim().min(2, "Give the item a name").max(100),
  code: z.string().trim().max(40).default(""),
  kind: z.enum(ITEM_KINDS),
  category: z.string().trim().max(60).default(""),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  location: z.string().trim().max(80).default(""),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000).nullable().optional(),
  unitCostPkr: z.coerce.number().int().min(0).max(MAX_VOUCHER_PKR).default(0),
  serialNo: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(500).default(""),
});

export const itemUpdateSchema = itemSchema.partial().extend({ status: z.enum(ITEM_STATUSES).optional(), active: z.boolean().optional() });

const qty = z.coerce.number().int("Use whole numbers").min(0).max(1_000_000);

export const movementSchema = z
  .object({
    type: z.enum(MOVEMENT_TYPES),
    /** How many. For a stock count this is the number actually counted. */
    quantity: qty,
    date: isoDate,
    /** Cost of one, for a purchase. */
    unitCostPkr: z.coerce.number().int().min(0).max(MAX_VOUCHER_PKR).nullable().optional(),
    supplier: z.string().trim().max(120).default(""),
    issuedTo: z.string().trim().max(120).default(""),
    note: z.string().trim().max(300).default(""),
    /** For a purchase: where the money came from and what to call it. Both default sensibly. */
    accountId: z.string().min(1).nullable().optional(),
    categoryId: z.string().min(1).nullable().optional(),
    recordExpense: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.type !== "ADJUST" && v.quantity < 1) ctx.addIssue({ code: "custom", path: ["quantity"], message: "Enter how many" });
  });

export const movementVoidSchema = z.object({ reason: z.string().trim().min(3, "Say why").max(300) });

export type ItemInput = z.input<typeof itemSchema>;
export type ItemUpdateInput = z.input<typeof itemUpdateSchema>;
export type MovementInput = z.input<typeof movementSchema>;

/**
 * The change to stock a movement makes, or the reason it can't be made.
 * Giving out or losing more than is in stock is refused, so stock never goes below zero.
 */
export function movementDelta(type: MovementType, quantity: number, onHand: number): { delta: number } | { error: string } {
  switch (type) {
    case "PURCHASE":
    case "RETURN":
      return { delta: quantity };
    case "ISSUE":
    case "DAMAGE":
      if (quantity > onHand) return { error: onHand === 0 ? "There is none in stock" : `Only ${onHand} in stock` };
      return { delta: -quantity };
    case "ADJUST":
      return { delta: quantity - onHand };
  }
}

export const isLowStock = (item: { kind: ItemKind; onHand: number; reorderLevel: number | null; status: ItemStatus; active: boolean }) =>
  item.active && item.kind === "CONSUMABLE" && item.reorderLevel !== null && item.onHand <= item.reorderLevel;

/** What is on the shelf is worth its latest purchase price. */
export const stockValuePkr = (item: { onHand: number; unitCostPkr: number }) => item.onHand * item.unitCostPkr;

export type InventoryItemView = {
  id: string;
  name: string;
  code: string;
  kind: ItemKind;
  category: string;
  unit: string;
  location: string;
  reorderLevel: number | null;
  onHand: number;
  unitCostPkr: number;
  valuePkr: number;
  status: ItemStatus;
  serialNo: string;
  notes: string;
  active: boolean;
  low: boolean;
};

export type InventoryList = { items: InventoryItemView[]; total: number; page: number; pageSize: number };

export type InventorySummary = { items: number; assets: number; consumables: number; lowStock: number; valuePkr: number; boughtThisMonthPkr: number };

export type MovementView = {
  id: string;
  type: MovementType;
  quantity: number;
  delta: number;
  unitCostPkr: number | null;
  totalCostPkr: number;
  date: string;
  supplier: string;
  issuedTo: string;
  note: string;
  voucherNumber: string | null;
  voided: boolean;
  by: string | null;
  canVoid: boolean;
};

export type InventoryDetail = { item: InventoryItemView; movements: MovementView[] };
