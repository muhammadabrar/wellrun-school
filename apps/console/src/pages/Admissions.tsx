import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { ChevronLeft, ChevronRight, UserPlus } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { admissionStatusLabel, admissionStatusTone } from "../components/admissions/status";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCampus } from "@/hooks/use-campus";
import { api, type AdmissionStatus } from "../lib/api";
import { queryKeys } from "../lib/query";

const chips: { key: string; label: string; status?: AdmissionStatus | "open" }[] = [
  { key: "open", label: "Open", status: "open" },
  { key: "draft", label: "Draft", status: "DRAFT" },
  { key: "underReview", label: "Under review", status: "UNDER_REVIEW" },
  { key: "waitlisted", label: "Waitlisted", status: "WAITLISTED" },
];

const continuable = new Set(["DRAFT", "SUBMITTED", "UNDER_REVIEW", "WAITLISTED", "ACCEPTED", "FEE_PENDING", "DOCUMENTS_PENDING"]);

export function AdmissionsPage() {
  const [params, setParams] = useSearchParams();
  const { campusId, classes, active, currentYear } = useCampus();
  const query = {
    q: params.get("q") ?? "",
    status: params.get("status") ?? "",
    campusId,
    yearId: currentYear?.id ?? "",
    className: params.get("className") ?? "",
    page: Number(params.get("page") || 1),
    pageSize: 20,
  };
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: queryKeys.admissions(query),
    queryFn: () => api.admissions(query),
    placeholderData: keepPreviousData,
    enabled: Boolean(campusId),
  });
  const summary = data?.summary;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));
  const page = data?.page ?? 1;

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  const classNames = [...new Set(classes.map((row) => row.name))];

  return (
    <div>
      <PageHeader
        title="Admissions"
        description={
          active
            ? `${active.name}. Open applications for this campus. Admitted students are on Students.`
            : "Open applications. Admitted students are on Students."
        }
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

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {chips.map((chip) => {
          const count = chip.status === "open" ? summary?.open ?? 0 : Number(summary?.[chip.key as keyof typeof summary] ?? 0);
          const selected = (chip.status === "open" && !query.status) || query.status === chip.status;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setFilter("status", chip.status === "open" ? "" : String(chip.status))}
              className={`rounded-2xl bg-surface p-4 text-left ${selected ? "ring-2 ring-indigo" : ""}`}
            >
              <p className="text-sm text-muted-foreground">{chip.label}</p>
              <p className="mt-1 font-display text-2xl">{isPending && !summary ? "—" : count}</p>
            </button>
          );
        })}
      </div>

      <section className="mt-6 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <FieldGroup className="grid grid-cols-1 md:grid-cols-3">
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
                setParams(new URLSearchParams());
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
            description="Start a new application or clear filters to see open files. Admitted students are listed under Students."
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
                  <th className="px-5 py-3 font-medium">Added by</th>
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
                    <td className="px-5 py-4">{row.addedBy || "—"}</td>
                    <td className="px-5 py-4">
                      <Badge tone={admissionStatusTone(row.status)}>{admissionStatusLabel(row.status)}</Badge>
                    </td>
                    <td className="px-5 py-4">
                      {continuable.has(row.status) ? (
                        <Button size="sm" render={<Link to={`/admissions/${row.id}`} />}>
                          Continue
                        </Button>
                      ) : (
                        <span className="text-sm text-muted-foreground">{row.nextAction}</span>
                      )}
                    </td>
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
                  {row.className ? `${row.className} • ${row.section}` : "No class yet"}
                  {row.addedBy ? ` · ${row.addedBy}` : ""}
                </p>
                {continuable.has(row.status) ? <p className="mt-2 text-sm text-indigo">Continue</p> : null}
              </Link>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-sm">
            <p className="text-muted-foreground">
              Page {page} of {pages}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setFilter("page", String(page - 1))}>
                <ChevronLeft /> Previous
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setFilter("page", String(page + 1))}>
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
