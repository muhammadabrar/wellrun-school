import { EmptyState, Skeleton } from "@wellrun/ui";
import type { DashboardActivity, DashboardAttention } from "@wellrun/shared";
import {
  BanknoteIcon,
  ArrowRightIcon,
  BriefcaseIcon,
  CheckCircle2Icon,
  ClipboardCheckIcon,
  GraduationCapIcon,
  NotebookPenIcon,
  ReceiptTextIcon,
  UserPlusIcon,
  WalletIcon,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

type Tone = "warning" | "success" | "critical";

const HINT_TONE: Record<Tone, string> = {
  warning: "text-orange",
  success: "text-success",
  critical: "text-danger",
};

/** One headline number that links to the module behind it. */
export function KpiCard({
  label,
  value,
  hint,
  tone,
  to,
  title,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  to: string;
  /** Full-precision value for hover, when `value` is abbreviated. */
  title?: string;
}) {
  return (
    <Link
      to={to}
      className="group rounded-3xl bg-surface p-4 shadow-[0_12px_40px_rgba(22,22,29,0.06)] transition-shadow hover:shadow-[0_12px_40px_rgba(70,66,255,0.14)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo"
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl tabular-nums" title={title}>
        {value}
      </p>
      {hint ? <p className={cn("mt-1 text-xs", tone ? HINT_TONE[tone] : "text-muted-foreground")}>{hint}</p> : null}
    </Link>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = `panel-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <section className={cn("rounded-3xl bg-surface p-5", className)} aria-labelledby={id}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 id={id} className="font-medium">
            {title}
          </h2>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

const ATTENTION_DOT: Record<DashboardAttention["tone"], string> = {
  critical: "bg-danger",
  warning: "bg-orange",
  info: "bg-indigo",
};

const ATTENTION_LABEL: Record<DashboardAttention["tone"], string> = {
  critical: "Urgent",
  warning: "Needs attention",
  info: "For your information",
};

export function AttentionList({ items }: { items: DashboardAttention[] }) {
  if (!items.length) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-success/10 p-4 text-sm">
        <CheckCircle2Icon className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
        <div>
          <p className="font-medium text-success">You're all caught up</p>
          <p className="mt-0.5 text-muted-foreground">
            No overdue fees, unmarked registers, or pending reviews. New items will show up here.
          </p>
        </div>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => (
        <li key={item.key}>
          <Link
            to={item.href}
            className="flex items-center gap-3 rounded-xl py-3 pr-1 hover:bg-paper focus-visible:outline-2 focus-visible:outline-indigo"
          >
            <span className={cn("ml-1 size-2.5 shrink-0 rounded-full", ATTENTION_DOT[item.tone])} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="sr-only">{ATTENTION_LABEL[item.tone]}: </span>
              <span className="block truncate text-sm font-medium">{item.title}</span>
              <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
            </span>
            <ArrowRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const ACTIONS: { to: string; label: string; hint: string; icon: LucideIcon }[] = [
  { to: "/attendance/mark", label: "Mark attendance", hint: "Today's registers", icon: ClipboardCheckIcon },
  { to: "/admissions/new", label: "New application", hint: "Start an admission", icon: UserPlusIcon },
  { to: "/fees/invoices", label: "Collect a fee", hint: "Find an invoice and pay", icon: WalletIcon },
  { to: "/fees/generate", label: "Generate fees", hint: "Bill the month", icon: ReceiptTextIcon },
  { to: "/exams/new", label: "Create exam", hint: "Schedule papers", icon: NotebookPenIcon },
  { to: "/staff/new", label: "Add staff", hint: "New teacher or employee", icon: BriefcaseIcon },
  { to: "/payroll", label: "Run payroll", hint: "This month's payslips", icon: BanknoteIcon },
  { to: "/students", label: "Find a student", hint: "Profiles and fees", icon: GraduationCapIcon },
];

export function QuickActions() {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {ACTIONS.map(({ to, label, hint, icon: Icon }) => (
        <li key={to}>
          <Link
            to={to}
            className="flex h-full items-start gap-2.5 rounded-xl border border-line p-3 transition-colors hover:border-indigo/40 hover:bg-indigo/5 focus-visible:outline-2 focus-visible:outline-indigo"
          >
            <Icon className="mt-0.5 size-4 shrink-0 text-indigo" aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium leading-tight">{label}</span>
              <span className="block text-xs text-muted-foreground">{hint}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const monthLabel = (ym: string) => monthFormat.format(new Date(`${ym}-01T00:00:00Z`));

/** Fee collections per month. One series, so no legend; the current month is the solid bar. */
export function CollectionsChart({ data, format }: { data: { month: string; pkr: number }[]; format: (n: number) => string }) {
  const max = Math.max(...data.map((d) => d.pkr), 0);
  if (max === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Collections appear here once payments are recorded.</p>;
  }
  const width = 480;
  const height = 170;
  const pad = { t: 22, b: 24, x: 8 };
  const slot = (width - pad.x * 2) / data.length;
  const barW = Math.min(44, slot * 0.6);
  const plotH = height - pad.t - pad.b;
  const last = data.length - 1;
  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={`Collections by month: ${data.map((d) => `${monthLabel(d.month)} ${format(d.pkr)}`).join(", ")}`}>
        <line x1={pad.x} x2={width - pad.x} y1={height - pad.b} y2={height - pad.b} stroke="currentColor" className="text-line" />
        {data.map((d, i) => {
          const h = Math.max((d.pkr / max) * plotH, d.pkr ? 3 : 0);
          const x = pad.x + slot * i + (slot - barW) / 2;
          const y = height - pad.b - h;
          return (
            <g key={d.month}>
              <rect x={x} y={y} width={barW} height={h} rx={4} fill="#4642ff" opacity={i === last ? 1 : 0.35}>
                <title>{`${monthLabel(d.month)}: ${format(d.pkr)}`}</title>
              </rect>
              {i === last || d.pkr === max ? (
                <text x={x + barW / 2} y={y - 6} textAnchor="middle" className="fill-foreground text-[11px] tabular-nums">
                  {format(d.pkr)}
                </text>
              ) : null}
              <text x={x + barW / 2} y={height - 7} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {monthLabel(d.month)}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>Fee collections by month</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <th scope="row">{monthLabel(d.month)}</th>
              <td>{format(d.pkr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const ACTIVITY_ICON: Record<DashboardActivity["type"], LucideIcon> = {
  payment: WalletIcon,
  admission: UserPlusIcon,
  student: GraduationCapIcon,
  exam: NotebookPenIcon,
  staff: BriefcaseIcon,
};

const ACTIVITY_TINT: Record<DashboardActivity["type"], string> = {
  payment: "bg-success/10 text-success",
  admission: "bg-indigo/10 text-indigo",
  student: "bg-indigo/10 text-indigo",
  exam: "bg-orange/10 text-orange",
  staff: "bg-paper text-muted-foreground",
};

export function timeAgo(iso: string, now = Date.now()) {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export function ActivityFeed({ items }: { items: DashboardActivity[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="No activity yet"
        description="Payments, admissions, new students and submitted marks will show up here as they happen."
      />
    );
  }
  const now = Date.now();
  return (
    <ul className="divide-y divide-line">
      {items.map((item) => {
        const Icon = ACTIVITY_ICON[item.type];
        return (
          <li key={item.id}>
            <Link to={item.href} className="flex items-center gap-3 rounded-xl py-2.5 hover:bg-paper focus-visible:outline-2 focus-visible:outline-indigo">
              <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", ACTIVITY_TINT[item.type])} aria-hidden>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{item.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
              </span>
              <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground">
                {timeAgo(item.at, now)}
              </time>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Rows like "Needs review — 4" inside a panel. */
export function CountRow({ label, value, to, tone }: { label: string; value: number; to: string; tone?: "warning" }) {
  return (
    <li>
      <Link to={to} className="flex items-center justify-between gap-3 rounded-xl px-1 py-2 text-sm hover:bg-paper focus-visible:outline-2 focus-visible:outline-indigo">
        <span>{label}</span>
        <span className={cn("tabular-nums font-medium", tone === "warning" && value > 0 && "text-orange")}>{value}</span>
      </Link>
    </li>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6">
      <span className="sr-only">Loading dashboard</span>
      <div>
        <Skeleton className="h-9 w-56" />
        <Skeleton className="mt-3 h-4 w-72" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-3xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-3xl lg:col-span-2" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    </div>
  );
}
