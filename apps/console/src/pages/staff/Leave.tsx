import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LeaveView } from "@wellrun/shared";
import { Dialog, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination, Tabs } from "@wellrun/ui";
import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Toast } from "@/components/motion";
import { LeaveBadge, leaveRange, leaveTypeName, shortDate } from "@/components/staff/leave-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useClampPage } from "@/lib/paging";
import { leaveApi, leaveKeys, staffAttendanceKeys } from "@/lib/staff-attendance-api";

const TABS = [
  { id: "PENDING", label: "Waiting" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Not approved" },
  { id: "ALL", label: "Everything" },
];

export function StaffLeavePage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = TABS.some((t) => t.id === params.get("status")) ? params.get("status")! : "PENDING";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [deciding, setDeciding] = useState<{ leave: LeaveView; decision: "APPROVE" | "REJECT" } | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key !== "page") next.delete("page");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: leaveKeys.list(status, page), queryFn: () => leaveApi.list(status, page), placeholderData: keepPreviousData });
  useClampPage(data, (next) => setParam("page", next > 1 ? String(next) : null));

  const decide = useMutation({
    mutationFn: ({ leave, decision }: { leave: LeaveView; decision: "APPROVE" | "REJECT" }) => leaveApi.decide(leave.id, { decision, note: note.trim() }),
    onSuccess: (_result, { decision }) => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.root });
      void queryClient.invalidateQueries({ queryKey: staffAttendanceKeys.root });
      setDeciding(null);
      setNote("");
      setToast(decision === "APPROVE" ? "Leave approved" : "Leave not approved");
      setTimeout(() => setToast(null), 2200);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save that decision"),
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Leave requests" description="Staff ask for leave from their own page. Approve or decline here. Approved days show as leave in attendance and never count against the person." />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={status} onChange={(id) => setParam("status", id === "PENDING" ? null : id)} items={TABS.map((t) => (t.id === "PENDING" && data?.pending ? { ...t, label: `${t.label} (${data.pending})` } : t))} />
        <FetchingIndicator show={isFetching && !isPending} />
      </div>

      {isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load leave requests" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data.items.length ? (
        <EmptyState title={status === "PENDING" ? "Nothing waiting for you" : "No leave here"} description={status === "PENDING" ? "When someone asks for leave it will appear here." : "Nothing matches this tab yet."} />
      ) : (
        <ul className="space-y-3">
          {data.items.map((leave) => (
            <li key={leave.id} className="rounded-3xl bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link to={`/staff/${leave.staffId}`} className="font-display text-xl hover:underline">
                    {leave.staffName}
                  </Link>
                  <p className="text-sm text-muted-foreground">{[leave.department, leave.employeeNo].filter(Boolean).join(" · ")}</p>
                </div>
                <LeaveBadge status={leave.status} />
              </div>
              <p className="mt-3 font-medium">
                {leaveTypeName(leave.type)}: {leaveRange(leave.fromOn, leave.toOn)} <span className="font-normal text-muted-foreground">({leave.workingDays} school {leave.workingDays === 1 ? "day" : "days"})</span>
              </p>
              <p dir="auto" className="mt-1 text-sm">
                {leave.reason}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">Asked on {shortDate(leave.createdAt.slice(0, 10))}</p>
              {leave.status !== "PENDING" && leave.decidedBy ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {leave.status === "APPROVED" ? "Approved" : leave.status === "REJECTED" ? "Declined" : "Closed"} by {leave.decidedBy}
                  {leave.decisionNote ? `: "${leave.decisionNote}"` : ""}
                </p>
              ) : null}
              {leave.status === "PENDING" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button onClick={() => { setError(null); setNote(""); setDeciding({ leave, decision: "APPROVE" }); }}>Approve</Button>
                  <Button variant="outline" onClick={() => { setError(null); setNote(""); setDeciding({ leave, decision: "REJECT" }); }}>
                    Decline
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="request" busy={isFetching} onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)} /> : null}

      <Dialog
        open={Boolean(deciding)}
        title={deciding?.decision === "APPROVE" ? "Approve this leave?" : "Decline this leave?"}
        description={deciding ? `${deciding.leave.staffName}, ${leaveRange(deciding.leave.fromOn, deciding.leave.toOn)}.` : undefined}
        confirmLabel={deciding?.decision === "APPROVE" ? "Approve" : "Decline"}
        danger={deciding?.decision === "REJECT"}
        loading={decide.isPending}
        onConfirm={() => deciding && decide.mutate(deciding)}
        onClose={() => setDeciding(null)}
      >
        <Label htmlFor="leave-note">{deciding?.decision === "REJECT" ? "Tell them why (optional)" : "A note for them (optional)"}</Label>
        <Textarea id="leave-note" rows={3} maxLength={300} value={note} onChange={(event) => setNote(event.target.value)} dir="auto" />
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </Dialog>
      <Toast message={toast} />
    </div>
  );
}
