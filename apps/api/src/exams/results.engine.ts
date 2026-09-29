/** Pure result maths: grading, pass rules, weighted term/annual aggregation and ranking. No database access. */

export type Band = { grade: string; minPct: number; gpa: number | null; remark: string; isFail: boolean };

export type ResultRules = {
  overallPassPct: number;
  subjectPassRequired: boolean;
  maxFailSubjects: number;
  graceMarks: number;
  decimals: number;
  absentCountsAsZero: boolean;
  assessmentWeight: number;
  rankMethod: string;
  rankOnlyPassed: boolean;
};

export type Attendance = "PRESENT" | "ABSENT" | "MEDICAL" | "EXEMPT";

export type SubjectLine = {
  subjectId: string;
  name: string;
  obtained: number | null;
  max: number;
  pct: number | null;
  passPct: number;
  grade: string;
  passed: boolean;
  attendance: Attendance | "MIXED";
  grace?: number;
  parts?: { label: string; pct: number | null; weight: number }[];
};

export type Outcome = {
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  gpa: number | null;
  passed: boolean;
  failedSubjects: number;
};

export function round(value: number, decimals = 1) {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function normalizeBands(raw: unknown): Band[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => b as Partial<Band>)
    .filter((b) => typeof b.grade === "string" && typeof b.minPct === "number")
    .map((b) => ({ grade: b.grade!, minPct: b.minPct!, gpa: b.gpa ?? null, remark: b.remark ?? "", isFail: Boolean(b.isFail) }))
    .sort((a, b) => b.minPct - a.minPct);
}

export function bandFor(pct: number, bands: Band[]): Band | null {
  for (const band of bands) if (pct >= band.minPct) return band;
  return bands[bands.length - 1] ?? null;
}

/** One paper for one student. Exempt/medical papers drop out of totals; absent counts as zero if the school says so. */
export function paperLine(
  input: { subjectId: string; name: string; marks: number | null; attendance: Attendance; maxMarks: number; passMarks: number },
  rules: Pick<ResultRules, "graceMarks" | "absentCountsAsZero" | "decimals">,
  bands: Band[],
): SubjectLine {
  const passPct = input.maxMarks > 0 ? (input.passMarks / input.maxMarks) * 100 : 0;
  const excluded =
    input.attendance === "EXEMPT" ||
    input.attendance === "MEDICAL" ||
    (input.attendance === "ABSENT" && !rules.absentCountsAsZero) ||
    (input.attendance === "PRESENT" && input.marks == null);
  if (excluded) {
    return { subjectId: input.subjectId, name: input.name, obtained: null, max: 0, pct: null, passPct, grade: "", passed: true, attendance: input.attendance };
  }
  let obtained = input.attendance === "ABSENT" ? 0 : Math.min(input.marks ?? 0, input.maxMarks);
  let grace: number | undefined;
  if (input.attendance === "PRESENT" && obtained < input.passMarks && input.passMarks - obtained <= rules.graceMarks) {
    grace = round(input.passMarks - obtained, 2);
    obtained = input.passMarks;
  }
  const pct = input.maxMarks > 0 ? (obtained / input.maxMarks) * 100 : 0;
  return {
    subjectId: input.subjectId,
    name: input.name,
    obtained: round(obtained, rules.decimals),
    max: input.maxMarks,
    pct: round(pct, rules.decimals),
    passPct: round(passPct, 2),
    grade: bandFor(pct, bands)?.grade ?? "",
    passed: obtained >= input.passMarks,
    attendance: input.attendance,
    ...(grace ? { grace } : {}),
  };
}

/** Totals, grade and pass/fail for a set of subject lines. */
export function outcome(lines: SubjectLine[], rules: Pick<ResultRules, "overallPassPct" | "subjectPassRequired" | "maxFailSubjects" | "decimals">, bands: Band[]): Outcome {
  const counted = lines.filter((l) => l.pct != null && l.max > 0);
  const totalMax = counted.reduce((s, l) => s + l.max, 0);
  const totalObtained = counted.reduce((s, l) => s + (l.obtained ?? 0), 0);
  const pct = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
  const failedSubjects = counted.filter((l) => !l.passed).length;
  const band = bandFor(pct, bands);
  const gpas = counted.map((l) => bandFor(l.pct ?? 0, bands)?.gpa).filter((g): g is number => g != null);
  const passedSubjects = !rules.subjectPassRequired || failedSubjects <= rules.maxFailSubjects;
  return {
    totalObtained: round(totalObtained, rules.decimals),
    totalMax: round(totalMax, 2),
    percentage: round(pct, rules.decimals),
    grade: counted.length ? band?.grade ?? "" : "",
    gpa: gpas.length ? round(gpas.reduce((s, g) => s + g, 0) / gpas.length, 2) : null,
    passed: counted.length > 0 && pct >= rules.overallPassPct && passedSubjects,
    failedSubjects,
  };
}

/** Weighted mean that ignores missing values and re-normalises the remaining weights. */
export function weightedPct(parts: { pct: number | null; weight: number }[]) {
  const usable = parts.filter((p) => p.pct != null && p.weight > 0);
  const total = usable.reduce((s, p) => s + p.weight, 0);
  if (!total) {
    const plain = parts.filter((p) => p.pct != null);
    return plain.length ? plain.reduce((s, p) => s + (p.pct ?? 0), 0) / plain.length : null;
  }
  return usable.reduce((s, p) => s + (p.pct ?? 0) * p.weight, 0) / total;
}

export type ContributionLine = { label: string; kind: "EXAM" | "ASSESSMENT"; weight: number; pct: number | null; passPct: number };

/**
 * One subject over a term: exams are weighted by their exam weight, assessments (quiz/assignment/practical/viva)
 * are pooled and take `assessmentWeight`% of the subject. Each side falls back to 100% when the other is missing.
 */
export function combineSubject(
  subject: { subjectId: string; name: string },
  lines: ContributionLine[],
  rules: Pick<ResultRules, "assessmentWeight" | "decimals">,
  bands: Band[],
): SubjectLine {
  const exams = lines.filter((l) => l.kind === "EXAM");
  const assessments = lines.filter((l) => l.kind === "ASSESSMENT");
  const examPct = weightedPct(exams);
  const assessPct = weightedPct(assessments);
  const examPass = weightedPct(exams.map((l) => ({ pct: l.pct == null ? null : l.passPct, weight: l.weight })));
  const assessPass = weightedPct(assessments.map((l) => ({ pct: l.pct == null ? null : l.passPct, weight: l.weight })));
  const aw = rules.assessmentWeight / 100;
  const mix = (a: number | null, b: number | null) => (a == null ? b : b == null ? a : a * (1 - aw) + b * aw);
  const pct = mix(examPct, assessPct);
  const passPct = mix(examPass, assessPass) ?? 0;
  return {
    subjectId: subject.subjectId,
    name: subject.name,
    obtained: pct == null ? null : round(pct, rules.decimals),
    max: pct == null ? 0 : 100,
    pct: pct == null ? null : round(pct, rules.decimals),
    passPct: round(passPct, 2),
    grade: pct == null ? "" : bandFor(pct, bands)?.grade ?? "",
    passed: pct == null ? true : pct + 1e-9 >= passPct,
    attendance: "MIXED",
    parts: lines.map((l) => ({ label: l.label, pct: l.pct, weight: l.weight })),
  };
}

/** Annual subject line from term lines weighted by term weight. */
export function combineTerms(
  subject: { subjectId: string; name: string },
  terms: { label: string; weight: number; line: SubjectLine | null }[],
  rules: Pick<ResultRules, "decimals">,
  bands: Band[],
): SubjectLine {
  const parts = terms.map((t) => ({ pct: t.line?.pct ?? null, weight: t.weight }));
  const pct = weightedPct(parts);
  const passPct = weightedPct(terms.map((t) => ({ pct: t.line?.pct == null ? null : t.line.passPct, weight: t.weight }))) ?? 0;
  return {
    subjectId: subject.subjectId,
    name: subject.name,
    obtained: pct == null ? null : round(pct, rules.decimals),
    max: pct == null ? 0 : 100,
    pct: pct == null ? null : round(pct, rules.decimals),
    passPct: round(passPct, 2),
    grade: pct == null ? "" : bandFor(pct, bands)?.grade ?? "",
    passed: pct == null ? true : pct + 1e-9 >= passPct,
    attendance: "MIXED",
    parts: terms.map((t) => ({ label: t.label, pct: t.line?.pct ?? null, weight: t.weight })),
  };
}

/**
 * Rank rows by percentage (then total obtained). DENSE: 1,1,2. STANDARD: 1,1,3. NONE: no ranks.
 * With rankOnlyPassed, failed students get no rank.
 */
export function rankRows<T extends { id: string; percentage: number; totalObtained: number; passed: boolean; hasMarks?: boolean }>(
  rows: T[],
  method: string,
  onlyPassed: boolean,
) {
  const ranks = new Map<string, number | null>();
  if (method === "NONE") {
    rows.forEach((r) => ranks.set(r.id, null));
    return ranks;
  }
  const eligible = rows.filter((r) => r.hasMarks !== false && (!onlyPassed || r.passed));
  const sorted = [...eligible].sort((a, b) => b.percentage - a.percentage || b.totalObtained - a.totalObtained);
  let rank = 0;
  let prev: T | null = null;
  sorted.forEach((row, index) => {
    const tie = prev && prev.percentage === row.percentage && prev.totalObtained === row.totalObtained;
    if (!tie) rank = method === "STANDARD" ? index + 1 : rank + 1;
    ranks.set(row.id, rank);
    prev = row;
  });
  rows.forEach((r) => {
    if (!ranks.has(r.id)) ranks.set(r.id, null);
  });
  return ranks;
}

/** Summary stats for a list of percentages (analytics + verification screen). */
export function stats(values: number[]) {
  if (!values.length) return { count: 0, avg: null as number | null, high: null as number | null, low: null as number | null, median: null as number | null };
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return {
    count: values.length,
    avg: round(values.reduce((s, v) => s + v, 0) / values.length, 1),
    high: sorted[sorted.length - 1],
    low: sorted[0],
    median: sorted.length % 2 ? sorted[mid] : round((sorted[mid - 1] + sorted[mid]) / 2, 1),
  };
}
