import type {
  DiaryChoices,
  DiaryCreateInput,
  DiaryEntryView,
  DiaryList,
  DiaryOverview,
  DiaryToday,
  DiaryUpdateInput,
  NoticeInput,
  NoticeView,
} from "@wellrun/shared";
import { request } from "./api";

export type { DiaryChoices, DiaryEntryView, DiaryList, DiaryOverview, DiaryToday, NoticeView };

type Params = Record<string, string | number | undefined>;

function qs(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const out = search.toString();
  return out ? `?${out}` : "";
}

const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload) });

export type DiaryQuery = { classId?: string; date?: string; page?: number };
export type NoticeList = { items: NoticeView[]; total: number; page: number; pageSize: number };

export const diaryKeys = {
  root: ["diary"] as const,
  choices: ["diary", "choices"] as const,
  today: ["diary", "today"] as const,
  overview: (date: string) => ["diary", "overview", date] as const,
  list: (query: DiaryQuery) => ["diary", "list", query] as const,
};

export const noticeKeys = {
  root: ["notices"] as const,
  list: (page: number) => ["notices", "list", page] as const,
};

export const diaryApi = {
  choices: () => request<DiaryChoices>("/console/diary/choices"),
  today: () => request<DiaryToday>("/console/diary/today"),
  overview: (date: string) => request<DiaryOverview>(`/console/diary/overview${qs({ date })}`),
  list: (query: DiaryQuery) => request<DiaryList>(`/console/diary${qs({ classId: query.classId, date: query.date, page: query.page && query.page > 1 ? query.page : undefined })}`),
  create: (payload: DiaryCreateInput) => request<DiaryEntryView>("/console/diary", json("POST", payload)),
  update: (id: string, payload: DiaryUpdateInput) => request<DiaryEntryView>(`/console/diary/${id}`, json("PATCH", payload)),
  remove: (id: string) => request<{ ok: true }>(`/console/diary/${id}`, { method: "DELETE" }),
  copy: (id: string, classIds: string[]) => request<{ copied: number }>(`/console/diary/${id}/copy`, json("POST", { classIds })),
};

export const noticesApi = {
  list: (page = 1) => request<NoticeList>(`/console/notices${qs({ page: page > 1 ? page : undefined })}`),
  create: (payload: NoticeInput) => request<NoticeView>("/console/notices", json("POST", payload)),
  update: (id: string, payload: Partial<NoticeInput>) => request<NoticeView>(`/console/notices/${id}`, json("PATCH", payload)),
  remove: (id: string) => request<{ ok: true }>(`/console/notices/${id}`, { method: "DELETE" }),
};
