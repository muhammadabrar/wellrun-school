import type {
  CalendarView,
  CertificateIssueInput,
  CertificateList,
  CertificatePreview,
  CertificateTemplateView,
  CertificateView,
  EventInput,
  EventView,
  IdCardList,
} from "@wellrun/shared";
import { request, token } from "./api";
import { readCampusId } from "./campus";
import { ApiError } from "./query";
import { readYearId } from "./school-context";

export type { CalendarView, CertificateList, CertificatePreview, CertificateTemplateView, CertificateView, EventView, IdCardList };

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000";

type Params = Record<string, string | number | undefined>;

function qs(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const out = search.toString();
  return out ? `?${out}` : "";
}

const json = (method: string, payload?: unknown): RequestInit => ({ method, body: payload === undefined ? undefined : JSON.stringify(payload) });

/** Downloads a PDF the API builds and returns a link to it that can be opened in a new tab. */
export async function pdfUrl(path: string) {
  const headers: Record<string, string> = {};
  const auth = token();
  if (auth) headers.Authorization = `Bearer ${auth}`;
  const campusId = readCampusId();
  if (campusId) headers["X-Campus-Id"] = campusId;
  const yearId = readYearId();
  if (yearId) headers["X-Year-Id"] = yearId;
  const res = await fetch(`${API}${path}`, { headers, credentials: "include" });
  if (!res.ok) {
    let message = "Could not open this PDF";
    try {
      const body = (await res.json()) as { message?: string | string[] };
      message = Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? message);
    } catch {
      /* not JSON */
    }
    throw new ApiError(message, res.status);
  }
  return URL.createObjectURL(await res.blob());
}

export type PreviewResult = CertificatePreview & { warnings: string[] };
export type IssuedResult = CertificateView & { warnings: string[] };

export const documentKeys = {
  calendar: (from: string, to: string) => ["calendar", from, to] as const,
  calendarRoot: ["calendar"] as const,
  event: (id: string) => ["calendar", "event", id] as const,
  certificates: (query: Params) => ["certificates", "list", query] as const,
  certificatesRoot: ["certificates"] as const,
  templates: ["certificates", "templates"] as const,
  idCards: (query: Params) => ["id-cards", query] as const,
};

export const calendarApi = {
  calendar: (from: string, to: string) => request<CalendarView>(`/console/calendar${qs({ from, to })}`),
  event: (id: string) => request<EventView>(`/console/events/${id}`),
  create: (payload: EventInput) => request<EventView>("/console/events", json("POST", payload)),
  update: (id: string, payload: EventInput) => request<EventView>(`/console/events/${id}`, json("PATCH", payload)),
  remove: (id: string) => request<{ ok: true }>(`/console/events/${id}`, { method: "DELETE" }),
};

export const certificatesApi = {
  templates: () => request<CertificateTemplateView[]>("/console/certificates/templates"),
  saveTemplate: (type: string, payload: { title: string; body: string }) => request<CertificateTemplateView>(`/console/certificates/templates/${type}`, json("PUT", payload)),
  resetTemplate: (type: string) => request<CertificateTemplateView>(`/console/certificates/templates/${type}`, { method: "DELETE" }),
  preview: (payload: CertificateIssueInput) => request<PreviewResult>("/console/certificates/preview", json("POST", payload)),
  issue: (payload: CertificateIssueInput) => request<IssuedResult>("/console/certificates", json("POST", payload)),
  list: (query: Params) => request<CertificateList>(`/console/certificates${qs(query)}`),
  revoke: (id: string, reason: string) => request<CertificateView>(`/console/certificates/${id}/revoke`, json("POST", { reason })),
  pdf: (id: string) => pdfUrl(`/console/certificates/${id}/pdf`),
};

export const idCardsApi = {
  people: (query: Params) => request<IdCardList>(`/console/id-cards/people${qs(query)}`),
  pdf: (query: Params) => pdfUrl(`/console/id-cards/pdf${qs(query)}`),
};
