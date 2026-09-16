import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { UserPlus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { admissionStatusLabel, admissionStatusTone } from "../components/admissions/status";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, type AdmissionStatus } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";

const chips: { key: string; label: string; status?: AdmissionStatus | "open" }[] = [
  { key: "open", label: "Open", status: "open" },
  { key: "draft", label: "Draft", status: "DRAFT" },
  { key: "submitted", label: "Submitted", status: "SUBMITTED" },
  { key: "underReview", label: "Under review", status: "UNDER_REVIEW" },
  { key: "assessmentPending", label: "Assessment", status: "ASSESSMENT_PENDING" },
  { key: "feePending", label: "Fee pending", status: "FEE_PENDING" },
  { key: "documentsPending", label: "Documents", status: "DOCUMENTS_PENDING" },
  { key: "waitlisted", label: "Waitlisted", status: "WAITLISTED" },
  { key: "confirmed", label: "Confirmed", status: "ADMISSION_CONFIRMED" },
];

export function AdmissionsPage() {
  const [params, setParams] = useSearchParams();
  const query = {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    campusId: params.get("campusId") ?? localStorage.getItem("wellrun-campus-id") ?? "",
    className: params.get("className") ?? "",
    page: Number(params.get("page") || 1),
    pageSize: 20,
  };
  const { data: summary } = useQuery({ queryKey: queryKeys.admissionsSummary, queryFn: api.admissionsSummary });
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: queryKeys.admissions(query),
    queryFn: () => api.admissions(query),
    placeholderData: keepPreviousData,
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next);
  }

  const classNames = [...new Set((data?.classes ?? []).map((row) => row.name))];

  return (
    <div>
      <PageHeader
        title="Admissions"
        description="Applications waiting on review, fees, documents, or confirmation."
        actions={
          <Button render={<Link to="/admissions/new" />}>
            <UserPlus data-icon="inline-start" />
            New application
          </Button>
        }
      />
      <FetchingIndicator show={isFetching && Boolean(data)} label="Updating applications" />
      {isError ? (
        <div className="mt-4">
          <ErrorState title="Could not load admissions" description="Check the connection and try again." onRetry={() => void refetch()} />
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        {chips.map((chip) => {
          const count = chip.status === "open" ? summary?.open ?? 0 : Number(summary?.[chip.key as keyof typeof summary] ?? 0);
          const active = (chip.status === "open" && !query.status) || query.status === chip.status;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter("status", chip.status === "open" ? "" : String(chip.status))}
              className={`rounded-2xl bg-surface p-4 text-left ${active ? "ring-2 ring-indigo" : ""}`}
            >
              <p className="text-sm text-muted-foreground">{chip.label}</p>
              <p className="mt-1 font-display text-2xl">{isPending && !summary ? "—" : count}</p>
            </button>
          );
        })}
      </div>

      <section className="mt-6 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <FieldGroup className="grid grid-cols-1 md:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="admission-search">Search</FieldLabel>
            <Input
              id="admission-search"
              value={query.q}
              onChange={(event) => setFilter("q", event.target.value)}
              placeholder="Name, APP number, guardian, CNIC"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admission-campus">Campus</FieldLabel>
            <FormSelect
              id="admission-campus"
              value={query.campusId || "all"}
              onValueChange={(value) => setFilter("campusId", value === "all" || !value ? "" : value)}
              options={[
                { value: "all", label: "All campuses" },
                ...(data?.campuses.map((campus) => ({ value: campus.id, label: campus.name })) ?? []),
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="admission-grade">Grade</FieldLabel>
            <FormSelect
              id="admission-grade"
              value={query.className || "all"}
              onValueChange={(value) => setFilter("className", value === "all" || !value ? "" : value)}
              options={[
                { value: "all", label: "All grades" },
                ...classNames.map((name) => ({ value: name, label: name })),
              ]}
            />
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const next = new URLSearchParams();
                const campus = localStorage.getItem("wellrun-campus-id");
                if (campus) next.set("campusId", campus);
                setParams(next);
              }}
            >
              Clear filters
            </Button>
          </div>
        </FieldGroup>
      </section>

      {isPending && !data ? (
        <div className="mt-6">
          <LoadingState variant="table" />
        </div>
      ) : !data?.items.length ? (
        <div className="mt-6">
          <EmptyState
            title="No applications match these filters"
            description="Start a new application or clear filters to see the pipeline."
            action={
              <Button render={<Link to="/admissions/new" />}>New application</Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="mt-6 hidden overflow-x-auto rounded-3xl bg-surface md:block">
            <table className="w-full min-w-[64rem] text-left">
              <thead className="text-sm text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 font-medium">Applicant</th>
                  <th className="px-5 py-3 font-medium">Grade</th>
                  <th className="px-5 py-3 font-medium">Guardian</th>
                  <th className="px-5 py-3 font-medium">Docs</th>
                  <th className="px-5 py-3 font-medium">Fee</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Next</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr key={row.id} className="border-t border-line">
                    <td className="px-5 py-4">
                      <Link to={`/admissions/${row.id}`} className="font-medium text-indigo">
                        {row.firstName} {row.lastName}
                      </Link>
                      <span className="block text-sm text-muted-foreground">{row.applicationNo}</span>
                    </td>
                    <td className="px-5 py-4">
                      {row.className ? `${row.className} • ${row.section}` : "—"}
                      <span className="block text-sm text-muted-foreground">{row.campus}</span>
                    </td>
                    <td className="px-5 py-4">
                      {row.guardianName || "—"}
                      <span className="block text-sm text-muted-foreground">{row.guardianPhone}</span>
                    </td>
                    <td className="px-5 py-4">
                      {row.docs.uploaded}/{row.docs.total}
                    </td>
                    <td className="px-5 py-4">{row.feeDue ? pkr(row.feeDue) : "Paid"}</td>
                    <td className="px-5 py-4">
                      <Badge tone={admissionStatusTone(row.status)}>{admissionStatusLabel(row.status)}</Badge>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{row.nextAction}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 space-y-3 md:hidden">
            {data.items.map((row) => (
              <Link key={row.id} to={`/admissions/${row.id}`} className="block rounded-3xl bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {row.firstName} {row.lastName}
                    </p>
                    <p className="text-sm text-muted-foreground">{row.applicationNo}</p>
                  </div>
                  <Badge tone={admissionStatusTone(row.status)}>{admissionStatusLabel(row.status)}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {row.className ? `${row.className} • ${row.section}` : "No class yet"} · {row.nextAction}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
