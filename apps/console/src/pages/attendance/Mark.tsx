import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, FetchingIndicator, PageHeader, Skeleton } from "@wellrun/ui";
import { CheckCheck, Lock } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { MARK_ORDER, MARK_TONE, markCode, markLabel } from "@/components/attendance/attendance-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { useCampus } from "@/hooks/use-campus";
import { currentUser } from "@/lib/api";
import { attendanceApi, attendanceKeys, type AttendanceStatus } from "@/lib/attendance-api";
import { todayIso } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { cn } from "@/lib/utils";

const KEYS: Record<string, AttendanceStatus> = { p: "PRESENT", a: "ABSENT", l: "LATE", v: "LEAVE", e: "EXCUSED" };

export function MarkAttendancePage() {
  const isTeacher = currentUser()?.role === "TEACHER";
  const { classes } = useCampus();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const date = params.get("date") || todayIso();
  const [draft, setDraft] = useState<Record<string, AttendanceStatus> | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Teachers only see the classes whose first period they teach today.
  const today = useQuery({ queryKey: attendanceKeys.today, queryFn: attendanceApi.today, enabled: isTeacher });
  const options = useMemo(() => {
    if (!isTeacher) return classes.map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}` }));
    const list = (today.data?.classes ?? []).map((cls) => ({ value: cls.id, label: cls.marked ? `${cls.label} ✓` : cls.label }));
    const fromUrl = params.get("classId");
    if (fromUrl && !list.some((o) => o.value === fromUrl)) {
      const cls = classes.find((c) => c.id === fromUrl);
      if (cls) list.push({ value: cls.id, label: `${cls.name} ${cls.section}` });
    }
    return list;
  }, [isTeacher, classes, today.data, params]);

  const classId = params.get("classId") || options[0]?.value || "";
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
    setDraft(null);
  };

  const { data, isPending, isFetching, isError, error, refetch } = useQuery({
    queryKey: attendanceKeys.day(classId, date),
    queryFn: () => attendanceApi.day(classId, date),
    enabled: Boolean(classId),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const students = data?.students ?? [];
  const baseline = useMemo(() => {
    const next: Record<string, AttendanceStatus> = {};
    for (const row of data?.records ?? []) next[row.studentId] = row.status;
    for (const student of students) next[student.id] ??= "PRESENT";
    return next;
  }, [data, students]);
  const values = draft ?? baseline;
  const alreadyMarked = (data?.records.length ?? 0) > 0;
  const locked = data ? !data.canMark : false;

  const counts = useMemo(() => {
    const out: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0, EXCUSED: 0 };
    for (const s of students) out[values[s.id] ?? "PRESENT"] += 1;
    return out;
  }, [students, values]);

  const save = useMutation({
    mutationFn: () => attendanceApi.save({ classId, date, records: students.map((s) => ({ studentId: s.id, status: values[s.id] ?? "PRESENT" })) }),
    onSuccess: (result) => {
      queryClient.setQueryData(attendanceKeys.day(classId, date), result);
      setDraft(null);
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.root });
      void queryClient.invalidateQueries({ queryKey: queryKeys.portal });
      void queryClient.invalidateQueries({ queryKey: queryKeys.studentsRoot });
      setToast("Attendance saved");
      setTimeout(() => setToast(null), 2200);
    },
  });

  const setMark = (studentId: string, status: AttendanceStatus) => {
    if (locked) return;
    setDraft({ ...values, [studentId]: status });
  };

  function onRowKey(event: KeyboardEvent<HTMLLIElement>, studentId: string) {
    const status = KEYS[event.key.toLowerCase()];
    if (status) {
      event.preventDefault();
      setMark(studentId, status);
      (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      (event.currentTarget.nextElementSibling as HTMLElement | null)?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      (event.currentTarget.previousElementSibling as HTMLElement | null)?.focus();
    }
  }

  const noClasses = isTeacher ? today.isSuccess && !options.length : !classes.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mark attendance"
        description={
          isTeacher
            ? "You take attendance for the classes whose first period you teach."
            : "Daily register for one class. Use P, A, L, V (leave) or E on a focused row to mark quickly."
        }
        actions={
          <div className="flex gap-2">
            {classId ? (
              <Button variant="outline" size="sm" render={<Link to={`/attendance/register?classId=${classId}&month=${date.slice(0, 7)}`} />}>
                Month register
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" render={<Link to="/absent" />}>
              Absent list
            </Button>
          </div>
        }
      />

      {isTeacher && today.data && !today.data.working ? (
        <p className="rounded-2xl bg-orange/10 px-4 py-3 text-sm text-orange">
          {today.data.holiday ? `Today is a holiday (${today.data.holiday}).` : "The school is closed today."} No attendance to take.
        </p>
      ) : null}

      {noClasses ? (
        <EmptyState
          title={isTeacher ? "No first-period class today" : "No classes yet"}
          description={
            isTeacher
              ? "Attendance is taken by the teacher of each class's first period. Check your timetable in My portal."
              : "Add a class in Classes & subjects, then mark attendance for it here."
          }
          action={isTeacher ? <Button render={<Link to="/me" />}>My portal</Button> : <Button render={<Link to="/academics" />}>Classes & subjects</Button>}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-48">
              <FormSelect value={classId || undefined} onValueChange={(value) => value && setParam("classId", value)} options={options} placeholder="Select class" />
            </div>
            <DatePicker value={date} onChange={(value) => value && setParam("date", value)} />
            <Button
              type="button"
              variant="outline"
              icon={<CheckCheck />}
              disabled={locked || !students.length}
              onClick={() => setDraft(Object.fromEntries(students.map((s) => [s.id, "PRESENT" as AttendanceStatus])))}
            >
              All present
            </Button>
            <Button type="button" loading={save.isPending} disabled={locked || !students.length} onClick={() => save.mutate()}>
              {alreadyMarked ? "Update attendance" : "Save attendance"}
            </Button>
          </div>

          {data?.lockReason ? (
            <p className="flex items-center gap-2 rounded-2xl bg-line/50 px-4 py-3 text-sm text-muted-foreground" role="status">
              <Lock className="size-4" aria-hidden /> {data.lockReason}
            </p>
          ) : null}
          {save.error ? <p className="text-sm text-danger" role="alert">{save.error.message}</p> : null}
          <FetchingIndicator show={isFetching && Boolean(data)} label="Updating register" />

          {students.length ? (
            <dl className="flex flex-wrap gap-2 text-sm">
              {MARK_ORDER.map((s) => (
                <div key={s} className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1">
                  <dt className="text-muted-foreground">{markLabel(s)}</dt>
                  <dd className="font-medium tabular-nums">{counts[s]}</dd>
                </div>
              ))}
              {alreadyMarked ? <div className="rounded-full bg-success/15 px-3 py-1 text-success">Marked</div> : <div className="rounded-full bg-orange/15 px-3 py-1 text-orange">Not saved yet</div>}
            </dl>
          ) : null}

          {isError ? (
            <ErrorState title="Could not open this register" description={error instanceof Error ? error.message : "Try again."} onRetry={() => void refetch()} />
          ) : isPending && classId ? (
            <div className="overflow-hidden rounded-3xl bg-surface" aria-busy="true">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="flex items-center justify-between border-t border-line px-5 py-4 first:border-t-0">
                  <Skeleton className="h-8 w-48" />
                  <Skeleton className="h-8 w-64" />
                </div>
              ))}
            </div>
          ) : data && !students.length ? (
            <EmptyState title="No students in this class" description="Enrol students in this class to take attendance." />
          ) : (
            <ul className={cn("overflow-hidden rounded-3xl bg-surface", isFetching && "opacity-80")} aria-label="Students">
              {students.map((student, index) => (
                <li
                  key={student.id}
                  tabIndex={0}
                  onKeyDown={(event) => onRowKey(event, student.id)}
                  className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 outline-none first:border-t-0 focus-visible:bg-paper"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                    <div>
                      <p className="font-medium">
                        {student.firstName} {student.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{student.admissionNo}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5" role="radiogroup" aria-label={`Attendance for ${student.firstName}`}>
                    {MARK_ORDER.map((mark) => (
                      <button
                        key={mark}
                        type="button"
                        role="radio"
                        aria-checked={values[student.id] === mark}
                        disabled={locked}
                        title={markLabel(mark)}
                        tabIndex={-1}
                        onClick={() => setMark(student.id, mark)}
                        className={cn(
                          "h-9 min-w-10 rounded-full px-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                          values[student.id] === mark ? MARK_TONE[mark] : "bg-paper hover:bg-line",
                        )}
                      >
                        <span className="sm:hidden">{markCode(mark)}</span>
                        <span className="hidden sm:inline">{markLabel(mark)}</span>
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <Toast message={toast} />
    </div>
  );
}
