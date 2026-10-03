import type {
  AccountInput,
  AccountUpdateInput,
  CategoryInput,
  FinanceAccountView,
  FinanceCategoryView,
  FinanceOverview,
  InventoryDetail,
  InventoryItemView,
  InventoryList,
  InventorySummary,
  ItemInput,
  ItemUpdateInput,
  LedgerView,
  MovementInput,
  VoucherCreateInput,
  VoucherList,
  VoucherView,
} from "@wellrun/shared";
import { request } from "./api";

export type { FinanceAccountView, FinanceCategoryView, FinanceOverview, InventoryDetail, InventoryItemView, InventoryList, InventorySummary, LedgerView, VoucherList, VoucherView };

type Params = Record<string, string | number | undefined>;

function qs(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const out = search.toString();
  return out ? `?${out}` : "";
}

const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload) });

export const financeKeys = {
  root: ["finance"] as const,
  overview: ["finance", "overview"] as const,
  accounts: ["finance", "accounts"] as const,
  categories: ["finance", "categories"] as const,
  vouchers: (query: Params) => ["finance", "vouchers", query] as const,
  voucher: (id: string) => ["finance", "voucher", id] as const,
  ledger: (query: Params) => ["finance", "ledger", query] as const,
};

export const inventoryKeys = {
  root: ["inventory"] as const,
  summary: ["inventory", "summary"] as const,
  items: (query: Params) => ["inventory", "items", query] as const,
  item: (id: string) => ["inventory", "item", id] as const,
};

export const financeApi = {
  overview: () => request<FinanceOverview>("/console/finance/overview"),
  accounts: () => request<FinanceAccountView[]>("/console/finance/accounts"),
  createAccount: (payload: AccountInput) => request<FinanceAccountView>("/console/finance/accounts", json("POST", payload)),
  updateAccount: (id: string, payload: AccountUpdateInput) => request<FinanceAccountView>(`/console/finance/accounts/${id}`, json("PATCH", payload)),
  categories: () => request<FinanceCategoryView[]>("/console/finance/categories"),
  createCategory: (payload: CategoryInput) => request<FinanceCategoryView>("/console/finance/categories", json("POST", payload)),
  updateCategory: (id: string, payload: { name?: string; active?: boolean }) => request<FinanceCategoryView>(`/console/finance/categories/${id}`, json("PATCH", payload)),
  vouchers: (query: Params) => request<VoucherList>(`/console/finance/vouchers${qs(query)}`),
  voucher: (id: string) => request<VoucherView>(`/console/finance/vouchers/${id}`),
  createVoucher: (payload: VoucherCreateInput) => request<VoucherView>("/console/finance/vouchers", json("POST", payload)),
  voidVoucher: (id: string, reason: string) => request<VoucherView>(`/console/finance/vouchers/${id}/void`, json("POST", { reason })),
  ledger: (query: Params) => request<LedgerView>(`/console/finance/ledger${qs(query)}`),
};

export const inventoryApi = {
  summary: () => request<InventorySummary>("/console/inventory/summary"),
  items: (query: Params) => request<InventoryList>(`/console/inventory/items${qs(query)}`),
  item: (id: string) => request<InventoryDetail>(`/console/inventory/items/${id}`),
  createItem: (payload: ItemInput) => request<InventoryItemView>("/console/inventory/items", json("POST", payload)),
  updateItem: (id: string, payload: ItemUpdateInput) => request<InventoryItemView>(`/console/inventory/items/${id}`, json("PATCH", payload)),
  addMovement: (id: string, payload: MovementInput) => request<InventoryDetail>(`/console/inventory/items/${id}/movements`, json("POST", payload)),
  voidMovement: (id: string, reason: string) => request<InventoryDetail>(`/console/inventory/movements/${id}/void`, json("POST", { reason })),
};
