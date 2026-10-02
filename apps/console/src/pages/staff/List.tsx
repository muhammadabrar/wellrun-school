import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { KeyRound, Search, UserPlus, Wallet } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { CONTRACT_TYPES, STAFF_STATUS, StaffStatusBadge, formatDay } from "@/components/staff/staff-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, type StaffStatus } from "@/lib/api";
import { pkr } from "@/lib/format";
import { useClampPage } from "@/lib/paging";
import { queryKeys } from "@/lib/query";

const statusOptions = [
  { value: "current", label: "Current staff" },
  { value: "all", label: "Everyone" },
  ...(Object.keys(STAFF_STATUS) as StaffStatus[]).map((status) => ({ value: status, label: STAFF_STATUS[status].label })),
];

export function StaffListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "current";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);

  const setPage = useCallback(
    (next: number) =>
      setParams(
        (current) => {
          const out = new URLSearchParams(current);
          if (next > 1) out.set("page", String(next));
          else out.delete("page");
          return out;
        },
        { replace: true },
      ),
    [setParams],
  );

  // Search as you type, without a request per keystroke. A new search starts from page one.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() === q) return;
      const next = new URLSearchParams(params);
      if (search.trim()) next.set("q", search.trim());
      else next.delete("q");
      next.delete("page");
      setParams(next, { replace: true });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, q, params, setParams]);

  const query = { status, q: q || undefined, page: page > 1 ? String(page) : undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: queryKeys.staffList(query),
    queryFn: () => api.staff(query),
    placeholderData: keepPreviousData,
  });
  useClampPage(data, setPage);
  const rows = data?.items ?? [];
  const summary = data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Staff"
        description="Everyone who works at your school — their job, contract, login and pay."
        actions={
          <>
            <Button variant="outline" icon={<Wallet />} render={<Link to="/payroll" />}>
              Payroll
            </Button>
            <Button icon={<UserPlus />} render={<Link to="/staff/new" />}>
              Add staff
            </Button>
          </>
        }
      />

      {summary && status === "current" && !q ? (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Current staff" value={String(summary.current)} />
          <Stat label="Basic salaries / month" value={pkr(summary.monthlyPkr)} />
          <Stat label="Without a login" value={String(summary.noLogin)} hint={summary.noLogin ? "They can't see their timetable or payslips." : undefined} />
          <Stat label="Without a contract" value={String(summary.noContract)} hint={summary.noContract ? "They're left out of payroll." : undefined} />
        </dl>
      ) : null}

      <div className="flex flex-wrap items-end gap-3 rounded-3xl bg-surface p-4">
        <div className="flex min-w-64 flex-1 flex-col gap-2">
          <Label htmlFor="staff-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="staff-search"
              type="search"
              className="pl-9"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, employee no, CNIC, phone or email"
            />
          </div>
        </div>
        <div className="flex w-52 flex-col gap-2">
          <Label htmlFor="staff-status">Show</Label>
          <FormSelect
            id="staff-status"
            value={status}
            onValueChange={(value) => {
              const next = new URLSearchParams(params);
              if (value && value !== "current") next.set("status", value);
              else next.delete("status");
              next.delete("page");
              setParams(next, { replace: true });
            }}
            options={statusOptions}
          />
        </div>
      </div>

      <FetchingIndicator show={isFetching && !isPending} label="Updating staff" />

      {isPending ? (
        <LoadingState variant="table" />
      ) : isError ? (
        <ErrorState title="Couldn't load staff" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !rows.length ? (
        q || status !== "current" ? (
          <EmptyState title="No one matches" description="Try a different name or number, or show everyone." />
        ) : (
          <EmptyState
            title="No staff yet"
            description="Add teachers and other staff with their CNIC, contract and login. They'll then appear on timetables and in payroll."
            action={
              <Button icon={<UserPlus />} render={<Link to="/staff/new" />}>
                Add staff
              </Button>
            }
          />
        )
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">
                  Staff member
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Job
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Contract
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Joined
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-pointer border-t border-line hover:bg-muted/50"
                  onClick={() => navigate(`/staff/${row.id}`)}
                >
                  <td className="px-3 py-3">
                    <Link to={`/staff/${row.id}`} className="font-medium hover:underline" onClick={(event) => event.stopPropagation()}>
                      {row.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      {row.employeeNo}
                      {row.cnic ? ` · ${row.cnic}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {row.title}
                    <span className="block text-xs text-muted-foreground">
                      {[row.department, row.campus?.name].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {row.contract ? (
                      <>
                        <span className="tabular-nums">{pkr(row.contract.basicSalaryPkr)}</span>
                        <span className="block text-xs text-muted-foreground">{CONTRACT_TYPES[row.contract.type]}</span>
                      </>
                    ) : (
                      <span className="text-orange">No contract</span>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{formatDay(row.joinDate)}</td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <StaffStatusBadge status={row.status} />
                      {row.login && !row.login.disabled ? (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title="Can sign in">
                          <KeyRound className="size-3.5" aria-hidden />
                          {row.login.role === "SCHOOL_ADMIN" ? "Admin" : "Login"}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="staff member" busy={isFetching} onPageChange={setPage} /> : null}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-surface p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums">{value}</dd>
      {hint ? <dd className="mt-1 text-xs text-orange">{hint}</dd> : null}
    </div>
  );
}
