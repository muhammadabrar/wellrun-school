import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ClassSelect, KIND_FROM_PATH, KIND_PATHS, KIND_PLURAL, PaperStatusBadge, formatDay } from "@/components/exams/exam-ui";
import { QuickAssessmentSheet } from "@/components/exams/quick-assessment-sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { examKeys, examsApi } from "@/lib/exams-api";

const HELP: Record<string, string> = {
  QUIZ: "Short class tests. Add one in seconds and enter marks straight away.",
  ASSIGNMENT: "Homework, projects and worksheets that are marked.",
  PRACTICAL: "Lab work and practical assessments.",
  VIVA: "Oral assessments.",
};

export function AssessmentsPage() {
  const { kind: kindPath = "quizzes" } = useParams();
  const navigate = useNavigate();
  const kind = KIND_FROM_PATH[kindPath];
  const [params, setParams] = useSearchParams();
  const classId = params.get("classId") ?? "";
  const [open, setOpen] = useState(false);
  const context = useQuery({ queryKey: examKeys.context(), queryFn: examsApi.context });
  const query = { kind, classId: classId || undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: examKeys.list(query),
    queryFn: () => examsApi.list(query),
    placeholderData: keepPreviousData,
    enabled: Boolean(kind),
  });
  if (!kind) return <Navigate to="/exams/assessments/quizzes" replace />;
  const label = KIND_PLURAL[kind];
  const singular = label.replace(/zes$/, "z").replace(/s$/, "");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Assessments"
        description={`${HELP[kind]} Their weight in term results is set in Settings → Result rules.`}
        actions={
          <Button icon={<Plus />} onClick={() => setOpen(true)}>
            Add {singular.toLowerCase()}
          </Button>
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Tabs value={kindPath} onValueChange={(next) => navigate(`/exams/assessments/${next}`)}>
          <TabsList>
            {Object.entries(KIND_PATHS).map(([k, path]) => (
              <TabsTrigger key={path} value={path}>
                {KIND_PLURAL[k as keyof typeof KIND_PLURAL]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <ClassSelect
          id="assess-class"
          value={classId}
          onChange={(v) => setParams(v ? { classId: v } : {}, { replace: true })}
          classes={context.data?.classes ?? []}
          allowAll="All classes"
        />
      </div>
      <FetchingIndicator show={isFetching && !isPending} label="Updating list" />
      {isPending ? (
        <LoadingState variant="table" />
      ) : isError ? (
        <ErrorState title={`Couldn't load ${label.toLowerCase()}`} description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState
          title={`No ${label.toLowerCase()} yet`}
          description={`Pick a class and subject, give it a title and max marks — you'll go straight to entering marks.`}
          action={
            <Button icon={<Plus />} onClick={() => setOpen(true)}>
              Add {singular.toLowerCase()}
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">Title</th>
                <th scope="col" className="px-3 py-3 font-medium">Class & subject</th>
                <th scope="col" className="px-3 py-3 font-medium">Date</th>
                <th scope="col" className="px-3 py-3 font-medium">Out of</th>
                <th scope="col" className="px-3 py-3 font-medium">Marks</th>
                <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Open</span></th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const paper = row.singlePaper;
                const status = (Object.entries(row.paperStatus).find(([, n]) => n > 0)?.[0] ?? "NOT_STARTED") as keyof typeof row.paperStatus;
                return (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-3 py-2.5">
                      <Link to={`/exams/${row.id}`} className="font-medium hover:underline">
                        {row.name}
                      </Link>
                      {row.term ? <span className="block text-xs text-muted-foreground">{row.term.name}</span> : null}
                    </td>
                    <td className="px-3 py-2.5">{paper ? `${paper.subject} · ${paper.className}` : `${row.paperCount} papers`}</td>
                    <td className="px-3 py-2.5 tabular-nums">{formatDay(row.startsOn)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{paper?.maxMarks ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <PaperStatusBadge status={status} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {paper ? (
                        <Button size="sm" variant="outline" render={<Link to={`/exams/marks/${paper.id}`} />}>
                          {status === "APPROVED" || status === "SUBMITTED" || !paper.canMark ? "View" : "Enter marks"}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <QuickAssessmentSheet open={open} onClose={() => setOpen(false)} kind={kind} />
    </div>
  );
}
