import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Dialog, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { ChevronLeft, ChevronRight, SlidersHorizontal, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AttendanceRing } from "../components/AttendanceRing";
import { currentUser } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";
import { api } from "../lib/api";

export function StudentsPage() {
  const user = currentUser();
  const canMutate = user?.role === "SCHOOL_ADMIN";
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"assign_class" | "promote" | "deactivate" | null>(null);
  const [bulkClassId, setBulkClassId] = useState("");
  const [pending, setPending] = useState(false);
  const filters = {
    q: params.get("q") ?? "",
    guardian: params.get("guardian") ?? "",
    address: params.get("address") ?? "",
    dateOfBirth: params.get("dateOfBirth") ?? "",
    classId: params.get("classId") ?? "all",
    campusId: params.get("campusId") ?? localStorage.getItem("wellrun-campus-id") ?? "",
    status: params.get("status") ?? "",
    topScorer: params.get("topScorer") === "true" ? "true" : undefined,
    perfectAttendance: params.get("perfectAttendance") === "true" ? "true" : undefined,
    page: Number(params.get("page") || 1),
    pageSize: 20,
  };
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: queryKeys.students(filters),
    queryFn: () => api.students(filters),
    placeholderData: keepPreviousData,
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 20)));
  const page = data?.page ?? 1;
  const advancedCount = [filters.guardian, filters.address, filters.dateOfBirth, filters.topScorer, filters.perfectAttendance].filter(Boolean).length;
  const allIds = useMemo(() => data?.items.map((row) => row.id) ?? [], [data]);

  async function runBulk() {
    if (!bulkAction || !selected.length) return;
    setPending(true);
    try {
      if (bulkAction === "deactivate") {
        await api.bulkStudents({ ids: selected, action: "deactivate", confirm: true });
      } else {
        if (!bulkClassId) return;
        await api.bulkStudents({ ids: selected, action: bulkAction, classId: bulkClassId, confirm: true });
      }
      setSelected([]);
      setBulkAction(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.studentsRoot });
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Students"
        description={`${data?.campus ? `${data.campus.name} · ` : ""}${data?.total ?? 0} ${data?.total === 1 ? "student" : "students"}`}
        actions={
          canMutate ? (
            <Button render={<Link to="/admissions/new" />}>
              <UserPlus data-icon="inline-start" />
              New admission
            </Button>
          ) : null
        }
      />
      <FetchingIndicator show={isFetching && Boolean(data)} label="Updating students" />
      {isError ? (
        <div className="mt-4">
          <ErrorState title="Could not load students" description="Check the connection and try again." onRetry={() => void refetch()} />
        </div>
      ) : null}

      <section className="mt-6 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <FieldGroup className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_auto]">
          <Field>
            <FieldLabel htmlFor="student-search">Search by student</FieldLabel>
            <Input id="student-search" value={filters.q} onChange={(event) => setFilter("q", event.target.value)} placeholder="Name, ADM number, or roll no." />
          </Field>
          <Field>
            <FieldLabel htmlFor="student-class">Class</FieldLabel>
            <FormSelect
              id="student-class"
              value={filters.classId || "all"}
              onValueChange={(value) => setFilter("classId", value === "all" || !value ? "" : value)}
              options={[
                { value: "all", label: "All classes" },
                ...(data?.classes.map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}` })) ?? []),
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="student-status">Status</FieldLabel>
            <FormSelect
              id="student-status"
              value={filters.status || "all"}
              onValueChange={(value) => setFilter("status", value === "all" || !value ? "" : value)}
              options={[
                { value: "all", label: "All statuses" },
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "transferred", label: "Transferred" },
                { value: "graduated", label: "Graduated" },
              ]}
            />
          </Field>
          <Button type="button" variant={advanced || advancedCount ? "default" : "outline"} className="mt-6" onClick={() => setAdvanced((value) => !value)}>
            <SlidersHorizontal data-icon="inline-start" />
            Advance filter
          </Button>
        </FieldGroup>
        {advanced ? (
          <FieldGroup className="mt-4 grid grid-cols-1 border-t border-border pt-4 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="guardian-filter">Guardian</FieldLabel>
              <Input id="guardian-filter" value={filters.guardian} onChange={(event) => setFilter("guardian", event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="address-filter">Address</FieldLabel>
              <Input id="address-filter" value={filters.address} onChange={(event) => setFilter("address", event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="dob-filter">Date of birth</FieldLabel>
              <DatePicker id="dob-filter" value={filters.dateOfBirth} onChange={(value) => setFilter("dateOfBirth", value)} />
            </Field>
          </FieldGroup>
        ) : null}
      </section>

      {isPending && !data ? (
        <div className="mt-6"><LoadingState variant="table" /></div>
      ) : !data?.items.length ? (
        <div className="mt-6">
          <EmptyState
            title="No students match these filters"
            description="Clear a filter or admit a student to this campus."
            action={canMutate ? <Button render={<Link to="/admissions/new" />}>New admission</Button> : undefined}
          />
        </div>
      ) : (
        <>
          <div className="mt-6 hidden overflow-x-auto rounded-3xl bg-surface md:block">
            <table className="w-full min-w-[64rem] text-left">
              <thead className="text-sm text-muted-foreground">
                <tr>
                  {canMutate ? (
                    <th className="px-5 py-3">
                      <Checkbox
                        aria-label="Select all on this page"
                        checked={allIds.length > 0 && allIds.every((id) => selected.includes(id))}
                        onCheckedChange={(checked) => setSelected(checked ? allIds : [])}
                      />
                    </th>
                  ) : null}
                  <th className="px-5 py-3 font-medium">Student</th>
                  <th className="px-5 py-3 font-medium">Class</th>
                  <th className="px-5 py-3 font-medium">Attendance</th>
                  <th className="px-5 py-3 font-medium">Fees</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((student) => (
                  <tr key={student.id} className="border-t border-line">
                    {canMutate ? (
                      <td className="px-5 py-4">
                        <Checkbox
                          aria-label={`Select ${student.firstName} ${student.lastName}`}
                          checked={selected.includes(student.id)}
                          onCheckedChange={(checked) =>
                            setSelected((ids) => (checked ? [...ids, student.id] : ids.filter((id) => id !== student.id)))
                          }
                        />
                      </td>
                    ) : null}
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        {student.photo ? (
                          <img src={student.photo} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo text-sm text-white">
                            {student.firstName[0]}
                          </span>
                        )}
                        <div>
                          <Link className="font-medium text-indigo" to={`/students/${student.id}`}>
                            {student.firstName} {student.lastName}
                          </Link>
                          <p className="text-sm text-muted-foreground">{student.admissionNo} · Roll {student.rollNo}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">{student.class ? `${student.class.name} • Section ${student.class.section}` : "—"}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <AttendanceRing value={student.attendancePct} />
                        <span className="text-sm">{student.attendanceMarked ? `${student.attendancePct}%` : "—"}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {student.pendingFees.status === "pending" ? (
                        <span className="text-orange">Due · {pkr(student.pendingFees.amountPkr)}</span>
                      ) : student.pendingFees.status === "paid" ? (
                        <span className="text-success">Paid</span>
                      ) : (
                        <span className="text-muted-foreground">No invoice</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <Badge tone={student.status === "active" ? "indigo" : "neutral"}>{student.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 space-y-3 md:hidden">
            {data.items.map((student) => (
              <Link key={student.id} to={`/students/${student.id}`} className="block rounded-3xl bg-surface p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{student.firstName} {student.lastName}</p>
                    <p className="text-sm text-muted-foreground">{student.admissionNo}</p>
                  </div>
                  <AttendanceRing value={student.attendancePct} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {student.class ? `${student.class.name} • Section ${student.class.section}` : "No class"} · {student.pendingFees.status === "pending" ? `Due ${pkr(student.pendingFees.amountPkr)}` : "Fees paid"}
                </p>
              </Link>
            ))}
          </div>
        </>
      )}

      {canMutate && selected.length ? (
        <div className="sticky bottom-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-ink px-4 py-3 text-white">
          <p className="text-sm">{selected.length} selected</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setBulkAction("assign_class")}>Assign class</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setBulkAction("promote")}>Promote</Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => setBulkAction("deactivate")}>Deactivate</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between text-sm">
        <p className="text-muted-foreground">Page {page} of {pages}</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setFilter("page", String(page - 1))}>
            <ChevronLeft /> Previous
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={page >= pages} onClick={() => setFilter("page", String(page + 1))}>
            Next <ChevronRight />
          </Button>
        </div>
      </div>

      <Dialog
        open={Boolean(bulkAction)}
        title={bulkAction === "deactivate" ? "Deactivate selected students?" : "Move selected students?"}
        description="This keeps previous enrollments. Confirm to continue."
        confirmLabel="Confirm"
        danger={bulkAction === "deactivate"}
        loading={pending}
        onClose={() => setBulkAction(null)}
        onConfirm={() => void runBulk()}
      >
        {bulkAction && bulkAction !== "deactivate" ? (
          <Field>
            <FieldLabel htmlFor="bulk-class">Class</FieldLabel>
            <FormSelect
              id="bulk-class"
              value={bulkClassId || undefined}
              onValueChange={(value) => setBulkClassId(value ?? "")}
              placeholder="Select class"
              options={(data?.classes ?? []).map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}` }))}
            />
          </Field>
        ) : null}
      </Dialog>
    </div>
  );
}
