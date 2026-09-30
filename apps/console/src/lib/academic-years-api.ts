import type {
  AcademicYearInput,
  AcademicYearSummary,
  CopySetupInput,
  CopySetupResult,
  PromotionInput,
  PromotionPreview,
  PromotionResult,
  YearCloseCheck,
} from "@wellrun/shared";
import { request } from "./api";

export type { AcademicYearSummary, CopySetupResult, PromotionPreview, PromotionResult, YearCloseCheck };

const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload) });

export const academicYearsApi = {
  list: () => request<AcademicYearSummary[]>("/console/academic-years"),
  create: (payload: AcademicYearInput) => request<{ id: string }>("/console/academic-years", json("POST", payload)),
  update: (id: string, payload: AcademicYearInput) => request<{ id: string }>(`/console/academic-years/${id}`, json("PATCH", payload)),
  remove: (id: string) => request<{ ok: true }>(`/console/academic-years/${id}`, { method: "DELETE" }),
  closeCheck: (id: string) => request<YearCloseCheck>(`/console/academic-years/${id}/close-check`),
  activate: (id: string, closePrevious = false) => request<{ id: string }>(`/console/academic-years/${id}/activate`, json("POST", { closePrevious })),
  close: (id: string) => request<{ id: string }>(`/console/academic-years/${id}/close`, json("POST", {})),
  reopen: (id: string) => request<{ id: string }>(`/console/academic-years/${id}/reopen`, json("POST", {})),
  copySetup: (id: string, payload: CopySetupInput) => request<CopySetupResult>(`/console/academic-years/${id}/copy-setup`, json("POST", payload)),
  promotionPreview: (id: string, fromYearId: string) =>
    request<PromotionPreview>(`/console/academic-years/${id}/promotion-preview?fromYearId=${encodeURIComponent(fromYearId)}`),
  promote: (id: string, payload: PromotionInput) => request<PromotionResult>(`/console/academic-years/${id}/promotion`, json("POST", payload)),
};

export const academicYearKeys = {
  list: ["academic-years"] as const,
  closeCheck: (id: string) => ["academic-years", "close-check", id] as const,
  promotion: (id: string, fromYearId: string) => ["academic-years", "promotion", id, fromYearId] as const,
};
