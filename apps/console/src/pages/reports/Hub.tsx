import { REPORTS, REPORT_GROUP_LABEL, type ReportGroup } from "@wellrun/shared";
import { PageHeader } from "@wellrun/ui";
import { ArrowRight, Gauge, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const GROUPS = Object.keys(REPORT_GROUP_LABEL) as ReportGroup[];

export function ReportsHubPage() {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();
  const shown = useMemo(() => REPORTS.filter((r) => !q || `${r.title} ${r.description}`.toLowerCase().includes(q)), [q]);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="Answers to the questions you ask about your school. Open one, choose the dates, then print it or download it for Excel." />

      <Link to="/reports/ratios" className="group flex flex-wrap items-center gap-4 rounded-3xl bg-indigo p-6 text-white transition hover:bg-indigo-deep">
        <span className="grid size-14 place-items-center rounded-2xl bg-white/15">
          <Gauge className="size-7" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-2xl">Ratio analysis</span>
          <span className="block text-sm text-white/85">Students per teacher, fee collection, attendance, pass rate and more, each with the working shown and a clear good, watch or bad.</span>
        </span>
        <ArrowRight className="size-6 transition group-hover:translate-x-1" aria-hidden />
      </Link>

      <div className="max-w-sm">
        <Label htmlFor="report-search">Find a report</Label>
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input id="report-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try fees, attendance, payroll" className="pl-9" />
        </div>
      </div>

      {shown.length ? (
        GROUPS.map((group) => {
          const items = shown.filter((r) => r.group === group);
          if (!items.length) return null;
          return (
            <section key={group} aria-labelledby={`g-${group}`}>
              <h2 id={`g-${group}`} className="mb-3 font-display text-xl">
                {REPORT_GROUP_LABEL[group]}
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((report) => (
                  <li key={report.id}>
                    <Link to={`/reports/${report.id}`} className="flex h-full flex-col justify-between gap-3 rounded-3xl bg-surface p-5 transition hover:ring-2 hover:ring-indigo/30">
                      <span>
                        <span className="block font-medium">{report.title}</span>
                        <span className="mt-1 block text-sm text-muted-foreground">{report.description}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm font-medium text-indigo">
                        Open <ArrowRight className="size-3.5" aria-hidden />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      ) : (
        <p className="rounded-3xl bg-surface p-6 text-sm text-muted-foreground">No report matches "{search}". Try a shorter word, such as "fee" or "class".</p>
      )}
    </div>
  );
}
