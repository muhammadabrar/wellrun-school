import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LEAVE_BACKDATE_DAYS, LEAVE_TYPES, LEAVE_TYPE_LABEL, addDays, type LeaveType } from "@wellrun/shared";
import { Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowLeft } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { LeaveBadge, leaveRange, leaveTypeName } from "@/components/staff/leave-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { todayIso } from "@/lib/format";
import { leaveApi, leaveKeys, staffAttendanceKeys, type LeaveView } from "@/lib/staff-attendance-api";

/** A staff member's own leave: ask for it, see where each request stands, withdraw one that hasn't started. */
export function MyLeavePage() {
  const queryClient = useQueryClient();
  const today = todayIso();
  const [type, setType] = useState<LeaveType>("CASUAL");
  const [fromOn, setFromOn] = useState(today);
  const [toOn, setToOn] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<LeaveView | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({ queryKey: leaveKeys.mine, queryFn: leaveApi.mine });

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };

  const request = useMutation({
    mutationFn: (reason: string) => leaveApi.request({ type, fromOn, toOn, reason }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.root });
      flash("Request sent to your admin");
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't send your request"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => leaveApi.cancel(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leaveKeys.root });
      void queryClient.invalidateQueries({ queryKey: staffAttendanceKeys.root });
      setCancelling(null);
      flash("Request withdrawn");
    },
    onError: (e) => {
      setCancelling(null);
      setError(e instanceof Error ? e.message : "Couldn't withdraw that request");
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const reason = String(new FormData(form).get("reason") ?? "");
    request.mutate(reason, { onSuccess: () => form.reset() });
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link to="/me" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> My portal
        </Link>
        <PageHeader title="My leave" description="Ask your admin for leave. Approved days won't count against your attendance." />
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-3xl bg-surface p-5">
        <h2 className="font-display text-xl">Ask for leave</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="leave-type">Kind of leave</Label>
            <FormSelect id="leave-type" value={type} onValueChange={(value) => value && setType(value as LeaveType)} options={LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABEL[t] }))} />
          </div>
          <div>
            <Label htmlFor="leave-from">First day</Label>
            <DatePicker id="leave-from" value={fromOn} onChange={(value) => { setFromOn(value); if (toOn < value) setToOn(value); }} fromYear={Number(addDays(today, -LEAVE_BACKDATE_DAYS).slice(0, 4))} toYear={new Date().getFullYear() + 1} />
          </div>
          <div>
            <Label htmlFor="leave-to">Last day</Label>
            <DatePicker id="leave-to" value={toOn} onChange={setToOn} fromYear={Number(fromOn.slice(0, 4))} toYear={new Date().getFullYear() + 1} />
          </div>
        </div>
        <div>
          <Label htmlFor="leave-reason">Why do you need it?</Label>
          <Textarea id="leave-reason" name="reason" required rows={3} maxLength={500} dir="auto" placeholder="For example: fever, a family wedding" />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <Button type="submit" loading={request.isPending}>
          Send request
        </Button>
      </form>

      <section aria-labelledby="my-leave-list">
        <h2 id="my-leave-list" className="mb-3 font-display text-xl">
          My requests
        </h2>
        {isPending ? (
          <LoadingState variant="page" />
        ) : isError || !data ? (
          <ErrorState title="Couldn't load your leave" description="Check your connection and try again." onRetry={() => void refetch()} />
        ) : !data.length ? (
          <EmptyState title="No leave requests yet" description="When you ask for leave, you can follow it here." />
        ) : (
          <ul className="space-y-3">
            {data.map((leave) => (
              <li key={leave.id} className="rounded-3xl bg-surface p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {leaveTypeName(leave.type)}: {leaveRange(leave.fromOn, leave.toOn)}
                  </p>
                  <LeaveBadge status={leave.status} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {leave.workingDays} school {leave.workingDays === 1 ? "day" : "days"}
                </p>
                <p dir="auto" className="mt-1 text-sm">
                  {leave.reason}
                </p>
                {leave.decisionNote ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {leave.decidedBy ?? "Admin"}: "{leave.decisionNote}"
                  </p>
                ) : null}
                {leave.canCancel ? (
                  <div className="mt-3">
                    <Button variant="outline" size="sm" onClick={() => setCancelling(leave)}>
                      Withdraw request
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog
        open={Boolean(cancelling)}
        title="Withdraw this request?"
        description={cancelling ? `${leaveTypeName(cancelling.type)}, ${leaveRange(cancelling.fromOn, cancelling.toOn)}.` : undefined}
        confirmLabel="Withdraw"
        danger
        loading={cancel.isPending}
        onConfirm={() => cancelling && cancel.mutate(cancelling.id)}
        onClose={() => setCancelling(null)}
      />
      <Toast message={toast} />
    </div>
  );
}
