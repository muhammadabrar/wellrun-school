import type { RatioReport, ReportParams, ReportResult, ReportScopeOption } from "@wellrun/shared";
import { request } from "./api";

export type { RatioReport, ReportResult, ReportScopeOption };

type Query = Record<string, string | undefined>;

function qs(params: Query) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const out = search.toString();
  return out ? `?${out}` : "";
}

export const reportKeys = {
  root: ["reports"] as const,
  scopes: ["reports", "scopes"] as const,
  ratios: (query: Query) => ["reports", "ratios", query] as const,
  run: (id: string, query: Query) => ["reports", "run", id, query] as const,
};

export const reportsApi = {
  scopes: () => request<ReportScopeOption[]>("/console/reports/scopes"),
  ratios: (params: Query) => request<RatioReport>(`/console/reports/ratios${qs(params)}`),
  run: (id: string, params: ReportParams) => request<ReportResult>(`/console/reports/${encodeURIComponent(id)}${qs(params as Query)}`),
};
