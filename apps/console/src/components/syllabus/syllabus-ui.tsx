import { TOPIC_PROGRESS, TOPIC_PROGRESS_LABEL } from "@wellrun/shared";
import { Badge } from "@wellrun/ui";
import { LockIcon } from "lucide-react";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { currentUser } from "@/lib/api";
import { SYLLABUS_STATUS_LABEL, type SyllabusStats, type SyllabusStatus, type TopicProgress, type TopicUsage } from "@/lib/syllabus-api";

export function isSyllabusAdmin() {
  return currentUser()?.role === "SCHOOL_ADMIN";
}

const STATUS_TONE: Record<SyllabusStatus, "neutral" | "indigo" | "success" | "warning"> = {
  EMPTY: "neutral",
  NOT_STARTED: "neutral",
  ON_TRACK: "indigo",
  BEHIND: "warning",
  COMPLETE: "success",
};

export function SyllabusStatusBadge({ status }: { status: SyllabusStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{SYLLABUS_STATUS_LABEL[status]}</Badge>;
}

/** Taught share of a syllabus: taught topics in green, topics being taught in a lighter tone. */
export function TeachingProgress({ stats, label }: { stats: SyllabusStats; label?: string }) {
  const done = stats.topics ? (stats.completed / stats.topics) * 100 : 0;
  const doing = stats.topics ? (stats.inProgress / stats.topics) * 100 : 0;
  return (
    <div className="flex min-w-32 flex-col gap-1">
      <div
        className="flex h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={stats.topics}
        aria-valuenow={stats.completed}
        aria-label={label ?? "Topics taught"}
      >
        <div className="h-full bg-success" style={{ width: `${done}%` }} />
        {doing ? <div className="h-full bg-indigo/50" style={{ width: `${doing}%` }} /> : null}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {stats.completed}/{stats.topics} topics taught
        {stats.behind ? <span className="text-orange"> · {stats.behind} behind</span> : null}
      </span>
    </div>
  );
}

export function ProgressSelect({ value, onChange, disabled, label }: { value: TopicProgress; onChange: (value: TopicProgress) => void; disabled?: boolean; label: string }) {
  return (
    <NativeSelect
      size="sm"
      aria-label={label}
      value={value}
      disabled={disabled}
      className={value === "COMPLETED" ? "text-success" : ""}
      onChange={(event) => onChange(event.target.value as TopicProgress)}
    >
      {TOPIC_PROGRESS.map((p) => (
        <NativeSelectOption key={p} value={p}>
          {TOPIC_PROGRESS_LABEL[p]}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

/** Why a topic is locked, as a badge with the exams in its tooltip. */
export function LockBadge({ usedIn }: { usedIn: TopicUsage[] }) {
  const names = usedIn.map((u) => u.examName).join(", ");
  return (
    <span
      title={`Locked — covered by ${names}. Remove it from the exam's syllabus coverage to edit.`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full bg-orange/10 px-2 py-0.5 text-xs font-medium text-orange"
    >
      <LockIcon className="size-3" aria-hidden />
      <span className="max-w-40 truncate">{usedIn.length === 1 ? usedIn[0].examName : `${usedIn.length} exams`}</span>
    </span>
  );
}

export function shortDate(value?: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function dateSpan(from?: string | null, to?: string | null) {
  if (!from && !to) return "";
  if (from && to) return `${shortDate(from)} – ${shortDate(to)}`;
  return from ? `From ${shortDate(from)}` : `Until ${shortDate(to)}`;
}
