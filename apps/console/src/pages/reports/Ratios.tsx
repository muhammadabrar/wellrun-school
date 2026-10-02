import { useQuery } from "@tanstack/react-query";
import { RATIO_DEFS, type RatioStatus, type RatioView } from "@wellrun/shared";
import { Badge, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowLeft } from "lucide-react";
import { keepPreviousData } from "@tanstack/react-query";
import { useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { TrendLine } from "@/components/exams/exam-ui";
import { DatePicker } from "@/components/form/date-picker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { todayIso } from "@/lib/format";
import { reportKeys, reportsApi } from "@/lib/reports-api";

const STATUS: Record<RatioStatus, { label: string; tone: "success" | "warning" | "danger" | "neutral"; bar: string }> = {
  good: { label: "Good", tone: "success", bar: "bg-success" },
  watch: { label: "Watch", tone: "warning", bar: "bg-orange" },
  bad: { label: "Needs attention", tone: "danger", bar: "bg-danger" },
  na: { label: "No target", tone: "neutral", bar: "bg-line" },
};

const GROUP_ORDER = ["Staffing", "Fees", "Learning", "Students"] as const;
const num = (value: number | null) => (value == null ? "—" : value.toLocaleString("en-PK"));

function monthStart(iso: string, back = 0) {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 - back, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

function monthEnd(iso: string) {
  const [y, m] = iso.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m, 0));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

export function RatiosPage() {
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const from = params.get("from") ?? monthStart(today);
  const to = params.get("to") ?? today;

  const setRange = useCallback(
    (nextFrom: string | null, nextTo: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (nextFrom) next.set("from", nextFrom);
          if (nextTo) next.set("to", nextTo);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: reportKeys.ratios({ from, to }), queryFn: () => reportsApi.ratios({ from, to }), placeholderData: keepPreviousData });

  const lastMonth = monthStart(today, 1);
  const presets = [
    { label: "This month", from: monthStart(today), to: today },
    { label: "Last month", from: lastMonth, to: monthEnd(lastMonth) },
    { label: "Last 3 months", from: monthStart(today, 2), to: today },
    { label: "This year", from: `${today.slice(0, 4)}-01-01`, to: today },
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to="/reports" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> All reports
        </Link>
        <PageHeader
          title="Ratio analysis"
          description="The numbers that tell you how the school is doing. Each one shows how it was worked out and whether it is where you want it."
          actions={
            <Button variant="outline" size="sm" onClick={() => window.print()} className="print:hidden">
              Print / PDF
            </Button>
          }
        />
      </div>

      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div className="w-48">
          <Label htmlFor="ratio-from">From</Label>
          <DatePicker id="ratio-from" value={from} onChange={(value) => setRange(value, null)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
        </div>
        <div className="w-48">
          <Label htmlFor="ratio-to">To</Label>
          <DatePicker id="ratio-to" value={to} onChange={(value) => setRange(null, value)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
        </div>
        <div className="flex flex-wrap gap-2">
          {presets.map((p) => (
            <Button key={p.label} variant={from === p.from && to === p.to ? "default" : "outline"} size="sm" onClick={() => setRange(p.from, p.to)}>
              {p.label}
            </Button>
          ))}
        </div>
        <FetchingIndicator show={isFetching && !isPending} />
      </div>

      {isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't work out the ratios" description="Check your connection and try again. If the dates are backwards, swap them." onRetry={() => void refetch()} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data.yearName} · fees and attendance for {from} to {to}. Staffing, students and overdue fees are as of today.
          </p>
          {GROUP_ORDER.map((group) => {
            const items = data.ratios.filter((r) => r.group === group);
            if (!items.length) return null;
            return (
              <section key={group} aria-labelledby={`ratio-${group}`}>
                <h2 id={`ratio-${group}`} className="mb-3 font-display text-xl">
                  {group}
                </h2>
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {items.map((ratio) => (
                    <RatioCard key={ratio.key} ratio={ratio} />
                  ))}
                </div>
              </section>
            );
          })}
          <p className="text-xs text-muted-foreground print:hidden">Targets are general guides ({RATIO_DEFS.filter((d) => d.threshold).length} of {RATIO_DEFS.length} ratios have one). Your own standard may differ.</p>
        </>
      )}
    </div>
  );
}

function RatioCard({ ratio }: { ratio: RatioView }) {
  const status = STATUS[ratio.status];
  const hasTrend = ratio.trend.filter((p) => p.value != null).length >= 2;
  return (
    <article className="flex flex-col gap-3 rounded-3xl bg-surface p-5 break-inside-avoid">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-medium">{ratio.label}</h3>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <p className="font-display text-4xl tabular-nums">{ratio.display}</p>
      <div className={`h-1.5 w-12 rounded-full ${status.bar}`} aria-hidden />
      <p className="text-sm">{ratio.question}</p>
      <p className="rounded-2xl bg-paper px-3 py-2 text-xs text-muted-foreground">
        {ratio.numerator.label}: <strong className="text-foreground">{num(ratio.numerator.value)}</strong> ÷ {ratio.denominator.label}: <strong className="text-foreground">{num(ratio.denominator.value)}</strong>
      </p>
      <p className="text-xs text-muted-foreground">{ratio.targetText}</p>
      {hasTrend ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Last six months</p>
          <TrendLine points={ratio.trend} height={110} />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">{ratio.note}</p>
    </article>
  );
}
