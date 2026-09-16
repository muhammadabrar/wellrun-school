import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Dialog, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { admissionStatusLabel, admissionStatusTone } from "../components/admissions/status";
import { api } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";

export function AdmissionReviewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.admissionApplication(id ?? ""),
    queryFn: () => api.admissionApplication(id!),
    enabled: Boolean(id),
  });
  const [pending, setPending] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"reject" | "withdraw" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function run(action: string, payload: Record<string, unknown> = {}) {
    if (!id) return;
    setPending(action);
    setError(null);
    try {
      const next = await api.admissionAction(id, action, payload);
      queryClient.setQueryData(queryKeys.admissionApplication(id), next);
      await queryClient.invalidateQueries({ queryKey: queryKeys.admissionsSummary });
      if (action === "confirm" && next.student) navigate(`/students/${next.student.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update application");
    } finally {
      setPending(null);
      setDialog(null);
    }
  }

  if (!data) {
    if (isError) {
      return <ErrorState title="Could not load application" description="Return to the admissions list and try again." onRetry={() => void refetch()} />;
    }
    return <LoadingState variant="form" />;
  }

  const canDecide = ["SUBMITTED", "UNDER_REVIEW", "WAITLISTED", "ASSESSMENT_PENDING", "INTERVIEW_PENDING"].includes(data.status);
  const canConfirm = ["ACCEPTED", "FEE_PENDING", "DOCUMENTS_PENDING"].includes(data.status);

  return (
    <div className="max-w-4xl">
      <Link to="/admissions" className="text-sm text-indigo">
        All applications
      </Link>
      <PageHeader
        title={`${data.firstName} ${data.lastName}`.trim() || "Application"}
        description={`${data.applicationNo} · ${data.nextAction}`}
        actions={<Badge tone={admissionStatusTone(data.status)}>{admissionStatusLabel(data.status)}</Badge>}
      />
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {data.blockers.length ? (
        <ul className="mt-4 rounded-2xl bg-orange/10 p-4 text-sm">
          {data.blockers.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}

      <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-3xl bg-surface p-5">
          <h2 className="font-display text-xl">Applicant</h2>
          <p className="mt-3 text-sm text-muted-foreground">Grade {data.className || "—"} • {data.section}</p>
          <p className="text-sm text-muted-foreground">{data.campus?.name}</p>
          <p className="mt-2 text-sm">{data.guardian?.name || data.family.guardianName || "No guardian"}</p>
        </div>
        <div className="rounded-3xl bg-surface p-5">
          <h2 className="font-display text-xl">Assessment</h2>
          <p className="mt-3 text-sm">{data.assessmentPct != null ? `${data.assessmentPct}%` : "No scores yet"}</p>
          <p className="text-sm text-muted-foreground">{data.interviewNotes || "No interview notes"}</p>
        </div>
      </section>

      <section className="mt-4 rounded-3xl bg-surface p-5">
        <h2 className="font-display text-xl">Documents</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {data.documents.map((doc) => (
            <li key={doc.id} className="flex justify-between gap-3">
              <span>{doc.label}</span>
              <span className="text-muted-foreground">{doc.url ? "Uploaded" : doc.required ? "Missing" : "Optional"}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-4 rounded-3xl bg-surface p-5">
        <h2 className="font-display text-xl">Admission fee</h2>
        {!data.invoices.length ? (
          <p className="mt-2 text-sm text-muted-foreground">Fees are created when the application is accepted.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {data.invoices.map((invoice) => (
              <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {invoice.name} · {pkr(invoice.amountPkr - invoice.paidPkr)} due
                </span>
                {invoice.paidPkr < invoice.amountPkr ? (
                  <Button
                    type="button"
                    size="sm"
                    loading={pending === "pay"}
                    onClick={async () => {
                      setPending("pay");
                      try {
                        await api.pay({ invoiceId: invoice.id, amountPkr: invoice.amountPkr - invoice.paidPkr, method: "cash" });
                        await api.admissionAction(data.id, "refresh");
                        await refetch();
                      } finally {
                        setPending(null);
                      }
                    }}
                  >
                    Record payment
                  </Button>
                ) : invoice.receiptId ? (
                  <Link to={`/fees/receipt/${invoice.receiptId}`} className="text-sm text-indigo">
                    Receipt
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">Paid</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        {data.status === "DRAFT" ? (
          <Link to={`/admissions/new?id=${data.id}`} className="inline-flex h-11 items-center rounded-xl bg-indigo px-4 font-medium text-white">
            Continue application
          </Link>
        ) : null}
        {data.status === "SUBMITTED" ? (
          <Button type="button" loading={pending === "review"} onClick={() => void run("review")}>
            Start review
          </Button>
        ) : null}
        {canDecide ? (
          <>
            <Button type="button" loading={pending === "accept"} onClick={() => void run("accept")}>
              Accept
            </Button>
            <Button type="button" variant="outline" loading={pending === "waitlist"} onClick={() => void run("waitlist")}>
              Waitlist
            </Button>
            <Button type="button" variant="destructive" onClick={() => setDialog("reject")}>
              Reject
            </Button>
          </>
        ) : null}
        {canConfirm ? (
          <Button type="button" loading={pending === "confirm"} onClick={() => void run("confirm", { classId: data.targetClassId })}>
            Confirm admission
          </Button>
        ) : null}
        {data.student ? (
          <Link to={`/students/${data.student.id}`} className="inline-flex h-11 items-center rounded-xl bg-paper px-4 font-medium">
            Open {data.student.admissionNo}
          </Link>
        ) : null}
        {data.status !== "WITHDRAWN" && data.status !== "ADMISSION_CONFIRMED" ? (
          <Button type="button" variant="outline" onClick={() => setDialog("withdraw")}>
            Withdraw
          </Button>
        ) : null}
      </div>

      <Dialog
        open={dialog === "reject"}
        title="Reject this application?"
        description="The family will stay on the rejected list. You can add a short reason."
        confirmLabel="Reject"
        danger
        loading={pending === "reject"}
        onClose={() => setDialog(null)}
        onConfirm={() => void run("reject", { note })}
      >
        <Field>
          <FieldLabel htmlFor="reject-reason">Reason</FieldLabel>
          <Textarea id="reject-reason" value={note} onChange={(event) => setNote(event.target.value)} />
        </Field>
      </Dialog>
      <Dialog
        open={dialog === "withdraw"}
        title="Withdraw this application?"
        description="Use this when the family has asked to stop the process."
        confirmLabel="Withdraw"
        danger
        loading={pending === "withdraw"}
        onClose={() => setDialog(null)}
        onConfirm={() => void run("withdraw", { note })}
      />
    </div>
  );
}
