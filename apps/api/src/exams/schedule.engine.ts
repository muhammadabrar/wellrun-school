/** Date sheet maths: auto-scheduling papers across days and detecting clashes. Pure functions. */

export type SchedulablePaper = { id: string; classId: string; grade: string; subjectId: string; subjectName: string };

export type ScheduleOptions = {
  startsOn: string;
  skipWeekdays: number[];
  holidays: string[];
  papersPerDay: number;
  startTime: string;
  endTime: string;
};

export type ScheduledSlot = { date: string; startTime: string; endTime: string };

function toIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** The next `count` exam days from `startsOn`, skipping chosen weekdays (0 = Sunday) and holidays. */
export function examDays(startsOn: string, count: number, skipWeekdays: number[], holidays: string[]) {
  const days: string[] = [];
  const skip = new Set(skipWeekdays);
  const off = new Set(holidays);
  const cursor = new Date(`${startsOn.slice(0, 10)}T00:00:00Z`);
  let guard = 0;
  while (days.length < count && guard < 400) {
    const iso = toIso(cursor);
    if (!skip.has(cursor.getUTCDay()) && !off.has(iso)) days.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    guard += 1;
  }
  return days;
}

function minutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function clock(total: number) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Time window for the n-th paper of a day: same length as the first, with a 30 minute break between. */
export function slotTimes(startTime: string, endTime: string, index: number) {
  if (!startTime || !endTime) return { startTime, endTime };
  const length = Math.max(30, minutes(endTime) - minutes(startTime));
  const start = minutes(startTime) + index * (length + 30);
  return { startTime: clock(start), endTime: clock(start + length) };
}

/**
 * Every grade sits its subjects in the same order, one subject per slot; all sections of a grade write the
 * same subject at the same time. Subjects are ordered alphabetically so the date sheet is predictable.
 */
export function autoSchedule(papers: SchedulablePaper[], options: ScheduleOptions) {
  const perDay = Math.max(1, options.papersPerDay);
  const byGrade = new Map<string, string[]>();
  for (const paper of papers) {
    const subjects = byGrade.get(paper.grade) ?? [];
    if (!subjects.includes(paper.subjectId)) subjects.push(paper.subjectId);
    byGrade.set(paper.grade, subjects);
  }
  const names = new Map(papers.map((p) => [p.subjectId, p.subjectName]));
  for (const [grade, subjects] of byGrade) {
    byGrade.set(grade, [...subjects].sort((a, b) => (names.get(a) ?? "").localeCompare(names.get(b) ?? "")));
  }
  const longest = Math.max(0, ...[...byGrade.values()].map((s) => s.length));
  const days = examDays(options.startsOn, Math.ceil(longest / perDay), options.skipWeekdays, options.holidays);
  const result = new Map<string, ScheduledSlot>();
  for (const paper of papers) {
    const order = byGrade.get(paper.grade)!.indexOf(paper.subjectId);
    const date = days[Math.floor(order / perDay)];
    if (!date) continue;
    result.set(paper.id, { date, ...slotTimes(options.startTime, options.endTime, order % perDay) });
  }
  return { slots: result, lastDay: days[days.length - 1] ?? options.startsOn };
}

export type ClashPaper = {
  id: string;
  classId: string;
  className: string;
  subjectName: string;
  date: string | null;
  startTime: string;
  endTime: string;
  invigilatorId: string | null;
  invigilatorName?: string;
};

function overlaps(a: ClashPaper, b: ClashPaper) {
  if (!a.startTime || !a.endTime || !b.startTime || !b.endTime) return true;
  return minutes(a.startTime) < minutes(b.endTime) && minutes(b.startTime) < minutes(a.endTime);
}

/** Two papers for the same class, or the same invigilator, at overlapping times on the same day. */
export function findClashes(papers: ClashPaper[]) {
  const clashes: { paperIds: [string, string]; message: string }[] = [];
  const dated = papers.filter((p) => p.date);
  for (let i = 0; i < dated.length; i += 1) {
    for (let j = i + 1; j < dated.length; j += 1) {
      const a = dated[i];
      const b = dated[j];
      if (a.date !== b.date || !overlaps(a, b)) continue;
      if (a.classId === b.classId) {
        clashes.push({ paperIds: [a.id, b.id], message: `${a.className}: ${a.subjectName} and ${b.subjectName} overlap on ${a.date}` });
      } else if (a.invigilatorId && a.invigilatorId === b.invigilatorId) {
        clashes.push({ paperIds: [a.id, b.id], message: `${a.invigilatorName ?? "Invigilator"} is on two papers at once on ${a.date}` });
      }
    }
  }
  return clashes;
}
