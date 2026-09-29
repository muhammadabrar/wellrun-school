import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WEEKDAY_LABELS, type AttendanceSettingsInput } from "@wellrun/shared";
import { Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { formatDay } from "@/components/exams/exam-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useCampus } from "@/hooks/use-campus";
import { attendanceApi, attendanceKeys, type HolidayView } from "@/lib/attendance-api";
import { todayIso } from "@/lib/format";
import { cn } from "@/lib/utils";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const ALL_CAMPUSES = "__all";

export function AttendanceSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: attendanceKeys.settings, queryFn: attendanceApi.settings });
  const [edit, setEdit] = useState<Partial<AttendanceSettingsInput>>({});
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const save = useMutation({
    mutationFn: attendanceApi.saveSettings,
    onSuccess: (next) => {
      queryClient.setQueryData(attendanceKeys.settings, next);
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.root });
      setEdit({});
    },
  });

  if (isPending) return <LoadingState variant="form" />;
  if (isError || !data) {
    return <ErrorState title="Could not load attendance settings" description="Try again in a moment." onRetry={() => void refetch()} />;
  }
  const value = { ...data, ...edit };
  const toggleDay = (day: number) =>
    setEdit((prev) => {
      const days = prev.workingWeekdays ?? data.workingWeekdays;
      return { ...prev, workingWeekdays: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] };
    });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage(null);
    try {
      await save.mutateAsync({
        workingWeekdays: value.workingWeekdays,
        lowThresholdPct: Number(form.get("lowThresholdPct")),
        teacherEditDays: Number(form.get("teacherEditDays")),
        lateCountsPresent: value.lateCountsPresent,
        leaveCountsPresent: value.leaveCountsPresent,
      });
      setMessage({ tone: "ok", text: "Attendance settings saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not save settings." });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Attendance settings" description="School days, holidays, who can change marks and how percentages are worked out." />
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>School days</CardTitle>
            <CardDescription>Closed weekdays are shaded in the register and never count towards attendance.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Working weekdays">
              {WEEK_ORDER.map((day) => {
                const on = value.workingWeekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleDay(day)}
                    className={cn("h-10 min-w-14 rounded-full px-4 text-sm transition-colors", on ? "bg-indigo text-white" : "bg-paper text-muted-foreground hover:bg-line")}
                  >
                    {WEEKDAY_LABELS[day]}
                  </button>
                );
              })}
            </div>
            {!value.workingWeekdays.length ? <p className="mt-2 text-sm text-danger">Pick at least one school day.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Marking</CardTitle>
            <CardDescription>Attendance is taken by the teacher of each class's first period. Admins can mark or correct any class.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field>
              <FieldLabel htmlFor="edit-days">Teachers can change marks for</FieldLabel>
              <div className="flex items-center gap-2">
                <Input id="edit-days" name="teacherEditDays" type="number" min={0} max={31} required defaultValue={data.teacherEditDays} className="max-w-24" />
                <span className="text-sm text-muted-foreground">previous day(s)</span>
              </div>
              <FieldDescription>0 means today only. After that, marks are locked for teachers.</FieldDescription>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Percentages</CardTitle>
            <CardDescription>Used on student profiles, the register and reports.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field>
              <FieldLabel htmlFor="threshold">Low-attendance threshold</FieldLabel>
              <div className="flex items-center gap-2">
                <Input id="threshold" name="lowThresholdPct" type="number" min={0} max={100} step={1} required defaultValue={data.lowThresholdPct} className="max-w-24" />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <FieldDescription>Students under this are flagged on the overview, in reports and on their profile.</FieldDescription>
            </Field>
            <div className="flex items-start justify-between gap-4">
              <div>
                <FieldLabel htmlFor="late-present">Count late as present</FieldLabel>
                <FieldDescription>When off, late days count against attendance.</FieldDescription>
              </div>
              <Switch id="late-present" checked={value.lateCountsPresent} onCheckedChange={(checked) => setEdit((prev) => ({ ...prev, lateCountsPresent: checked }))} />
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <FieldLabel htmlFor="leave-present">Count leave as present</FieldLabel>
                <FieldDescription>When off, approved leave and excused days are left out of the percentage entirely.</FieldDescription>
              </div>
              <Switch id="leave-present" checked={value.leaveCountsPresent} onCheckedChange={(checked) => setEdit((prev) => ({ ...prev, leaveCountsPresent: checked }))} />
            </div>
          </CardContent>
        </Card>

        {message ? (
          <p className={message.tone === "ok" ? "text-sm text-primary" : "text-sm text-destructive"} role="status">
            {message.text}
          </p>
        ) : null}
        <Button type="submit" loading={save.isPending} disabled={!value.workingWeekdays.length}>
          Save settings
        </Button>
      </form>

      <HolidaysCard />
    </div>
  );
}

function HolidaysCard() {
  const queryClient = useQueryClient();
  const { campuses } = useCampus();
  const year = String(new Date().getFullYear());
  const [shownYear, setShownYear] = useState(year);
  const { data, isPending, isError, refetch } = useQuery({ queryKey: attendanceKeys.holidays(shownYear), queryFn: () => attendanceApi.holidays(shownYear) });
  const [editing, setEditing] = useState<HolidayView | "new" | null>(null);
  const [removing, setRemoving] = useState<HolidayView | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => attendanceApi.removeHoliday(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.root });
      setRemoving(null);
    },
  });
  const years = [Number(year) - 1, Number(year), Number(year) + 1].map(String);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Holidays</CardTitle>
          <CardDescription>Holidays lock attendance for that day and are left out of every percentage.</CardDescription>
        </div>
        <Button size="sm" icon={<CalendarPlus />} onClick={() => setEditing("new")}>
          Add holiday
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-1" role="tablist" aria-label="Year">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              role="tab"
              aria-selected={y === shownYear}
              onClick={() => setShownYear(y)}
              className={cn("rounded-full px-3 py-1 text-sm", y === shownYear ? "bg-ink text-white" : "text-muted-foreground hover:bg-paper")}
            >
              {y}
            </button>
          ))}
        </div>
        {isPending ? (
          <LoadingState variant="list" />
        ) : isError ? (
          <ErrorState title="Could not load holidays" description="Try again in a moment." onRetry={() => void refetch()} />
        ) : !data.length ? (
          <EmptyState title={`No holidays in ${shownYear}`} description="Add Eid, national days and school breaks so they don't count as absences." />
        ) : (
          <ul className="divide-y divide-line">
            {data.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{h.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {h.startsOn === h.endsOn ? formatDay(h.startsOn) : `${formatDay(h.startsOn)} – ${formatDay(h.endsOn)}`}
                    {h.campusName ? ` · ${h.campusName} only` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button size="icon-sm" variant="ghost" aria-label={`Edit ${h.name}`} onClick={() => setEditing(h)}>
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${h.name}`} onClick={() => setRemoving(h)}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <HolidaySheet
        key={editing === "new" ? "new" : (editing?.id ?? "closed")}
        holiday={editing}
        campuses={campuses}
        onClose={() => setEditing(null)}
        onSaved={(startsOn) => {
          void queryClient.invalidateQueries({ queryKey: attendanceKeys.root });
          setShownYear(startsOn.slice(0, 4));
          setEditing(null);
        }}
      />
      <Dialog
        open={Boolean(removing)}
        title={`Delete ${removing?.name ?? "holiday"}?`}
        description="Those days become normal school days again and count towards attendance."
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onClose={() => setRemoving(null)}
      />
    </Card>
  );
}

function HolidaySheet({
  holiday,
  campuses,
  onClose,
  onSaved,
}: {
  holiday: HolidayView | "new" | null;
  campuses: { id: string; name: string }[];
  onClose: () => void;
  onSaved: (startsOn: string) => void;
}) {
  const existing = holiday && holiday !== "new" ? holiday : null;
  const [name, setName] = useState(existing?.name ?? "");
  const [startsOn, setStartsOn] = useState(existing?.startsOn ?? todayIso());
  const [endsOn, setEndsOn] = useState(existing?.endsOn ?? todayIso());
  const [campusId, setCampusId] = useState(existing?.campusId ?? ALL_CAMPUSES);
  const save = useMutation({
    mutationFn: () => {
      const payload = { name, startsOn, endsOn: endsOn < startsOn ? startsOn : endsOn, campusId: campusId === ALL_CAMPUSES ? null : campusId };
      return existing ? attendanceApi.updateHoliday(existing.id, payload) : attendanceApi.createHoliday(payload);
    },
    onSuccess: () => onSaved(startsOn),
  });

  return (
    <Sheet open={Boolean(holiday)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-12">
          <SheetTitle className="font-display text-2xl">{existing ? "Edit holiday" : "Add holiday"}</SheetTitle>
          <SheetDescription>One day or a whole break. Attendance can't be marked on these days.</SheetDescription>
        </SheetHeader>
        <form
          className="flex flex-col gap-5 px-4 pb-6"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field>
            <FieldLabel htmlFor="holiday-name">Name</FieldLabel>
            <Input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="e.g. Eid ul Adha" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>From</FieldLabel>
              <DatePicker value={startsOn} onChange={(v) => v && setStartsOn(v)} />
            </Field>
            <Field>
              <FieldLabel>To</FieldLabel>
              <DatePicker value={endsOn < startsOn ? startsOn : endsOn} onChange={(v) => v && setEndsOn(v)} />
            </Field>
          </div>
          {campuses.length > 1 ? (
            <Field>
              <FieldLabel>Applies to</FieldLabel>
              <FormSelect
                value={campusId}
                onValueChange={(v) => setCampusId(v ?? ALL_CAMPUSES)}
                options={[{ value: ALL_CAMPUSES, label: "Every campus" }, ...campuses.map((c) => ({ value: c.id, label: c.name }))]}
              />
            </Field>
          ) : null}
          {save.error ? <p className="text-sm text-danger" role="alert">{save.error.message}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" loading={save.isPending} disabled={!name.trim()}>
              {existing ? "Save holiday" : "Add holiday"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
