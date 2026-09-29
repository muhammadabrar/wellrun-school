import { Badge } from "@wellrun/ui";
import { Plus, Trash2 } from "lucide-react";
import { formatClock } from "@/components/form/time-picker";
import { WEEKDAYS } from "@/components/timetable/lesson-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ContractType, PayLine, PayslipStatus, StaffStatus, StaffWeek } from "@/lib/api";
import { pkr } from "@/lib/format";

export const STAFF_STATUS: Record<StaffStatus, { label: string; tone: "success" | "indigo" | "warning" | "danger" | "neutral"; help: string }> = {
  ACTIVE: { label: "Active", tone: "success", help: "Working normally. Can sign in and is paid." },
  ON_LEAVE: { label: "On leave", tone: "indigo", help: "Away for a while. Can still sign in and is still paid." },
  SUSPENDED: { label: "Suspended", tone: "warning", help: "Can't sign in and isn't paid until made active again." },
  RESIGNED: { label: "Resigned", tone: "neutral", help: "Left the school. Sign-in is blocked and their timetable periods are freed." },
  TERMINATED: { label: "Terminated", tone: "danger", help: "Employment ended. Sign-in is blocked and their timetable periods are freed." },
};

export const CONTRACT_TYPES: Record<ContractType, string> = {
  PERMANENT: "Permanent",
  CONTRACT: "Fixed-term contract",
  PROBATION: "Probation",
  PART_TIME: "Part-time",
  VISITING: "Visiting",
};

export const PAYSLIP_STATUS: Record<PayslipStatus, { label: string; tone: "success" | "indigo" | "warning" | "neutral" }> = {
  DRAFT: { label: "Draft", tone: "warning" },
  FINALIZED: { label: "Ready to pay", tone: "indigo" },
  PAID: { label: "Paid", tone: "success" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export const PAYMENT_METHODS = [
  { value: "bank", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "online", label: "Mobile wallet / online" },
];

export function StaffStatusBadge({ status }: { status: StaffStatus }) {
  return <Badge tone={STAFF_STATUS[status].tone}>{STAFF_STATUS[status].label}</Badge>;
}

export function PayslipStatusBadge({ status }: { status: PayslipStatus }) {
  return <Badge tone={PAYSLIP_STATUS[status].tone}>{PAYSLIP_STATUS[status].label}</Badge>;
}

export function formatDay(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

export function isoDay(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function periodName(period: string) {
  const [year, month] = period.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

/** Formats digits as 12345-1234567-1 while typing. */
export function formatCnic(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

export function CnicInput(props: Omit<React.ComponentProps<typeof Input>, "onChange" | "value"> & { value: string; onChange: (value: string) => void }) {
  const { value, onChange, ...rest } = props;
  return (
    <Input
      {...rest}
      inputMode="numeric"
      autoComplete="off"
      placeholder="12345-1234567-1"
      value={value}
      onChange={(event) => onChange(formatCnic(event.target.value))}
    />
  );
}

/** Rows of { label, amount } — allowances on a contract, or allowances/deductions on a payslip. */
export function PayLinesEditor({
  lines,
  onChange,
  addLabel,
  labelPlaceholder,
  idPrefix,
}: {
  lines: PayLine[];
  onChange: (lines: PayLine[]) => void;
  addLabel: string;
  labelPlaceholder: string;
  idPrefix: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-[1fr_9rem_auto] items-center gap-2">
          <Input
            aria-label={`${labelPlaceholder} ${index + 1}`}
            id={`${idPrefix}-label-${index}`}
            value={line.label}
            placeholder={labelPlaceholder}
            onChange={(event) => onChange(lines.map((row, i) => (i === index ? { ...row, label: event.target.value } : row)))}
          />
          <Input
            aria-label={`${line.label || labelPlaceholder} amount (Rs.)`}
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={line.amountPkr || ""}
            placeholder="Rs."
            onChange={(event) => onChange(lines.map((row, i) => (i === index ? { ...row, amountPkr: Math.max(0, Math.round(Number(event.target.value) || 0)) } : row)))}
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${line.label || "line"}`} onClick={() => onChange(lines.filter((_, i) => i !== index))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="w-fit" icon={<Plus />} onClick={() => onChange([...lines, { label: "", amountPkr: 0 }])}>
        {addLabel}
      </Button>
    </div>
  );
}

export function cleanLines(lines: PayLine[]) {
  return lines.map((line) => ({ label: line.label.trim(), amountPkr: line.amountPkr })).filter((line) => line.label);
}

export function linesTotal(lines: PayLine[]) {
  return lines.reduce((sum, line) => sum + (line.amountPkr || 0), 0);
}

export function SalaryLine({ basic, allowances }: { basic: number; allowances: PayLine[] }) {
  const total = basic + linesTotal(allowances);
  return (
    <span className="tabular-nums">
      {pkr(total)}
      {allowances.length ? <span className="text-muted-foreground"> ({pkr(basic)} basic + {pkr(linesTotal(allowances))} allowances)</span> : null}
    </span>
  );
}

/** One staff member's week: periods down, days across, each cell the class and subject. */
export function StaffWeekGrid({ week, today, emptyText }: { week: StaffWeek; today?: number; emptyText: string }) {
  const teaching = week.periods.filter((period) => !period.isBreak);
  if (!week.lessons.length || !teaching.length) {
    return <p className="rounded-2xl bg-muted/60 px-4 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  }
  const days = WEEKDAYS.filter((day) => day.id <= (week.lessons.some((lesson) => lesson.weekday === 6) ? 6 : 5));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-176 table-fixed border-separate border-spacing-1 text-left text-sm">
        <thead>
          <tr>
            <th scope="col" className="w-32 px-2 py-2 font-medium text-muted-foreground">
              Period
            </th>
            {days.map((day) => (
              <th key={day.id} scope="col" className={`px-2 py-2 font-medium ${day.id === today ? "text-primary" : ""}`}>
                {day.short}
                {day.id === today ? <span className="sr-only"> (today)</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.periods.map((period) => (
            <tr key={period.id}>
              <th scope="row" className="px-2 py-2 align-top font-medium">
                {period.label}
                <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                  {formatClock(period.startTime)}–{formatClock(period.endTime)}
                </span>
              </th>
              {period.isBreak ? (
                <td colSpan={days.length} className="rounded-xl bg-muted/60 px-3 py-2 text-center text-xs tracking-wide text-muted-foreground uppercase">
                  {period.label}
                </td>
              ) : (
                days.map((day) => {
                  const lesson = week.lessons.find((row) => row.weekday === day.id && row.periodId === period.id);
                  return (
                    <td key={day.id} className="p-0 align-top">
                      <div
                        className={`min-h-14 rounded-xl px-3 py-2 ${lesson ? "bg-primary/5" : "border border-dashed border-line"} ${
                          day.id === today ? "ring-1 ring-primary/30" : ""
                        }`}
                      >
                        {lesson ? (
                          <>
                            <span className="block truncate font-medium">
                              {lesson.class.name} {lesson.class.section}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">{lesson.subject}</span>
                          </>
                        ) : (
                          <span className="text-xs text-muted-foreground">Free</span>
                        )}
                      </div>
                    </td>
                  );
                })
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
