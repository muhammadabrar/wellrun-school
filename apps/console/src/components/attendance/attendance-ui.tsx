import { ATTENDANCE_CODES, ATTENDANCE_LABELS, type AttendanceStatus } from "@wellrun/shared";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { periodName } from "@/components/staff/staff-ui";
import { cn } from "@/lib/utils";

export const MARK_ORDER: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "LEAVE", "EXCUSED"];

/** Solid tone when selected / shown in the register. */
export const MARK_TONE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success text-white",
  ABSENT: "bg-danger text-white",
  LATE: "bg-orange text-white",
  LEAVE: "bg-ink text-white",
  EXCUSED: "bg-indigo text-white",
};

/** Soft tone for dense grids. */
export const MARK_SOFT: Record<AttendanceStatus, string> = {
  PRESENT: "bg-success/15 text-success",
  ABSENT: "bg-danger/15 text-danger",
  LATE: "bg-orange/15 text-orange",
  LEAVE: "bg-ink/10 text-ink",
  EXCUSED: "bg-indigo/15 text-indigo",
};

export const markCode = (status: AttendanceStatus | null | undefined) => (status ? ATTENDANCE_CODES[status] : "");
export const markLabel = (status: AttendanceStatus) => ATTENDANCE_LABELS[status];

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export { periodName as monthName };

/** Last 12 months plus next month, newest first; keeps `current` in the list. */
export function monthOptions(current: string) {
  const now = new Date();
  const thisMonth = monthKey(now);
  const list: string[] = [];
  for (let offset = 0; offset >= -12; offset -= 1) list.push(monthKey(new Date(now.getFullYear(), now.getMonth() + offset, 1)));
  if (!list.includes(current)) list.push(current);
  return list.map((value) => ({ value, label: value === thisMonth ? `${periodName(value)} (this month)` : periodName(value) }));
}

export function pctTone(pct: number | null | undefined, threshold: number) {
  if (pct == null) return "text-muted-foreground";
  if (pct < threshold) return "text-danger";
  if (pct < Math.min(100, threshold + 10)) return "text-orange";
  return "text-success";
}

export function PctText({ value, threshold, className }: { value: number | null | undefined; threshold: number; className?: string }) {
  return <span className={cn("font-medium tabular-nums", pctTone(value, threshold), className)}>{value == null ? "—" : `${value}%`}</span>;
}

/** Pill bar with the attendance %, coloured against the school's threshold. */
export function PctBar({ value, threshold }: { value: number | null; threshold: number }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(100, value));
  const fill = value == null ? "bg-line" : value < threshold ? "bg-danger" : value < Math.min(100, threshold + 10) ? "bg-orange" : "bg-success";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined}>
      <div className={cn("h-full rounded-full", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function MarkLegend() {
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Legend">
      {MARK_ORDER.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-[10px] font-semibold", MARK_SOFT[s])}>{ATTENDANCE_CODES[s]}</span>
          {ATTENDANCE_LABELS[s]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="inline-block h-5 w-5 rounded bg-line/60" />
        Holiday / closed
      </li>
    </ul>
  );
}

/** Excel, CSV and Print buttons for a report. */
export function ExportButtons({ onExcel, onCsv, disabled }: { onExcel: () => Promise<void> | void; onCsv: () => void; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button
        variant="outline"
        size="sm"
        icon={<FileSpreadsheet />}
        loading={busy}
        disabled={disabled}
        onClick={async () => {
          setBusy(true);
          try {
            await onExcel();
          } finally {
            setBusy(false);
          }
        }}
      >
        Excel
      </Button>
      <Button variant="outline" size="sm" icon={<Download />} disabled={disabled} onClick={onCsv}>
        CSV
      </Button>
      <Button variant="outline" size="sm" icon={<Printer />} disabled={disabled} onClick={() => window.print()}>
        Print / PDF
      </Button>
    </div>
  );
}
