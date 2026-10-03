import type { Paged, PaperIssue, QuestionPaperStatus, QuestionType } from "@wellrun/shared";
import { request } from "./api";
import { readYearId } from "./school-context";

export type { PaperIssue, QuestionPaperStatus, QuestionType };

type Params = Record<string, string | undefined>;

function qs(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const out = search.toString();
  return out ? `?${out}` : "";
}

const json = (method: string, payload?: unknown): RequestInit => ({ method, body: payload === undefined ? undefined : JSON.stringify(payload) });

export type PaperQuestionRow = {
  id: string;
  text: string;
  marks: number;
  /** MCQ: string[]; MATCH: { left, right }[]; otherwise empty. */
  options: unknown;
  /** MCQ: option index. True/false: TRUE or FALSE. Others: model answer. */
  answer: string;
  answerLines: number;
  sortOrder: number;
  /** Set when the question was copied from, or saved to, the question bank. */
  bankQuestionId?: string | null;
};

export type PaperSectionRow = {
  id: string;
  title: string;
  type: QuestionType;
  instructions: string;
  passage: string;
  rtl: boolean;
  attemptCount: number | null;
  sortOrder: number;
  marks: number;
  questions: PaperQuestionRow[];
};

export type PaperSlot = {
  paperId: string;
  classId: string;
  label: string;
  date: string | null;
  startTime: string;
  endTime: string;
  room: string;
  maxMarks: number;
  students: number;
};

export type QuestionPaperDetail = {
  id: string;
  status: QuestionPaperStatus;
  title: string;
  instructions: string;
  durationMinutes: number;
  totalMarks: number;
  reviewNote: string;
  submittedAt: string | null;
  reviewedAt: string | null;
  createdBy: string;
  reviewedBy: string;
  exam: { id: string; name: string; kind: string; startsOn: string | null; endsOn: string | null; yearName: string };
  gradeName: string;
  subject: { id: string; name: string };
  school: { name: string; address: string; phone: string; email: string; website: string; logoUrl: string };
  slots: PaperSlot[];
  expectedMarks: number | null;
  syllabus: { title: string; unit: string }[];
  sections: PaperSectionRow[];
  issues: PaperIssue[];
  permissions: { canEdit: boolean; canSubmit: boolean; canReview: boolean; canReopen: boolean; canPrint: boolean; canDelete: boolean; readOnlyReason: string | null };
  prints: { total: number; recent: { id: string; classLabel: string; copies: number; answerKey: boolean; createdAt: string }[] } | null;
};

export type QuestionPaperRowSummary = {
  id: string;
  title: string;
  gradeName: string;
  subject: { id: string; name: string };
  exam: { id: string; name: string; kind: string; startsOn: string | null };
  status: QuestionPaperStatus;
  totalMarks: number;
  durationMinutes: number;
  sections: number;
  questions: number;
  printed: number;
  reviewNote: string;
  updatedAt: string;
  submittedAt: string | null;
};

export type QuestionPaperList = Paged<QuestionPaperRowSummary> & { statusCounts: Record<string, number> };

export type QuestionPaperTodo = { examPaperId: string; examId: string; examName: string; gradeName: string; subject: string; date: string | null };

export type QuestionInputBody = { text: string; marks: number; options?: unknown[]; answer?: string; answerLines?: number };

export const questionPaperKeys = {
  root: ["question-papers"] as const,
  list: (query: Params) => ["question-papers", readYearId(), "list", query] as const,
  todo: () => ["question-papers", readYearId(), "todo"] as const,
  detail: (id: string) => ["question-papers", "detail", id] as const,
};

export const questionPapersApi = {
  list: (query: Params) => request<QuestionPaperList>(`/console/question-papers${qs(query)}`),
  todo: () => request<QuestionPaperTodo[]>("/console/question-papers/todo"),
  detail: (id: string) => request<QuestionPaperDetail>(`/console/question-papers/${id}`),
  create: (payload: { examPaperId: string; copyFromId?: string }) => request<{ id: string; existed: boolean }>("/console/question-papers", json("POST", payload)),
  update: (id: string, payload: { title?: string; instructions?: string; durationMinutes?: number }) => request(`/console/question-papers/${id}`, json("PATCH", payload)),
  remove: (id: string) => request(`/console/question-papers/${id}`, json("DELETE")),
  submit: (id: string) => request(`/console/question-papers/${id}/submit`, json("POST")),
  review: (id: string, payload: { action: "APPROVE" | "RETURN"; note?: string }) => request(`/console/question-papers/${id}/review`, json("POST", payload)),
  reopen: (id: string, reason: string) => request(`/console/question-papers/${id}/reopen`, json("POST", { reason })),
  recordPrint: (id: string, payload: { copies: { classId: string; copies: number }[]; answerKey: boolean }) => request<{ copies: number }>(`/console/question-papers/${id}/prints`, json("POST", payload)),

  createSection: (id: string, payload: { title: string; type: QuestionType; instructions?: string; passage?: string; rtl?: boolean; attemptCount?: number | null }) =>
    request<{ id: string }>(`/console/question-papers/${id}/sections`, json("POST", payload)),
  updateSection: (sectionId: string, payload: { title?: string; instructions?: string; passage?: string; rtl?: boolean; attemptCount?: number | null }) =>
    request(`/console/question-papers/sections/${sectionId}`, json("PATCH", payload)),
  removeSection: (sectionId: string) => request(`/console/question-papers/sections/${sectionId}`, json("DELETE")),
  reorderSections: (id: string, ids: string[]) => request(`/console/question-papers/${id}/sections/order`, json("PUT", { ids })),

  addQuestions: (sectionId: string, questions: QuestionInputBody[]) => request<{ added: number }>(`/console/question-papers/sections/${sectionId}/questions`, json("POST", { questions })),
  updateQuestion: (questionId: string, payload: Partial<QuestionInputBody>) => request(`/console/question-papers/questions/${questionId}`, json("PATCH", payload)),
  removeQuestion: (questionId: string) => request(`/console/question-papers/questions/${questionId}`, json("DELETE")),
  reorderQuestions: (sectionId: string, ids: string[]) => request(`/console/question-papers/sections/${sectionId}/questions/order`, json("PUT", { ids })),
};
