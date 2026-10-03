import type { BankChoices, BankList, BankQuestionInput, BankQuestionUpdate, BankQuestionView, BankTopic, SaveToBankInput, SavedToBank, UsedFromBank } from "@wellrun/shared";
import { request } from "./api";

export type { BankChoices, BankList, BankQuestionView, BankTopic, SavedToBank, UsedFromBank };

type Params = Record<string, string | number | undefined>;

function qs(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== "") search.set(key, String(value));
  const out = search.toString();
  return out ? `?${out}` : "";
}

const json = (method: string, payload?: unknown): RequestInit => ({ method, body: payload === undefined ? undefined : JSON.stringify(payload) });

export const bankKeys = {
  root: ["question-bank"] as const,
  choices: ["question-bank", "choices"] as const,
  topics: (gradeName: string, subjectId: string) => ["question-bank", "topics", gradeName, subjectId] as const,
  list: (query: Params) => ["question-bank", "list", query] as const,
};

export const questionBankApi = {
  choices: () => request<BankChoices>("/console/question-bank/choices"),
  topics: (gradeName: string, subjectId: string) => request<BankTopic[]>(`/console/question-bank/topics${qs({ gradeName, subjectId })}`),
  list: (query: Params) => request<BankList>(`/console/question-bank${qs(query)}`),
  create: (payload: BankQuestionInput) => request<BankQuestionView>("/console/question-bank", json("POST", payload)),
  update: (id: string, payload: BankQuestionUpdate) => request<BankQuestionView>(`/console/question-bank/${id}`, json("PATCH", payload)),
  archive: (id: string) => request<BankQuestionView>(`/console/question-bank/${id}/archive`, json("POST")),
  restore: (id: string) => request<BankQuestionView>(`/console/question-bank/${id}/restore`, json("POST")),
  fromQuestion: (payload: SaveToBankInput) => request<SavedToBank>("/console/question-bank/from-question", json("POST", payload)),
  addToPaper: (sectionId: string, ids: string[]) => request<UsedFromBank>(`/console/question-papers/sections/${sectionId}/bank`, json("POST", { ids })),
};
