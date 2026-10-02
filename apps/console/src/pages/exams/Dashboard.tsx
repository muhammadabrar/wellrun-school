import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { CalendarPlus, ClipboardPen, FilePlus2, ListChecks } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ExamStatusBadge, KindBadge, MarkingProgress, Stat, dateRange, formatDayShort, isExamAdmin } from "@/components/exams/exam-ui";
import { QuickAssessmentSheet } from "@/components/exams/quick-assessment-sheet";
import { Button } from "@/components/ui/button";
import { examKeys, examsApi } from "@/lib/exams-api";

export function ExamsDashboardPage() {
  const admin = isExamAdmin();
  const [quickOpen, setQuickOpen] = useState(false);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: examKeys.dashboard(), queryFn: examsApi.dashboard });

  if (isPending) return <LoadingState variant="metrics" />;
  if (isError || !data) return <ErrorState title="Couldn't load exams" description="Check your connection and try again." onRetry={() => void refetch()} />;

  const totalPapers = data.papers.notStarted + data.papers.draft + data.papers.submitted + data.papers.returned + data.papers.approved;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Exams"
        description="Plan exams, collect marks, verify them and publish results — all for the selected academic year."
        actions={
          <>
            <Button variant="outline" icon={<ListChecks />} onClick={() => setQuickOpen(true)}>
              Quick quiz or assignment
            </Button>
            {admin ? (
              <Button icon={<FilePlus2 />} render={<Link to="/exams/new" />}>
                New exam
              </Button>
            ) : (
              <Button icon={<ClipboardPen />} render={<Link to="/exams/marks" />}>
                Enter marks
              </Button>
            )}
          </>
        }
      />

      {!data.examCount ? (
        <EmptyState
          title="No exams this year yet"
          description={
            admin
              ? "Create a school-wide exam in four steps — pick classes, subjects fill in automatically and the date sheet is generated for you. Or add a quick quiz for one class."
              : "When your school schedules exams, or you add a quiz, they'll appear here with the papers you need to mark."
          }
          action={
            admin ? (
              <Button icon={<FilePlus2 />} render={<Link to="/exams/new" />}>
                Create the first exam
              </Button>
            ) : (
              <Button icon={<ListChecks />} onClick={() => setQuickOpen(true)}>
                Add a quiz
              </Button>
            )
          }
        />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {data.myPapers ? (
              <Stat label="Papers for you to mark" value={data.myPapers.toMark} hint={data.myPapers.toMark ? <Link to="/exams/marks" className="text-indigo">Open marks entry</Link> : "All caught up"} />
            ) : (
              <Stat
                label="Awaiting verification"
                value={data.papers.submitted}
                hint={data.papers.submitted ? <Link to="/exams/marks/pending" className="text-indigo">Review now</Link> : "Nothing waiting"}
              />
            )}
            <Stat label="Not started / draft" value={data.papers.notStarted + data.papers.draft} hint={`${data.papers.returned} returned to teachers`} tone={data.papers.returned ? "warning" : undefined} />
            <Stat label="Approved papers" value={`${data.papers.approved}/${totalPapers}`} />
            {admin ? (
              <Stat
                label="Correction requests"
                value={data.pendingCorrections}
                hint={data.pendingCorrections ? <Link to="/exams/marks/corrections" className="text-indigo">Review requests</Link> : "None pending"}
                tone={data.pendingCorrections ? "warning" : undefined}
              />
            ) : (
              <Stat label="Upcoming papers (3 weeks)" value={data.upcoming.length} />
            )}
          </dl>

          {admin && data.pendingQuestionPapers ? (
            <p className="rounded-2xl bg-orange/10 p-3 text-sm text-orange" role="status">
              {data.pendingQuestionPapers} question {data.pendingQuestionPapers === 1 ? "paper is" : "papers are"} waiting for your approval.{" "}
              <Link to="/exams/question-papers?status=SUBMITTED" className="underline">
                Review {data.pendingQuestionPapers === 1 ? "it" : "them"}
              </Link>
            </p>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <section className="rounded-3xl bg-surface p-5" aria-labelledby="active-exams">
              <div className="flex items-center justify-between gap-3">
                <h2 id="active-exams" className="font-display text-xl">
                  Exams in progress
                </h2>
                <Link to="/exams/list" className="text-sm text-indigo">
                  All exams
                </Link>
              </div>
              {data.activeExams.length ? (
                <ul className="mt-3 divide-y divide-line">
                  {data.activeExams.map((exam) => (
                    <li key={exam.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <Link to={`/exams/${exam.id}`} className="font-medium hover:underline">
                          {exam.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{dateRange(exam.startsOn, exam.endsOn)}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <MarkingProgress approved={exam.approved} submitted={exam.submitted} total={exam.total} label={`${exam.name} papers approved`} />
                        <ExamStatusBadge status={exam.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">No exams are being marked right now.</p>
              )}
            </section>

            <section className="rounded-3xl bg-surface p-5" aria-labelledby="upcoming">
              <div className="flex items-center justify-between gap-3">
                <h2 id="upcoming" className="font-display text-xl">
                  Coming up
                </h2>
                <Link to="/exams/calendar" className="text-sm text-indigo">
                  Calendar
                </Link>
              </div>
              {data.upcoming.length ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {data.upcoming.map((paper) => (
                    <li key={paper.id} className="flex items-start justify-between gap-3 rounded-2xl bg-paper px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {paper.subject} · {paper.className}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{paper.exam.name}</p>
                      </div>
                      <span className="shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {formatDayShort(paper.date)}
                        {paper.startTime ? <span className="block">{paper.startTime}</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="mt-3 flex flex-col items-start gap-3 text-sm text-muted-foreground">
                  <p>Nothing scheduled in the next three weeks.</p>
                  {admin ? (
                    <Button variant="outline" size="sm" icon={<CalendarPlus />} render={<Link to="/exams/new" />}>
                      Schedule an exam
                    </Button>
                  ) : null}
                </div>
              )}
            </section>
          </div>

          {data.published.length ? (
            <section className="rounded-3xl bg-surface p-5" aria-labelledby="published">
              <h2 id="published" className="font-display text-xl">
                Recently published
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {data.published.map((exam) => (
                  <li key={exam.id}>
                    <Link to={`/exams/results/class?scope=EXAM:${exam.id}`} className="inline-flex items-center gap-2 rounded-2xl bg-paper px-3 py-2 text-sm hover:bg-muted">
                      <KindBadge kind={exam.kind} /> {exam.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
      <QuickAssessmentSheet open={quickOpen} onClose={() => setQuickOpen(false)} />
    </div>
  );
}
