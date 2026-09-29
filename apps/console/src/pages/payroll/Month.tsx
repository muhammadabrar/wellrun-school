import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { CheckCheck, FileText, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { PayslipStatusBadge, periodName } from "@/components/staff/staff-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function PayrollPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const thisMonth = monthKey(new Date());
  const period = /^\d{4}-\d{2}$/.test(params.get("period") ?? "") ? params.get("period")! : thisMonth;
  const [notice, setNotice] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const [confirm, setConfirm] = useState<"generate" | "finalize" | null>(null);

  const months = useMemo(() => {
    const now = new Date();
    const list: string[] = [];
    for (let offset = 1; offset >= -12; offset -= 1) list.push(monthKey(new Date(now.getFullYear(), now.getMonth() + offset, 1)));
    if (!list.includes(period)) list.push(period);
    return list.map((value) => ({ value, label: value === thisMonth ? `${periodName(value)} (this month)` : periodName(value) }));
  }, [period, thisMonth]);

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: queryKeys.payroll(period),
    queryFn: () => api.payroll(period),
    placeholderData: keepPreviousData,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["payroll"] });

  const generate = useMutation({
    mutationFn: () => api.generatePayroll(period),
    onSuccess: async (result) => {
      setConfirm(null);
      const parts = [result.created ? `${result.created} draft payslip${result.created === 1 ? "" : "s"} created for ${periodName(period)}. Check them, then finalize.` : "Everyone already has a payslip for this month."];
      if (result.withoutContract.length) parts.push(`No contract, so skipped: ${result.withoutContract.join(", ")}.`);
      setNotice({ message: parts.join(" "), tone: "ok" });
      await refresh();
    },
    onError: (err) => {
      setConfirm(null);
      setNotice({ message: err instanceof Error ? err.message : "Could not create payslips.", tone: "error" });
    },
  });
  const finalize = useMutation({
    mutationFn: () => api.finalizePayroll(period),
    onSuccess: async (result) => {
      setConfirm(null);
      setNotice({ message: `${result.finalized} payslip${result.finalized === 1 ? "" : "s"} finalized. Staff can now see them; mark each one paid when the salary goes out.`, tone: "ok" });
      await refresh();
    },
    onError: (err) => {
      setConfirm(null);
      setNotice({ message: err instanceof Error ? err.message : "Could not finalize payslips.", tone: "error" });
    },
  });

  const summary = data?.summary;
  const label = periodName(period);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payroll"
        description="Create each month's payslips from staff contracts, adjust them, then finalize and record payment."
        actions={
          <Button variant="outline" icon={<Users />} render={<Link to="/staff" />}>
            Staff
          </Button>
        }
      />

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-surface p-4">
        <div className="flex w-64 flex-col gap-2">
          <Label htmlFor="payroll-month">Month</Label>
          <FormSelect
            id="payroll-month"
            value={period}
            onValueChange={(value) => {
              if (!value) return;
              const next = new URLSearchParams(params);
              next.set("period", value);
              setParams(next, { replace: true });
              setNotice(null);
            }}
            options={months}
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {summary?.drafts ? (
            <Button type="button" variant="outline" icon={<CheckCheck />} onClick={() => setConfirm("finalize")}>
              Finalize {summary.drafts} draft{summary.drafts === 1 ? "" : "s"}
            </Button>
          ) : null}
          {summary && (summary.missing > 0 || !data?.payslips.length) ? (
            <Button type="button" icon={<FileText />} onClick={() => setConfirm("generate")}>
              {data?.payslips.length ? `Create ${summary.missing} missing payslip${summary.missing === 1 ? "" : "s"}` : `Run payroll for ${label}`}
            </Button>
          ) : null}
        </div>
      </div>

      {notice ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${notice.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/5 text-primary"}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      ) : null}

      <FetchingIndicator show={isFetching && !isPending} label="Updating payroll" />

      {isPending ? (
        <LoadingState variant="table" />
      ) : isError || !data || !summary ? (
        <ErrorState title="Couldn't load payroll" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Staff paid this month" value={String(summary.staff)} hint={summary.missing ? `${summary.missing} still without a payslip` : undefined} />
            <Stat label="Gross salaries" value={pkr(summary.grossPkr)} />
            <Stat label="Net to pay" value={pkr(summary.netPkr)} hint={summary.deductionPkr ? `after ${pkr(summary.deductionPkr)} deductions` : undefined} />
            <Stat label="Paid so far" value={pkr(summary.paidPkr)} hint={`${summary.paid} of ${summary.staff} payslips`} />
          </dl>

          {!data.payslips.length ? (
            <EmptyState
              title={`No payslips for ${label} yet`}
              description="Running payroll creates a draft payslip for every active staff member with a contract, using their basic salary and allowances. Nothing is final until you finalize."
              action={
                <Button type="button" icon={<FileText />} onClick={() => setConfirm("generate")}>
                  Run payroll for {label}
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-3xl bg-surface p-2">
              <table className="w-full text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Staff member
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">
                      Gross
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">
                      Deductions
                    </th>
                    <th scope="col" className="px-3 py-3 text-right font-medium">
                      Net pay
                    </th>
                    <th scope="col" className="px-3 py-3 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.payslips.map((row) => (
                    <tr key={row.id} className="cursor-pointer border-t border-line hover:bg-muted/50" onClick={() => navigate(`/payroll/payslips/${row.id}`)}>
                      <td className="px-3 py-3">
                        <Link to={`/payroll/payslips/${row.id}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                          {row.staff.name}
                        </Link>
                        <span className="block text-xs text-muted-foreground">
                          {row.staff.employeeNo} · {row.staff.title}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{pkr(row.grossPkr)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-muted-foreground">{row.deductionPkr ? `−${pkr(row.deductionPkr)}` : "—"}</td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">{pkr(row.netPkr)}</td>
                      <td className="px-3 py-3">
                        <PayslipStatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Dialog
        open={confirm === "generate"}
        title={`Create payslips for ${label}?`}
        description="A draft payslip is made for every active or on-leave staff member with a contract in this month. People who joined or left mid-month are paid for the days they worked. Drafts can still be changed."
        confirmLabel="Create payslips"
        loading={generate.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => generate.mutate()}
      />
      <Dialog
        open={confirm === "finalize"}
        title={`Finalize ${summary?.drafts ?? 0} draft payslips?`}
        description="Finalized payslips can't be edited, and staff can see them in their portal. Check allowances and deductions first."
        confirmLabel="Finalize"
        loading={finalize.isPending}
        onClose={() => setConfirm(null)}
        onConfirm={() => finalize.mutate()}
      />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-surface p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums">{value}</dd>
      {hint ? <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd> : null}
    </div>
  );
}
