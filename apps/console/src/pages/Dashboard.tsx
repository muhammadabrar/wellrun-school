import { useQuery } from "@tanstack/react-query";
import { Badge, ErrorState, FetchingIndicator, PageHeader } from "@wellrun/ui";
import { Link, Navigate } from "react-router-dom";
import { ActivityFeed, AttentionList, CollectionsChart, CountRow, DashboardSkeleton, KpiCard, Panel, QuickActions } from "@/components/dashboard/dashboard-ui";
import { TrendLine, formatDay, formatDayShort } from "@/components/exams/exam-ui";
import { FeeSetupChecklist } from "@/components/fees/fee-setup-checklist";
import { api, currentUser } from "@/lib/api";
import { pkr, pkrCompact } from "@/lib/format";
import { queryKeys } from "@/lib/query";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const monthName = (period: string) =>
  new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

function change(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export function DashboardPage() {
  const user = currentUser();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: api.dashboard,
    enabled: user?.role === "SCHOOL_ADMIN",
  });

  if (user?.role === "PLATFORM_ADMIN") return <Navigate to="/admin" replace />;
  // Staff start their day in their own portal: first-period register, today's classes, payslips.
  if (user?.role === "TEACHER") return <Navigate to="/me" replace />;

  if (isPending && !data) return <DashboardSkeleton />;
  if (isError || !data) {
    return (
      <ErrorState
        title="Unable to load the dashboard"
        description="We couldn't retrieve your school's figures. Check your connection and try again."
        onRetry={() => void refetch()}
      />
    );
  }

  const { attendance, fees, admissions, exams, payroll, students, staff } = data;
  const firstName = user?.name?.split(" ")[0];
  const monthDelta = change(fees.monthPkr, fees.previousMonthPkr);
  const closed = !data.working;
  const attendanceHint = closed
    ? data.holiday ?? "School is closed today"
    : attendance.marked
      ? `${attendance.present + attendance.late} present · ${attendance.absent} absent`
      : "Not marked yet";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`${greeting(new Date().getHours())}${firstName ? `, ${firstName}` : ""}. Here's how ${data.schoolName} is doing on ${longDate(data.date)}.`}
        actions={
          <>
            {closed ? <Badge tone="warning">{data.holiday ? `Holiday: ${data.holiday}` : "School closed today"}</Badge> : <Badge tone="success">School day</Badge>}
            <FetchingIndicator show={isFetching && !isPending} label="Updating" />
          </>
        }
      />

      <FeeSetupChecklist />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          label="Students"
          value={students.total.toLocaleString("en-PK")}
          hint={students.newThisMonth ? `+${students.newThisMonth} this month` : "Enrolled this year"}
          tone={students.newThisMonth ? "success" : undefined}
          to="/students"
        />
        <KpiCard
          label="Attendance today"
          value={attendance.pct == null ? "—" : `${attendance.pct}%`}
          hint={attendanceHint}
          tone={attendance.pct != null && attendance.pct < attendance.thresholdPct ? "warning" : undefined}
          to="/attendance"
        />
        <KpiCard
          label="Collected this month"
          value={pkrCompact(fees.monthPkr)}
          title={pkr(fees.monthPkr)}
          hint={monthDelta == null ? `${pkrCompact(fees.todayPkr)} today` : `${monthDelta >= 0 ? "+" : ""}${monthDelta}% vs last month`}
          tone={monthDelta != null && monthDelta > 0 ? "success" : undefined}
          to="/fees/payments"
        />
        <KpiCard
          label="Outstanding fees"
          value={pkrCompact(fees.outstandingPkr)}
          title={pkr(fees.outstandingPkr)}
          hint={fees.overduePkr ? `${pkrCompact(fees.overduePkr)} overdue` : `${fees.unpaidInvoices} unpaid invoices`}
          tone={fees.overduePkr ? "critical" : undefined}
          to="/fees/invoices"
        />
        <KpiCard
          label="Staff"
          value={staff.active}
          hint={staff.onLeave ? `${staff.onLeave} on leave` : "All active"}
          to="/staff"
        />
        <KpiCard
          label="Open admissions"
          value={admissions.open}
          hint={admissions.needsReview ? `${admissions.needsReview} to review` : "Nothing waiting"}
          tone={admissions.needsReview ? "warning" : undefined}
          to="/admissions"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Needs your attention"
          description="Things that are late, waiting on you, or about to be."
          className="lg:col-span-2"
          action={data.attention.length ? <Badge tone="warning">{data.attention.length}</Badge> : null}
        >
          <AttentionList items={data.attention} />
        </Panel>
        <Panel title="Quick actions" description="Jump straight to the common jobs.">
          <QuickActions />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Attendance"
          description="Daily % over the last two weeks of school days."
          action={
            <Link to="/attendance" className="text-sm text-indigo hover:underline">
              Open attendance
            </Link>
          }
        >
          <TrendLine
            points={attendance.trend.map((p) => ({ label: formatDay(p.date), value: p.pct }))}
            emptyText="The trend appears once two school days have been marked."
            labelEvery={Math.max(1, Math.ceil(attendance.trend.length / 5))}
          />
          <div className="mt-4 border-t border-line pt-4">
            {closed ? (
              <p className="text-sm text-muted-foreground">No registers are due today.</p>
            ) : attendance.classes === 0 ? (
              <p className="text-sm text-muted-foreground">
                No classes have students yet. <Link to="/students" className="text-indigo hover:underline">Add students</Link> to start marking attendance.
              </p>
            ) : attendance.unmarkedClasses.length === 0 ? (
              <p className="text-sm text-success">All {attendance.classes} class registers are marked.</p>
            ) : (
              <>
                <p className="mb-2 text-sm font-medium">
                  {attendance.classes - attendance.classesMarked} of {attendance.classes} registers still open
                </p>
                <ul className="flex flex-wrap gap-2">
                  {attendance.unmarkedClasses.map((c) => (
                    <li key={c.id}>
                      <Link
                        to={`/attendance/mark?classId=${c.id}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs hover:border-indigo/40 hover:bg-indigo/5 focus-visible:outline-2 focus-visible:outline-indigo"
                      >
                        {c.label}
                        <span className="text-muted-foreground">{c.students}</span>
                      </Link>
                    </li>
                  ))}
                  {attendance.classes - attendance.classesMarked > attendance.unmarkedClasses.length ? (
                    <li className="px-1 py-1 text-xs text-muted-foreground">
                      +{attendance.classes - attendance.classesMarked - attendance.unmarkedClasses.length} more
                    </li>
                  ) : null}
                </ul>
              </>
            )}
          </div>
        </Panel>

        <Panel
          title="Fee collections"
          description="Payments received per month."
          action={
            <Link to="/fees" className="text-sm text-indigo hover:underline">
              Open fees
            </Link>
          }
        >
          <CollectionsChart data={fees.monthly} format={pkrCompact} />
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Today</dt>
              <dd className="font-medium tabular-nums">{pkr(fees.todayPkr)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Unpaid invoices</dt>
              <dd className="font-medium tabular-nums">{fees.unpaidInvoices}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Overdue</dt>
              <dd className={fees.overduePkr ? "font-medium tabular-nums text-danger" : "font-medium tabular-nums"}>{pkr(fees.overduePkr)}</dd>
            </div>
          </dl>
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Recent activity" description="Latest payments, admissions and marks across the school." className="lg:col-span-2">
          <ActivityFeed items={data.activity} />
        </Panel>

        <div className="space-y-6">
          <Panel title="Admissions" action={<Link to="/admissions" className="text-sm text-indigo hover:underline">View all</Link>}>
            <ul>
              <CountRow label="Waiting for review" value={admissions.needsReview} to="/admissions" tone="warning" />
              <CountRow label="Assessment or interview" value={admissions.awaitingAssessment} to="/admissions" />
              <CountRow label="Accepted, awaiting fee or documents" value={admissions.awaitingConfirmation} to="/admissions" />
              <CountRow label="Confirmed this month" value={admissions.confirmedThisMonth} to="/students" />
            </ul>
          </Panel>

          <Panel title="Exams" action={<Link to="/exams" className="text-sm text-indigo hover:underline">Open exams</Link>}>
            <ul>
              <CountRow label="Papers to verify" value={exams.papersToVerify} to="/exams/marks/pending" tone="warning" />
              <CountRow label="Corrections pending" value={exams.pendingCorrections} to="/exams/marks/corrections" tone="warning" />
              <CountRow label="Exams in progress" value={exams.activeExams} to="/exams/list" />
            </ul>
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Next 7 days</p>
              {exams.upcoming.length ? (
                <ul className="space-y-2">
                  {exams.upcoming.map((p) => (
                    <li key={p.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {p.subject} <span className="text-muted-foreground">· {p.className}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDayShort(p.date)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No papers scheduled this week.</p>
              )}
            </div>
          </Panel>

          <Panel title={`Payroll · ${monthName(payroll.period)}`} action={<Link to="/payroll" className="text-sm text-indigo hover:underline">Open payroll</Link>}>
            {payroll.activeStaff === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add staff and their contracts to run payroll. <Link to="/staff/new" className="text-indigo hover:underline">Add staff</Link>
              </p>
            ) : (
              <>
                <div
                  className="flex h-2 overflow-hidden rounded-full bg-line"
                  role="progressbar"
                  aria-label="Payslips paid"
                  aria-valuemin={0}
                  aria-valuemax={payroll.activeStaff}
                  aria-valuenow={Math.min(payroll.paid, payroll.activeStaff)}
                >
                  <div className="h-full bg-success" style={{ width: `${Math.min(100, (payroll.paid / payroll.activeStaff) * 100)}%` }} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground tabular-nums">
                  {payroll.paid} of {payroll.activeStaff} paid · {payroll.generated} generated{payroll.drafts ? ` · ${payroll.drafts} in draft` : ""}
                </p>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
