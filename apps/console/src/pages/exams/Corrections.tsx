import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fmtNum, formatDay, isExamAdmin } from "@/components/exams/exam-ui";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { examKeys, examsApi, type Correction } from "@/lib/exams-api";

const TABS = [
  { id: "PENDING", label: "Waiting" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
];

const value = (marks: number | null, attendance: string) => (attendance === "PRESENT" ? fmtNum(marks) : attendance.toLowerCase());

export function CorrectionsPage() {
  const admin = isExamAdmin();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "PENDING";
  const { data, isPending, isError, refetch } = useQuery({ queryKey: examKeys.corrections(status), queryFn: () => examsApi.corrections(status) });
  const [rejecting, setRejecting] = useState<Correction | null>(null);
  const [note, setNote] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const review = useMutation({
    mutationFn: (input: { id: string; action: "APPROVE" | "REJECT"; note?: string }) => examsApi.reviewCorrection(input.id, { action: input.action, note: input.note }),
    onSuccess: async (_o, input) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      setRejecting(null);
      setNote("");
      setToast(input.action === "APPROVE" ? "Correction applied and results updated." : "Correction rejected.");
    },
    onError: (err) => setToast(err instanceof Error ? err.message : "Couldn't update"),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Corrections"
        description={admin ? "Changes requested to approved marks. Approving updates the mark and recalculates results." : "Corrections you've asked for on approved marks."}
      />
      <Tabs value={status} onValueChange={(next) => setParams({ status: String(next) }, { replace: true })}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {isPending ? (
        <LoadingState variant="list" />
      ) : isError ? (
        <ErrorState title="Couldn't load corrections" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data?.length ? (
        <EmptyState
          title={status === "PENDING" ? "No corrections waiting" : "Nothing here"}
          description="To correct an approved mark, open the paper from Approved marks and choose “Request correction” on the student."
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-surface p-4">
              <div className="min-w-0">
                <p className="font-medium">
                  <Link to={`/students/${c.student.id}?tab=results`} className="hover:underline">
                    {c.student.name}
                  </Link>{" "}
                  <span className="text-sm font-normal text-muted-foreground">{c.student.admissionNo}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  <Link to={`/exams/marks/${c.paper.id}`} className="hover:underline">
                    {c.paper.examName} · {c.paper.subject} · {c.paper.className}
                  </Link>
                </p>
                <p className="mt-1 text-sm">“{c.reason}”</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {c.requestedBy || "Teacher"} · {formatDay(c.createdAt)}
                  {c.reviewNote ? ` · Note: ${c.reviewNote}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="inline-flex items-center gap-2 font-display text-xl tabular-nums">
                  <span className="text-muted-foreground line-through">{value(c.oldMarks, c.oldAttendance)}</span>
                  <ArrowRight className="size-4 text-muted-foreground" aria-label="changes to" />
                  <span>{value(c.newMarks, c.newAttendance)}</span>
                  <span className="text-sm text-muted-foreground">/ {fmtNum(c.paper.maxMarks)}</span>
                </span>
                {admin && c.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRejecting(c)}>
                      Reject
                    </Button>
                    <Button size="sm" loading={review.isPending && review.variables?.id === c.id} onClick={() => review.mutate({ id: c.id, action: "APPROVE" })}>
                      Approve
                    </Button>
                  </div>
                ) : (
                  <Badge tone={c.status === "APPROVED" ? "success" : c.status === "REJECTED" ? "danger" : "warning"}>{c.status.toLowerCase()}</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={Boolean(rejecting)}
        title="Reject this correction?"
        description="The approved mark stays as it is."
        confirmLabel="Reject"
        danger
        loading={review.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={() => rejecting && review.mutate({ id: rejecting.id, action: "REJECT", note })}
      >
        <Field>
          <FieldLabel htmlFor="reject-note">Note for the teacher (optional)</FieldLabel>
          <Input id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Dialog>
      <Toast message={toast} />
    </div>
  );
}
