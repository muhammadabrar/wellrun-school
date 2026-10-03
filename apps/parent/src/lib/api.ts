import type { CalendarItem, OtpRequested, ParentAttendance, ParentDevice, ParentDiary, ParentFees, ParentLocale, ParentMe, ParentNotice, ParentResult, ParentSession, ParentSummary, ParentTimetable } from "@wellrun/shared";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const TOKEN_KEY = "wellrun-parent-token";

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the session lasts until the tab closes */
  }
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
  }
}

export const SIGNED_OUT_EVENT = "wellrun-parent-signed-out";

async function send(path: string, init: RequestInit = {}) {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  // Only requests with a body set Content-Type, so plain reads need no CORS preflight.
  if (init.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...init, headers });
  } catch {
    throw new ApiError("offline", 0);
  }
  if (!response.ok) {
    let message = "error";
    let retryAfter: number | undefined;
    try {
      const body = (await response.json()) as { message?: string | string[]; retryAfter?: number };
      message = Array.isArray(body.message) ? body.message.join(", ") : (body.message ?? message);
      retryAfter = body.retryAfter;
    } catch {
      /* not JSON */
    }
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    }
    throw new ApiError(message, response.status, retryAfter);
  }
  return response;
}

async function request<T>(path: string, init?: RequestInit) {
  return (await send(path, init)).json() as Promise<T>;
}

const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload) });

export const api = {
  requestOtp: (phone: string) => request<OtpRequested>("/parent/auth/request-otp", json("POST", { phone })),
  verifyOtp: (phone: string, code: string, deviceLabel?: string) => request<ParentSession>("/parent/auth/verify-otp", json("POST", { phone, code, deviceLabel })),
  logout: () => request<{ ok: true }>("/parent/auth/logout", { method: "POST" }),
  me: () => request<ParentMe>("/parent/me"),
  setLocale: (locale: ParentLocale) => request<ParentMe>("/parent/me", json("PATCH", { locale })),
  devices: () => request<ParentDevice[]>("/parent/devices"),
  revokeDevice: (id: string) => request<{ ok: true }>(`/parent/devices/${id}`, { method: "DELETE" }),
  summary: (id: string) => request<ParentSummary>(`/parent/children/${id}/summary`),
  attendance: (id: string, month: string) => request<ParentAttendance>(`/parent/children/${id}/attendance?month=${month}`),
  diary: (id: string, date: string) => request<ParentDiary>(`/parent/children/${id}/diary?date=${date}`),
  fees: (id: string) => request<ParentFees>(`/parent/children/${id}/fees`),
  results: (id: string) => request<ParentResult[]>(`/parent/children/${id}/results`),
  timetable: (id: string) => request<ParentTimetable>(`/parent/children/${id}/timetable`),
  notices: (id: string) => request<ParentNotice[]>(`/parent/children/${id}/notices`),
  calendar: (id: string, from: string, to: string) => request<CalendarItem[]>(`/parent/children/${id}/calendar?from=${from}&to=${to}`),
};

/**
 * PDFs sit behind the sign-in, so a plain link can't fetch them. The tab is opened first (a phone allows
 * that only straight after a tap) and pointed at the file once it has downloaded.
 */
export async function openPdf(path: string) {
  const tab = window.open("", "_blank");
  try {
    const blob = await (await send(path)).blob();
    const url = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
    if (tab) tab.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

export function mediaUrl(url?: string | null) {
  if (!url) return "";
  if (url.startsWith("/")) return `${API_URL}${url}`;
  return url.replace(/^https?:\/\/localhost:\d+/, API_URL);
}
