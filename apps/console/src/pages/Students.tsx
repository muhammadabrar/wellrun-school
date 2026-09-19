import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Dialog, EmptyState, ErrorState, PageHeader, Skeleton } from "@wellrun/ui";
import { ChevronLeft, ChevronRight, Eye, MessageCircle, Pencil, Phone, SlidersHorizontal, UserPlus, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { AttendanceMeter } from "@/components/students/attendance-meter";
import { SubmitFeeDialog } from "@/components/students/submit-fee-dialog";
import { TodayAttendance, todayAttendanceLabel, useTodayAttendance } from "@/components/students/today-attendance";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Toast } from "../components/motion";
import { api, currentUser, type AttendanceMark, type StudentRow } from "../lib/api";
import { pkr } from "../lib/format";
import { queryKeys } from "../lib/query";
import { useCampus } from "@/hooks/use-campus";

export function StudentsPage() {
  const user = currentUser();
  const canMutate = user?.role === "SCHOOL_ADMIN";
  const canMarkAttendance = user?.role === "SCHOOL_ADMIN" || user?.role === "TEACHER";
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [advanced, setAdvanced] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState<"assign_class" | "promote" | "deactivate" | null>(null);
  const [bulkClassId, setBulkClassId] = useState("");
  const [pending, setPending] = useState(false);
  const [quickView, setQuickView] = useState<StudentRow | null>(null);
  const [feeStudent, setFeeStudent] = useState<StudentRow | null>(null);
  const todayMark = useTodayAttendance();
  const { campusId, classes, active } = useCampus();
  const filters = {
    q: params.get("q") ?? "",
    guardian: params.get("guardian") ?? "",
    address: params.get("address") ?? "",
    dateOfBirth: params.get("dateOfBirth") ?? "",
    className: params.get("className") ?? "",
    section: params.get("section") ?? "",
    campusId,
    status: params.get("status") ?? "",
    topScorer: params.get("topScorer") === "true" ? "true" : undefined,
    perfectAttendance: params.get("perfectAttendance") === "true" ? "true" : undefined,
    page: Number(params.get("page") || 1),
    pageSize: 20,
  };
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.students(filters),
    queryFn: () => api.students(filters),
    enabled: Boolean(campusId),
  });

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    setParams(next);
  }

  function setClassFilter(className: string, section = filters.section) {
    const next = new URLSearchParams(params);
    if (className) next.set("className", className);
    else next.delete("className");
    const allowed = classes.filter((cls) => !className || cls.name === className).some((cls) => cls.section === section);
    if (section && allowed) next.set("section", section);
    else next.delete("section");
    next.delete("page");
    setParams(next);
  }

  function markToday(student: StudentRow, status: AttendanceMark) {
    if (!student.class) return;
    setQuickView((current) => (current?.id === student.id ? { ...current, todayAttendance: status } : current));
    todayMark.mutate({
      classId: student.class.id,
      studentId: student.id,
      status,
      firstName: student.firstName,
      lastName: student.lastName,
      rollNo: student.rollNo,
      className: student.class.name,
      section: student.class.section,
    });
  }

  const classNames = useMemo(() => [...new Set(classes.map((cls) => cls.name))], [classes]);
  const sections = useMemo(
    () => [...new Set(classes.filter((cls) => !filters.className || cls.name === filters.className).map((cls) => cls.section))],
    [classes, filters.className],
  );

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
        description={`${active ? `${active.name} · ` : ""}${data?.total ?? 0} ${data?.total === 1 ? "student" : "students"}`}
        actions={
          canMutate ? (
            <Button render={<Link to="/admissions/new" />}>
              <UserPlus data-icon="inline-start" />
              New admission
            </Button>
          ) : null
        }
      />
      {isError ? (
        <div className="mt-4">
          <ErrorState title="Could not load students" description="Check the connection and try again." onRetry={() => void refetch()} />
        </div>
      ) : null}

      <section className="mt-6 rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <FieldGroup className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
          <Field>
            <FieldLabel htmlFor="student-search">Search by student</FieldLabel>
            <Input id="student-search" value={filters.q} onChange={(event) => setFilter("q", event.target.value)} placeholder="Name, ADM number, or roll no." />
          </Field>
          <Field>
            <FieldLabel htmlFor="student-class">Class</FieldLabel>
            <FormSelect
              id="student-class"
              value={filters.className || "all"}
              onValueChange={(value) => setClassFilter(value === "all" || !value ? "" : value)}
              options={[
                { value: "all", label: "All classes" },
                ...classNames.map((name) => ({ value: name, label: name })),
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="student-section">Section</FieldLabel>
            <FormSelect
              id="student-section"
              value={filters.section || "all"}
              onValueChange={(value) => setFilter("section", value === "all" || !value ? "" : value)}
              options={[
                { value: "all", label: "All sections" },
                ...sections.map((section) => ({ value: section, label: section })),
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

      {isPending ? (
        <StudentsTableSkeleton />
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
            <table className="w-full min-w-[72rem] text-left">
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
                  <th className="px-5 py-3 font-medium"> </th>
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
                      <Link className="font-medium text-indigo" to={`/students/${student.id}`}>
                        {student.firstName} {student.lastName}
                      </Link>
                      <p className="text-sm text-muted-foreground">{student.admissionNo} · Roll {student.rollNo}</p>
                    </td>
                    <td className="px-5 py-4">{student.class ? `${student.class.name} • Section ${student.class.section}` : "—"}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <AttendanceMeter value={student.attendancePct} marked={student.attendanceMarked} />
                        {canMarkAttendance && student.class ? (
                          <TodayAttendance
                            value={student.todayAttendance}
                            onChange={(status) => markToday(student, status)}
                          />
                        ) : (
                          <p className="text-xs text-muted-foreground">{todayAttendanceLabel(student.todayAttendance)}</p>
                        )}
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
                    <td className="px-5 py-4">
                      <Button type="button" size="sm" variant="outline" onClick={() => setQuickView(student)}>
                        <Eye data-icon="inline-start" />
                        Quick view
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-6 space-y-3 md:hidden">
            {data.items.map((student) => (
              <article key={student.id} className="rounded-3xl bg-surface p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link className="font-medium text-indigo" to={`/students/${student.id}`}>
                      {student.firstName} {student.lastName}
                    </Link>
                    <p className="text-sm text-muted-foreground">{student.admissionNo}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {student.class ? `${student.class.name} • Section ${student.class.section}` : "No class"}
                    </p>
                  </div>
                  <AttendanceMeter value={student.attendancePct} marked={student.attendanceMarked} />
                </div>
                <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                  {canMarkAttendance && student.class ? (
                    <TodayAttendance
                      value={student.todayAttendance}
                      onChange={(status) => markToday(student, status)}
                    />
                  ) : (
                    <p className="text-xs text-muted-foreground">{todayAttendanceLabel(student.todayAttendance)}</p>
                  )}
                  <Button type="button" size="sm" variant="outline" onClick={() => setQuickView(student)}>
                    <Eye data-icon="inline-start" />
                    Quick view
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}

      {canMutate && selected.length ? (
        <div className="sticky bottom-4 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-surface px-4 py-3 shadow-lg ring-1 ring-foreground/10">
          <p className="text-sm font-medium">{selected.length} selected</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setBulkAction("assign_class")}>
              Assign class
            </Button>
            <Button type="button" size="sm" onClick={() => setBulkAction("promote")}>
              Promote
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={() => setBulkAction("deactivate")}>
              Deactivate
            </Button>
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

      <StudentQuickView
        student={quickView}
        canMutate={canMutate}
        canMarkAttendance={canMarkAttendance}
        onClose={() => setQuickView(null)}
        onMark={(status) => quickView && markToday(quickView, status)}
        onSubmitFee={() => {
          if (!quickView) return;
          setFeeStudent(quickView);
          setQuickView(null);
        }}
      />

      {feeStudent ? (
        <SubmitFeeDialog
          studentId={feeStudent.id}
          studentName={`${feeStudent.firstName} ${feeStudent.lastName}`}
          open
          onClose={() => setFeeStudent(null)}
        />
      ) : null}

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
              options={classes.map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}` }))}
            />
          </Field>
        ) : null}
      </Dialog>
      <Toast message={todayMark.toast} />
    </div>
  );
}

function StudentQuickView({
  student,
  canMutate,
  canMarkAttendance,
  onClose,
  onMark,
  onSubmitFee,
}: {
  student: StudentRow | null;
  canMutate: boolean;
  canMarkAttendance: boolean;
  onClose: () => void;
  onMark: (status: AttendanceMark) => void;
  onSubmitFee: () => void;
}) {
  if (!student) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="student-quick-view-title">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close quick view" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl bg-surface p-6 shadow-lg">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="student-quick-view-title" className="font-display text-2xl">
              {student.firstName} {student.lastName}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {student.admissionNo} · Roll {student.rollNo}
            </p>
          </div>
          <Badge tone={student.status === "active" ? "indigo" : "neutral"}>{student.status}</Badge>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-2xl bg-paper p-3">
            <dt className="text-muted-foreground">Class</dt>
            <dd className="mt-1 font-medium">{student.class ? `${student.class.name} • Section ${student.class.section}` : "No class"}</dd>
          </div>
          <div className="rounded-2xl bg-paper p-3">
            <dt className="text-muted-foreground">Fees</dt>
            <dd className="mt-1 font-medium">
              {student.pendingFees.status === "pending"
                ? `Due ${pkr(student.pendingFees.amountPkr)}`
                : student.pendingFees.status === "paid"
                  ? "Paid"
                  : "No invoice"}
            </dd>
          </div>
          <div className="rounded-2xl bg-paper p-3">
            <dt className="text-muted-foreground">Attendance</dt>
            <dd className="mt-2">
              <AttendanceMeter value={student.attendancePct} marked={student.attendanceMarked} />
            </dd>
          </div>
          <div className="rounded-2xl bg-paper p-3">
            <dt className="text-muted-foreground">Phone</dt>
            <dd className="mt-1 font-medium">{student.phone || "—"}</dd>
          </div>
        </dl>
        {canMarkAttendance && student.class ? (
          <div className="mt-4">
            <TodayAttendance value={student.todayAttendance} onChange={onMark} />
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Today: {todayAttendanceLabel(student.todayAttendance)}</p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="outline" render={<Link to={`/students/${student.id}`} />}>
            Open profile
          </Button>
          {canMutate ? (
            <Button variant="outline" render={<Link to={`/students/${student.id}/edit`} />}>
              <Pencil data-icon="inline-start" />
              Edit profile
            </Button>
          ) : null}
          {canMutate ? (
            <Button type="button" variant="outline" onClick={onSubmitFee}>
              <Wallet data-icon="inline-start" />
              Submit fee
            </Button>
          ) : null}
          {student.phone ? (
            <Button variant="outline" render={<a href={`tel:${student.phone.replace(/\D/g, "")}`} />}>
              <Phone data-icon="inline-start" />
              Call
            </Button>
          ) : null}
          {student.phone ? (
            <Button variant="outline" render={<a href={whatsappLink(student.phone)} target="_blank" rel="noreferrer" />}>
              <MessageCircle data-icon="inline-start" />
              WhatsApp
            </Button>
          ) : null}
        </div>
        <div className="mt-6 flex justify-end">
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function StudentsTableSkeleton() {
  return (
    <div className="mt-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading students</span>
      <div className="hidden overflow-hidden rounded-3xl bg-surface md:block">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 border-t border-line px-5 py-4 first:border-t-0">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-8 w-44" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="ml-auto h-8 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-3 md:hidden">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-3xl bg-surface p-4">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="mt-2 h-4 w-28" />
            <Skeleton className="mt-4 h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function whatsappLink(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  const intl = digits.startsWith("0") ? `92${digits.slice(1)}` : digits;
  return `https://wa.me/${intl}`;
}
