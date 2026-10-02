/** Pure syllabus rules: progress against the plan, what is locked, and carrying a syllabus into a new year. No database access. */

export type Progress = "PLANNED" | "IN_PROGRESS" | "COMPLETED";

export type TopicFacts = { unitId: string; progress: Progress; plannedPeriods: number; locked: boolean };
export type UnitFacts = { id: string; plannedTo: Date | null };

export type SyllabusStats = {
  units: number;
  topics: number;
  completed: number;
  inProgress: number;
  locked: number;
  periods: number;
  periodsTaught: number;
  /** Topics whose unit should be finished by now but aren't taught yet. */
  behind: number;
  /** Share of topics taught, 0–100. */
  percent: number;
  status: "EMPTY" | "NOT_STARTED" | "ON_TRACK" | "BEHIND" | "COMPLETE";
};

export const SYLLABUS_STATUS_LABEL: Record<SyllabusStats["status"], string> = {
  EMPTY: "No topics yet",
  NOT_STARTED: "Not started",
  ON_TRACK: "On track",
  BEHIND: "Behind schedule",
  COMPLETE: "Complete",
};

const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** Counts and a status for one syllabus. `today` is a UTC date. */
export function syllabusStats(units: UnitFacts[], topics: TopicFacts[], today: Date): SyllabusStats {
  const dueUnits = new Set(units.filter((u) => u.plannedTo && startOfDay(u.plannedTo) < startOfDay(today)).map((u) => u.id));
  const completed = topics.filter((t) => t.progress === "COMPLETED").length;
  const inProgress = topics.filter((t) => t.progress === "IN_PROGRESS").length;
  const behind = topics.filter((t) => dueUnits.has(t.unitId) && t.progress !== "COMPLETED").length;
  const periods = topics.reduce((s, t) => s + t.plannedPeriods, 0);
  const periodsTaught = topics.filter((t) => t.progress === "COMPLETED").reduce((s, t) => s + t.plannedPeriods, 0);
  const status: SyllabusStats["status"] = !topics.length
    ? "EMPTY"
    : completed === topics.length
      ? "COMPLETE"
      : behind > 0
        ? "BEHIND"
        : completed + inProgress === 0
          ? "NOT_STARTED"
          : "ON_TRACK";
  return {
    units: units.length,
    topics: topics.length,
    completed,
    inProgress,
    locked: topics.filter((t) => t.locked).length,
    periods,
    periodsTaught,
    behind,
    percent: topics.length ? Math.round((completed / topics.length) * 100) : 0,
    status,
  };
}

/** Why a topic can't be changed, in words a teacher understands. */
export function lockMessage(usedIn: { examName: string }[], what = "edited") {
  const names = [...new Set(usedIn.map((u) => u.examName))];
  const list = names.length > 2 ? `${names.slice(0, 2).join(", ")} and ${names.length - 2} more` : names.join(" and ");
  return `This topic is covered by ${list || "an exam"}, so it can't be ${what}. Remove it from the exam's syllabus coverage first.`;
}

/** The ids must be exactly the existing ids, each once — a reorder never adds or drops rows. */
export function validOrder(ids: string[], existing: string[]) {
  if (ids.length !== existing.length) return false;
  const set = new Set(existing);
  return new Set(ids).size === ids.length && ids.every((id) => set.has(id));
}

/** Milliseconds between two years' start dates; planned dates move by this when a syllabus is carried over. */
export function yearShiftMs(from: Date, to: Date) {
  return to.getTime() - from.getTime();
}

export function shiftDate(date: Date | null, ms: number) {
  return date ? new Date(date.getTime() + ms) : null;
}

/** Which term of the new year a unit belongs to: the one in the same position (by order) as in the old year. */
export function mapTermByPosition(oldTermId: string | null, oldTerms: { id: string }[], newTerms: { id: string }[]) {
  if (!oldTermId) return null;
  const index = oldTerms.findIndex((t) => t.id === oldTermId);
  return index >= 0 ? (newTerms[index]?.id ?? null) : null;
}

export { parseTopicList } from "@wellrun/shared";

/** A paper's coverage is frozen once its marks are in review or approved, or its exam is published. */
export function coverageFrozen(paperStatus: string, examStatus: string) {
  return paperStatus === "SUBMITTED" || paperStatus === "APPROVED" || examStatus === "PUBLISHED";
}
