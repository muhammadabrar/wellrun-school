import { useQuery } from "@tanstack/react-query";
import { fmt } from "@wellrun/i18n";
import { FileText } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { BigButton, Card, Chip, Empty, ErrorBox, Loading, Screen } from "@/components/ui";
import { api, openPdf } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { keys, useChild } from "@/lib/queries";

export function ResultsPage() {
  const { id = "" } = useParams();
  const { m } = useLocale();
  const { child } = useChild(id);
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: keys.results(id), queryFn: () => api.results(id) });
  const [opening, setOpening] = useState<string | null>(null);
  const [openError, setOpenError] = useState(false);

  async function open(resultId: string) {
    setOpening(resultId);
    setOpenError(false);
    try {
      await openPdf(`/parent/children/${id}/results/${resultId}/report-card`);
    } catch {
      setOpenError(true);
    } finally {
      setOpening(null);
    }
  }

  return (
    <Screen title={child ? `${child.firstName} · ${m.results.title}` : m.results.title} back={`/child/${id}`}>
      {isPending ? (
        <Loading />
      ) : isError || !data ? (
        <ErrorBox error={error} onRetry={() => void refetch()} />
      ) : !data.length ? (
        <Empty title={m.results.none} />
      ) : (
        <>
          {openError ? (
            <p role="alert" className="text-center text-lg font-semibold text-danger">
              {m.fees.openFailed}
            </p>
          ) : null}
          <ul className="space-y-4">
            {data.map((result) => (
              <li key={result.id}>
                <Card>
                  <p className="text-xl font-semibold">{result.title}</p>
                  <p className="text-base text-muted">{result.yearName}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <span className="ltr-num text-5xl font-semibold">{Math.round(result.percentage)}%</span>
                    {result.grade ? <Chip tone="indigo">{fmt(m.results.grade, { grade: result.grade })}</Chip> : null}
                    <Chip tone={result.passed ? "green" : "red"}>{result.passed ? m.results.passed : m.results.failed}</Chip>
                  </div>
                  <p className="ltr-num mt-2 text-lg">{fmt(m.results.score, { obtained: Math.round(result.totalObtained * 10) / 10, max: result.totalMax })}</p>
                  {result.rank ? <p className="text-lg font-semibold">{fmt(m.results.position, { rank: result.rank })}</p> : null}

                  {result.subjects.length ? (
                    <details className="mt-4 rounded-2xl bg-paper p-3">
                      <summary className="min-h-11 cursor-pointer text-lg font-semibold">{m.results.subjects}</summary>
                      <ul className="mt-2 divide-y divide-line">
                        {result.subjects.map((subject) => (
                          <li key={subject.name} className="flex items-center justify-between gap-3 py-2 text-lg">
                            <span className="min-w-0 flex-1 truncate">{subject.name}</span>
                            <span className="ltr-num font-semibold">
                              {Math.round(subject.obtained * 10) / 10}/{subject.max}
                            </span>
                            {subject.grade ? <span className="w-10 text-center font-semibold text-indigo">{subject.grade}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                  {result.teacherRemark ? (
                    <p dir="auto" className="mt-3 text-lg">
                      <span className="font-semibold">{m.results.remarks}: </span>
                      {result.teacherRemark}
                    </p>
                  ) : null}
                  {result.principalRemark ? (
                    <p dir="auto" className="mt-2 text-lg">
                      <span className="font-semibold">{m.results.principalNote}: </span>
                      {result.principalRemark}
                    </p>
                  ) : null}
                  <div className="mt-4">
                    <BigButton tone="light" disabled={opening === result.id} onClick={() => void open(result.id)}>
                      <FileText className="size-5" aria-hidden /> {m.results.reportCard}
                    </BigButton>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  );
}
