import { EXAM_KIND_LABELS } from "@wellrun/shared";
import { Badge } from "@wellrun/ui";
import type { ReactNode } from "react";
import { FormSelect } from "@/components/form/form-select";
import { Label } from "@/components/ui/label";
import { currentUser } from "@/lib/api";
import type { ExamContext, ExamKind, ExamListRow, ExamStatus, PaperStatus, ResultScope } from "@/lib/exams-api";

type Tone = "success" | "indigo" | "warning" | "danger" | "neutral";

export const EXAM_STATUS: Record<ExamStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  SCHEDULED: { label: "Scheduled", tone: "indigo" },
  IN_PROGRESS: { label: "In progress", tone: "indigo" },
  MARKING: { label: "Marking", tone: "warning" },
  COMPLETED: { label: "Marks approved", tone: "success" },
  PUBLISHED: { label: "Published", tone: "success" },
};

export const PAPER_STATUS: Record<PaperStatus, { label: string; tone: Tone; help: string }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral", help: "No marks entered yet." },
  DRAFT: { label: "Draft", tone: "indigo", help: "Marks saved but not submitted." },
  SUBMITTED: { label: "Awaiting verification", tone: "warning", help: "Submitted — waiting for an admin to verify." },
  RETURNED: { label: "Returned", tone: "danger", help: "Sent back to the teacher to fix." },
  APPROVED: { label: "Approved", tone: "success", help: "Verified and locked. Changes need a correction request." },
};

export const KIND_PATHS: Record<Exclude<ExamKind, "EXAM">, string> = {
  QUIZ: "quizzes",
  ASSIGNMENT: "assignments",
  PRACTICAL: "practicals",
  VIVA: "viva",
};

export const KIND_FROM_PATH: Record<string, Exclude<ExamKind, "EXAM">> = {
  quizzes: "QUIZ",
  assignments: "ASSIGNMENT",
  practicals: "PRACTICAL",
  viva: "VIVA",
};

export const KIND_PLURAL: Record<ExamKind, string> = {
  EXAM: "Exams",
  QUIZ: "Quizzes",
  ASSIGNMENT: "Assignments",
  PRACTICAL: "Practicals",
  VIVA: "Viva",
};

export function isExamAdmin() {
  return currentUser()?.role === "SCHOOL_ADMIN";
}

export function ExamStatusBadge({ status }: { status: ExamStatus }) {
  return <Badge tone={EXAM_STATUS[status].tone}>{EXAM_STATUS[status].label}</Badge>;
}

export function PaperStatusBadge({ status }: { status: PaperStatus }) {
  return (
    <span title={PAPER_STATUS[status].help}>
      <Badge tone={PAPER_STATUS[status].tone}>{PAPER_STATUS[status].label}</Badge>
    </span>
  );
}

export function KindBadge({ kind }: { kind: ExamKind }) {
  return <Badge tone={kind === "EXAM" ? "indigo" : "neutral"}>{EXAM_KIND_LABELS[kind]}</Badge>;
}

export function formatDay(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function formatDayShort(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function dateRange(from?: string | null, to?: string | null) {
  if (!from) return "—";
  if (!to || to === from) return formatDay(from);
  return `${formatDay(from)} – ${formatDay(to)}`;
}

export function fmtNum(value: number | null | undefined, digits = 1) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(digits);
}

export function pct(value: number | null | undefined) {
  return value == null ? "—" : `${fmtNum(value)}%`;
}

export function ordinal(n: number | null | undefined) {
  if (!n) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "warning" | "success" }) {
  return (
    <div className="rounded-3xl bg-surface p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums">{value}</dd>
      {hint ? <dd className={tone === "warning" ? "mt-1 text-xs text-orange" : tone === "success" ? "mt-1 text-xs text-success" : "mt-1 text-xs text-muted-foreground"}>{hint}</dd> : null}
    </div>
  );
}

/** Thin progress bar: approved share of papers (with submitted shown lighter). */
export function MarkingProgress({ approved, submitted = 0, total, label }: { approved: number; submitted?: number; total: number; label?: string }) {
  const a = total ? (approved / total) * 100 : 0;
  const s = total ? (submitted / total) * 100 : 0;
  return (
    <div className="flex min-w-32 flex-col gap-1">
      <div
        className="flex h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={approved}
        aria-label={label ?? "Papers approved"}
      >
        <div className="h-full bg-success" style={{ width: `${a}%` }} />
        {s ? <div className="h-full bg-orange/70" style={{ width: `${s}%` }} /> : null}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {approved}/{total} approved{submitted ? ` · ${submitted} waiting` : ""}
      </span>
    </div>
  );
}

export type ScopeValue = { scope: ResultScope; scopeId?: string };

export function scopeToString(value: ScopeValue | null) {
  if (!value) return "";
  return value.scope === "ANNUAL" ? "ANNUAL" : `${value.scope}:${value.scopeId}`;
}

export function scopeFromString(raw: string | null): ScopeValue | null {
  if (!raw) return null;
  if (raw === "ANNUAL") return { scope: "ANNUAL" };
  const [scope, scopeId] = raw.split(":");
  if ((scope === "EXAM" || scope === "TERM") && scopeId) return { scope, scopeId };
  return null;
}

/** Picker for "which result": an exam, a term, or the whole year. */
export function ScopeSelect({
  id,
  value,
  onChange,
  exams,
  terms,
  label = "Result for",
}: {
  id: string;
  value: ScopeValue | null;
  onChange: (value: ScopeValue | null) => void;
  exams: Pick<ExamListRow, "id" | "name">[];
  terms: ExamContext["terms"];
  label?: string;
}) {
  const options = [
    ...exams.map((e) => ({ value: `EXAM:${e.id}`, label: e.name })),
    ...terms.map((t) => ({ value: `TERM:${t.id}`, label: `${t.name} (combined)` })),
    { value: "ANNUAL", label: "Annual result (whole year)" },
  ];
  return (
    <div className="flex w-64 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <FormSelect id={id} value={scopeToString(value) || null} onValueChange={(next) => onChange(scopeFromString(next))} options={options} placeholder="Pick exam, term or year" />
    </div>
  );
}

export function ClassSelect({
  id,
  value,
  onChange,
  classes,
  label = "Class",
  allowAll,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  classes: ExamContext["classes"];
  label?: string;
  allowAll?: string;
}) {
  const options = [...(allowAll ? [{ value: "all", label: allowAll }] : []), ...classes.map((c) => ({ value: c.id, label: c.label }))];
  return (
    <div className="flex w-52 flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <FormSelect id={id} value={value || (allowAll ? "all" : null)} onValueChange={(next) => onChange(next === "all" ? "" : (next ?? ""))} options={options} placeholder="Pick a class" />
    </div>
  );
}

/** Horizontal bars for a 0–100 value per row (class or subject averages). One series, so no legend. */
export function PercentBars({ rows, threshold }: { rows: { id: string; label: string; value: number | null; detail?: string }[]; threshold?: number }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.id} className="grid grid-cols-[minmax(6rem,10rem)_1fr_3.5rem] items-center gap-3 text-sm" title={`${row.label}: ${pct(row.value)}${row.detail ? ` · ${row.detail}` : ""}`}>
          <span className="truncate">{row.label}</span>
          <div className="relative h-3 rounded-full bg-paper">
            <div className="h-full rounded-full bg-indigo" style={{ width: `${Math.max(0, Math.min(100, row.value ?? 0))}%` }} />
            {threshold != null ? (
              <div className="absolute inset-y-[-3px] w-px bg-ink/40" style={{ left: `${threshold}%` }} aria-hidden />
            ) : null}
          </div>
          <span className="text-right tabular-nums text-muted-foreground">{pct(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Grade spread as one stacked bar; grades are ordinal so they share one hue from light to dark. */
export function GradeSpread({ grades, order }: { grades: Record<string, number>; order: string[] }) {
  const labels = order.filter((g) => grades[g]);
  const total = labels.reduce((s, g) => s + grades[g], 0);
  if (!total) return <p className="text-sm text-muted-foreground">No grades yet.</p>;
  const shade = (i: number) => `color-mix(in oklch, var(--color-indigo, #4642ff) ${Math.round(100 - (i / Math.max(1, labels.length - 1)) * 70)}%, white)`;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={labels.map((g) => `${g}: ${grades[g]}`).join(", ")}>
        {labels.map((g, i) => (
          <div key={g} style={{ width: `${(grades[g] / total) * 100}%`, background: shade(i) }} title={`${g}: ${grades[g]} students`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {labels.map((g, i) => (
          <li key={g} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: shade(i) }} aria-hidden />
            <span className="text-ink">{g}</span> {grades[g]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Percentage across exams: one 2px line, 8px markers, hover titles. */
export function TrendLine({
  points,
  height = 140,
  emptyText = "The trend appears after two exams.",
  labelEvery = 1,
}: {
  points: { label: string; value: number | null }[];
  height?: number;
  emptyText?: string;
  /** Print every Nth x-axis label (the last one always shows) so long series stay readable. */
  labelEvery?: number;
}) {
  const valid = points.filter((p) => p.value != null);
  if (valid.length < 2) return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  const width = 560;
  const pad = { l: 32, r: 12, t: 12, b: 28 };
  const x = (i: number) => pad.l + (points.length === 1 ? 0 : (i / (points.length - 1)) * (width - pad.l - pad.r));
  const yPos = (v: number) => pad.t + (1 - v / 100) * (height - pad.t - pad.b);
  const path = points
    .map((p, i) => (p.value == null ? null : `${x(i)},${yPos(p.value)}`))
    .filter(Boolean)
    .join(" L ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={points.map((p) => `${p.label} ${pct(p.value)}`).join(", ")}>
      {[0, 50, 100].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={width - pad.r} y1={yPos(v)} y2={yPos(v)} stroke="currentColor" className="text-line" strokeWidth={1} />
          <text x={pad.l - 6} y={yPos(v) + 4} textAnchor="end" className="fill-muted-foreground text-[10px]">
            {v}
          </text>
        </g>
      ))}
      <path d={`M ${path}`} fill="none" stroke="#4642ff" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) =>
        p.value == null ? null : (
          <g key={i}>
            <circle cx={x(i)} cy={yPos(p.value)} r={4} fill="#4642ff" stroke="white" strokeWidth={2}>
              <title>{`${p.label}: ${pct(p.value)}`}</title>
            </circle>
            <circle cx={x(i)} cy={yPos(p.value)} r={12} fill="transparent">
              <title>{`${p.label}: ${pct(p.value)}`}</title>
            </circle>
          </g>
        ),
      )}
      {points.map((p, i) => (i % labelEvery !== 0 && i !== points.length - 1 ? null :
        <text key={`l${i}`} x={x(i)} y={height - 8} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">
          {p.label.length > 16 ? `${p.label.slice(0, 15)}…` : p.label}
        </text>
      ))}
    </svg>
  );
}

/** Opens a PDF from an authenticated endpoint in a new tab. */
export async function openPdf(load: () => Promise<string>) {
  const win = window.open("", "_blank");
  try {
    const url = await load();
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (error) {
    win?.close();
    throw error;
  }
}
