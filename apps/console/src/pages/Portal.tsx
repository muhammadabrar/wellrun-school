import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState } from "@wellrun/ui";
import { CheckCircle2, ClipboardCheck } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatClock } from "@/components/form/time-picker";
import { CONTRACT_TYPES, PayslipStatusBadge, SalaryLine, StaffStatusBadge, StaffWeekGrid, formatDay, periodName } from "@/components/staff/staff-ui";
import { WEEKDAYS } from "@/components/timetable/lesson-sheet";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function PortalPage() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.portal, queryFn: api.portal });

  if (isPending) return <LoadingState variant="page" />;
  if (isError || !data) {
    return <ErrorState title="Couldn't load your portal" description="Check your connection and try again." onRetry={() => void refetch()} />;
  }
  if (!data.staff) {
    return (
      <EmptyState
        title="Your login isn't linked to a staff record"
        description="Ask your school admin to open your profile under Staff and add your login there. Your timetable and payslips will then appear here."
      />
    );
  }

  const { staff, today, timetable, firstPeriod, payslips } = data;
  const todayName = WEEKDAYS.find((day) => day.id === today.weekday)?.label;
  const periodById = new Map(timetable.periods.map((period) => [period.id, period]));
  const todays = timetable.lessons
    .filter((lesson) => lesson.weekday === today.weekday)
    .sort((a, b) => (periodById.get(a.periodId)?.sortOrder ?? 0) - (periodById.get(b.periodId)?.sortOrder ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{todayName ? `${todayName}, ${formatDay(today.date)}` : formatDay(today.date)}</p>
          <h1 className="mt-1 font-display text-4xl">Hello, {staff.name.split(" ")[0]}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {[staff.title, staff.department, staff.campus?.name].filter(Boolean).join(" · ")}
          </p>
        </div>
        <StaffStatusBadge status={staff.status} />
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="First-period attendance" icon={<ClipboardCheck className="size-5 text-primary" aria-hidden />}>
          {!firstPeriod ? (
            <p className="text-sm text-muted-foreground">Your school hasn't set up its periods yet.</p>
          ) : !firstPeriod.classes.length ? (
            <p className="text-sm text-muted-foreground">
              You don't teach {firstPeriod.period.label} ({formatClock(firstPeriod.period.startTime)}) today, so there's no register for you to take.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {firstPeriod.classes.map((cls) => (
                <li key={cls.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line p-4">
                  <div>
                    <p className="font-medium">
                      {cls.name} {cls.section}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {firstPeriod.period.label} · {formatClock(firstPeriod.period.startTime)}–{formatClock(firstPeriod.period.endTime)}
                    </p>
                  </div>
                  {cls.marked ? (
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-sm text-success">
                        <CheckCircle2 className="size-4" aria-hidden /> Taken
                      </span>
                      <Button variant="outline" size="sm" render={<Link to={`/attendance?classId=${cls.id}&date=${today.date}`} />}>
                        Review
                      </Button>
                    </div>
                  ) : (
                    <Button render={<Link to={`/attendance?classId=${cls.id}&date=${today.date}`} />}>Take attendance</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Today's classes">
          {todays.length ? (
            <ol className="divide-y divide-line text-sm">
              {todays.map((lesson) => {
                const period = periodById.get(lesson.periodId);
                return (
                  <li key={lesson.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="w-28 shrink-0 text-muted-foreground tabular-nums">{period ? formatClock(period.startTime) : ""}</span>
                    <span className="flex-1 font-medium">
                      {lesson.class.name} {lesson.class.section}
                    </span>
                    <span className="text-muted-foreground">{lesson.subject}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No classes on your timetable today.</p>
          )}
        </Panel>
      </div>

      <Panel title="My weekly timetable">
        <StaffWeekGrid week={timetable} today={today.weekday} emptyText="You have no periods on the timetable yet. Your school admin places you from the Timetable page." />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Panel title="Payslips">
          {payslips.length ? (
            <ul className="divide-y divide-line text-sm">
              {payslips.map((row) => (
                <li key={row.id}>
                  <Link to={`/me/payslips/${row.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:underline">
                    <span>
                      <span className="font-medium">{periodName(row.period)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {row.status === "PAID" ? `Paid ${formatDay(row.paidOn)}` : "Awaiting payment"}
                        {row.deductionPkr ? ` · ${pkr(row.deductionPkr)} deducted` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="font-display text-lg tabular-nums">{pkr(row.netPkr)}</span>
                      <PayslipStatusBadge status={row.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No payslips yet. They appear here once the school finalizes the month's payroll.</p>
          )}
        </Panel>

        <Panel title="My details">
          <dl className="grid gap-3 text-sm">
            <Row label="Employee No" value={staff.employeeNo} />
            <Row label="CNIC" value={staff.cnic || "—"} />
            <Row label="Joined" value={formatDay(staff.joinDate)} />
            <Row label="Phone" value={staff.phone || "—"} />
            <Row label="Email" value={staff.email || "—"} />
            {staff.contract ? (
              <>
                <Row label="Contract" value={`${CONTRACT_TYPES[staff.contract.type]}${staff.contract.endDate ? ` until ${formatDay(staff.contract.endDate)}` : ""}`} />
                <Row label="Monthly salary" value={<SalaryLine basic={staff.contract.basicSalaryPkr} allowances={staff.contract.allowances} />} />
              </>
            ) : null}
          </dl>
          <p className="mt-4 text-xs text-muted-foreground">Something wrong? Ask your school admin to update it.</p>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-6">
      <h2 className="mb-4 flex items-center gap-2 font-display text-xl">
        {icon}
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  );
}
