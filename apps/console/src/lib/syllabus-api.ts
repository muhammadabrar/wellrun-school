import type { Paged, TopicProgress } from "@wellrun/shared";
import { request } from "./api";
import { readYearId } from "./school-context";

export type { TopicProgress };

type Params = Record<string, string | undefined>;

function qs(params: Params) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const out = search.toString();
  return out ? `?${out}` : "";
}

const json = (method: string, payload: unknown): RequestInit => ({ method, body: JSON.stringify(payload) });

export type SyllabusStatus = "EMPTY" | "NOT_STARTED" | "ON_TRACK" | "BEHIND" | "COMPLETE";

export type SyllabusStats = {
  units: number;
  topics: number;
  completed: number;
  inProgress: number;
  locked: number;
  periods: number;
  periodsTaught: number;
  behind: number;
  percent: number;
  status: SyllabusStatus;
};

export const SYLLABUS_STATUS_LABEL: Record<SyllabusStatus, string> = {
  EMPTY: "No topics yet",
  NOT_STARTED: "Not started",
  ON_TRACK: "On track",
  BEHIND: "Behind schedule",
  COMPLETE: "Complete",
};

export type SyllabusOverview = {
  year: { id: string; name: string; status: string } | null;
  subjects: { id: string; name: string }[];
  grades: {
    name: string;
    sections: number;
    cells: { subjectId: string; syllabusId: string | null; stats: SyllabusStats | null; teachers: string[]; canEdit: boolean }[];
  }[];
  summary: { slots: number; created: number; missing: number; behind: number; complete: number; locked: number; topics: number; taught: number };
};

export type SyllabusRow = {
  id: string;
  gradeName: string;
  subject: { id: string; name: string };
  stats: SyllabusStats;
  teachers: string[];
  updatedAt: string;
  canEdit: boolean;
};

export type SyllabusList = Paged<SyllabusRow> & { statusCounts: Record<string, number> };

export type TopicUsage = { examId: string; examName: string; kind: string; classes: string[] };

export type SyllabusTopic = {
  id: string;
  title: string;
  objectives: string;
  resources: string;
  plannedPeriods: number;
  sortOrder: number;
  progress: TopicProgress;
  completedOn: string | null;
  locked: boolean;
  usedIn: TopicUsage[];
};

export type SyllabusUnit = {
  id: string;
  title: string;
  description: string;
  termId: string | null;
  plannedFrom: string | null;
  plannedTo: string | null;
  sortOrder: number;
  locked: boolean;
  topics: SyllabusTopic[];
};

export type SyllabusDetail = {
  id: string;
  year: { id: string; name: string; status: string };
  gradeName: string;
  subject: { id: string; name: string };
  overview: string;
  assessmentNotes: string;
  resources: string;
  updatedAt: string;
  classes: { id: string; label: string }[];
  teachers: string[];
  terms: { id: string; name: string }[];
  stats: SyllabusStats;
  permissions: { canEdit: boolean; readOnlyReason: string | null };
  units: SyllabusUnit[];
};

export type CoverageUnit = {
  id: string;
  title: string;
  termId: string | null;
  termName: string;
  plannedTo: string | null;
  topics: { id: string; title: string; progress: string; usedByExams: number }[];
};

export type CoverageOptions = { syllabusId: string | null; units: CoverageUnit[] };

export type PaperCoverage = CoverageOptions & {
  paper: { id: string; examId: string; examName: string; kind: string; className: string; gradeName: string; subject: string; subjectId: string; frozen: boolean; frozenReason: string | null };
  selected: string[];
};

// Query keys: scoped to the academic year being viewed ---------------------------------------------------

const y = () => readYearId();

export const syllabusKeys = {
  root: ["syllabus"] as const,
  overview: () => ["syllabus", y(), "overview"] as const,
  list: (query: Params) => ["syllabus", y(), "list", query] as const,
  detail: (id: string) => ["syllabus", "detail", id] as const,
  options: (gradeName: string, subjectId: string) => ["syllabus", y(), "options", gradeName, subjectId] as const,
  paperCoverage: (paperId: string) => ["syllabus", "paper-coverage", paperId] as const,
  sources: (subjectId: string) => ["syllabus", y(), "sources", subjectId] as const,
};

export const syllabusApi = {
  overview: () => request<SyllabusOverview>("/console/syllabus/overview"),
  list: (query: Params) => request<SyllabusList>(`/console/syllabus${qs(query)}`),
  detail: (id: string) => request<SyllabusDetail>(`/console/syllabus/${id}`),
  create: (payload: { gradeName: string; subjectId: string; copyFromId?: string }) =>
    request<{ id: string; existed: boolean; units: number; topics: number }>("/console/syllabus", json("POST", payload)),
  copyYear: (fromYearId: string) => request<{ created: number; skipped: number; topics: number }>("/console/syllabus/copy-year", json("POST", { fromYearId })),
  update: (id: string, payload: { overview?: string; assessmentNotes?: string; resources?: string }) => request(`/console/syllabus/${id}`, json("PATCH", payload)),
  remove: (id: string) => request(`/console/syllabus/${id}`, { method: "DELETE" }),

  createUnit: (id: string, payload: unknown) => request<{ id: string }>(`/console/syllabus/${id}/units`, json("POST", payload)),
  updateUnit: (unitId: string, payload: unknown) => request(`/console/syllabus/units/${unitId}`, json("PATCH", payload)),
  removeUnit: (unitId: string) => request(`/console/syllabus/units/${unitId}`, { method: "DELETE" }),
  reorderUnits: (id: string, ids: string[]) => request(`/console/syllabus/${id}/units/order`, json("PUT", { ids })),

  addTopics: (unitId: string, titles: string[], plannedPeriods?: number) =>
    request<{ added: number; skipped: number }>(`/console/syllabus/units/${unitId}/topics`, json("POST", { titles, plannedPeriods })),
  updateTopic: (topicId: string, payload: unknown) => request(`/console/syllabus/topics/${topicId}`, json("PATCH", payload)),
  removeTopic: (topicId: string) => request(`/console/syllabus/topics/${topicId}`, { method: "DELETE" }),
  reorderTopics: (unitId: string, ids: string[]) => request(`/console/syllabus/units/${unitId}/topics/order`, json("PUT", { ids })),
  setProgress: (topicId: string, progress: TopicProgress) => request(`/console/syllabus/topics/${topicId}/progress`, json("PATCH", { progress })),
  setProgressBulk: (topicIds: string[], progress: TopicProgress) => request<{ updated: number }>("/console/syllabus/topics/progress", json("POST", { topicIds, progress })),

  sources: (subjectId: string) => request<{ id: string; label: string; units: number; topics: number }[]>(`/console/syllabus/sources${qs({ subjectId })}`),
  options: (gradeName: string, subjectId: string) => request<CoverageOptions>(`/console/syllabus/coverage/options${qs({ gradeName, subjectId })}`),
  paperCoverage: (paperId: string) => request<PaperCoverage>(`/console/syllabus/coverage/paper/${paperId}`),
  setPaperCoverage: (paperId: string, topicIds: string[], allSections: boolean) =>
    request<{ updated: number; skipped: number; topics: number }>(`/console/syllabus/coverage/paper/${paperId}`, json("PUT", { topicIds, allSections })),
};
