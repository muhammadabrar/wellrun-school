import type { CalendarItem } from "@wellrun/shared";

export type ExamDayPaper = { id: string; date: string; startTime: string; endTime: string; className: string; subject: string; examId: string; examName: string };

const SHOWN = 3;

/**
 * One calendar entry per exam per day instead of one per paper: a mid-term can have dozens of papers a day, which would bury
 * everything else on a month view. The entry names a few papers and says how many more there are.
 */
export function groupExamPapers(papers: ExamDayPaper[]): CalendarItem[] {
  const groups = new Map<string, ExamDayPaper[]>();
  for (const paper of papers) {
    const key = `${paper.examId}|${paper.date}`;
    groups.set(key, [...(groups.get(key) ?? []), paper]);
  }
  return [...groups.values()].map((list) => {
    const first = list[0]!;
    const named = list.slice(0, SHOWN).map((p) => `${p.subject} (${p.className})`);
    const more = list.length - named.length;
    const starts = list.map((p) => p.startTime).filter(Boolean).sort();
    const ends = list.map((p) => p.endTime).filter(Boolean).sort();
    return {
      id: `exam:${first.examId}:${first.date}`,
      type: "EXAM" as const,
      title: first.examName,
      subtitle: `${named.join(", ")}${more > 0 ? ` and ${more} more` : ""}`,
      date: first.date,
      endDate: first.date,
      startTime: starts[0] ?? "",
      endTime: ends[ends.length - 1] ?? "",
      kind: null,
      audience: null,
      classLabels: [...new Set(list.map((p) => p.className))],
      eventId: null,
    };
  });
}
