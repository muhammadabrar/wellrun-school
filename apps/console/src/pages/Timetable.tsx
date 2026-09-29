import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader } from "@wellrun/ui";
import { BellRing, ChevronLeft, ChevronRight, Plus, Sparkles, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { classSortIndex } from "@wellrun/shared";
import { FormSelect } from "@/components/form/form-select";
import { formatClock } from "@/components/form/time-picker";
import { BellScheduleSheet } from "@/components/timetable/bell-schedule-sheet";
import { GenerateSheet } from "@/components/timetable/generate-sheet";
import { LessonSheet, WEEKDAYS, type LessonSlot } from "@/components/timetable/lesson-sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCampus } from "@/hooks/use-campus";
import { api, currentUser, type GenerateTimetableResult } from "@/lib/api";
import { queryKeys } from "@/lib/query";

export function TimetablePage() {
  const queryClient = useQueryClient();
  const { classes: campusClasses, active } = useCampus();
  const [params, setParams] = useSearchParams();
  const admin = currentUser()?.role === "SCHOOL_ADMIN";
  const [slot, setSlot] = useState<LessonSlot | null>(null);
  const [bellOpen, setBellOpen] = useState(false);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saturdayPref, setSaturdayPref] = useState<boolean | null>(null);

  const classes = useMemo(
    () =>
      [...campusClasses].sort(
        (a, b) => classSortIndex(a.name) - classSortIndex(b.name) || a.name.localeCompare(b.name) || a.section.localeCompare(b.section),
      ),
    [campusClasses],
  );
  const requested = params.get("classId");
  const cls = classes.find((row) => row.id === requested) ?? classes[0] ?? null;
  const classIndex = cls ? classes.indexOf(cls) : -1;

  const { data: grid, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: queryKeys.timetable(cls?.id),
    queryFn: () => api.timetable(cls?.id),
    enabled: Boolean(cls),
  });
  const { data: staff = [] } = useQuery({ queryKey: queryKeys.staff, queryFn: () => api.staff(), enabled: admin });

  function selectClass(id: string) {
    const next = new URLSearchParams(params);
    next.set("classId", id);
    setParams(next, { replace: true });
  }

  async function refreshTimetables() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["timetable"] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.academics }),
    ]);
  }

  async function onGenerated(result: GenerateTimetableResult) {
    setGenerateOpen(false);
    const parts = [
      result.classes
        ? `Timetable ready for ${result.classes} class${result.classes === 1 ? "" : "es"} (${result.lessons} lessons).`
        : "No classes needed a timetable.",
    ];
    if (result.skipped) parts.push(`${result.skipped} class${result.skipped === 1 ? "" : "es"} kept their existing timetable.`);
    if (result.withoutTeacher) parts.push(`${result.withoutTeacher} lessons still need a teacher — click one to assign.`);
    if (result.tooManySubjects.length)
      parts.push(`${result.tooManySubjects.join(", ")} ha${result.tooManySubjects.length === 1 ? "s" : "ve"} more subjects than periods a day, so some subjects were left out — add a period or swap one in by hand.`);
    if (result.noSubjects.length) parts.push(`Add subjects for ${result.noSubjects.join(", ")} in Classes & subjects.`);
    setMessage(parts.join(" "));
    await refreshTimetables();
  }

  const periods = grid?.periods ?? [];
  const teaching = periods.filter((period) => !period.isBreak);
  const hasSaturday = Boolean(grid?.lessons.some((lesson) => lesson.weekday === 6));
  const showSaturday = saturdayPref ?? hasSaturday;
  const days = WEEKDAYS.filter((day) => day.id <= (showSaturday ? 6 : 5));
  const lessonAt = (weekday: number, periodId: string) => grid?.lessons.find((lesson) => lesson.weekday === weekday && lesson.periodId === periodId);
  const visibleLessons = (grid?.lessons ?? []).filter((lesson) => lesson.weekday <= days.length);
  const slots = teaching.length * days.length;
  const withoutTeacher = visibleLessons.filter((lesson) => !lesson.staffId).length;
  const label = cls ? `${cls.name} ${cls.section}`.trim() : "";

  const header = (
    <PageHeader
      title="Timetable"
      description="Pick a class to see its week. Click any period to change the subject or teacher."
      actions={
        admin ? (
          <>
            <Button type="button" variant="outline" icon={<BellRing />} onClick={() => setBellOpen(true)} disabled={!grid && Boolean(cls)}>
              Bell schedule
            </Button>
            <Button type="button" icon={<Sparkles />} onClick={() => setGenerateOpen(true)} disabled={!classes.length || (!grid && Boolean(cls))}>
              Generate for all classes
            </Button>
          </>
        ) : null
      }
    />
  );

  const sheets = admin ? (
    <>
      <BellScheduleSheet open={bellOpen} periods={periods} onClose={() => setBellOpen(false)} onChanged={refreshTimetables} />
      <GenerateSheet
        open={generateOpen}
        classIds={classes.map((row) => row.id)}
        campusName={active?.name ?? ""}
        hasPeriods={teaching.length > 0}
        onClose={() => setGenerateOpen(false)}
        onDone={onGenerated}
      />
    </>
  ) : null;

  if (!cls) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState
          title="No classes yet"
          description="Timetables are built per class. Add your classes and sections first."
          action={admin ? <Button render={<Link to="/academics?tab=classes" />}>Add classes</Button> : undefined}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      {sheets}
      {message ? (
        <p className="rounded-2xl bg-primary/5 px-4 py-3 text-sm text-primary" role="status">
          {message}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-4 rounded-3xl bg-surface p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex w-64 flex-col gap-2">
            <Label htmlFor="timetable-class">Class</Label>
            <FormSelect
              id="timetable-class"
              value={cls.id}
              onValueChange={(value) => value && selectClass(value)}
              options={classes.map((row) => ({ value: row.id, label: `${row.name} ${row.section}`.trim() }))}
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous class"
            disabled={classIndex <= 0}
            onClick={() => selectClass(classes[classIndex - 1].id)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next class"
            disabled={classIndex >= classes.length - 1}
            onClick={() => selectClass(classes[classIndex + 1].id)}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" icon={<Users />} render={<Link to={`/students?className=${encodeURIComponent(cls.name)}&section=${encodeURIComponent(cls.section)}`} />}>
            Students
          </Button>
          {admin ? (
            <Button variant="ghost" size="sm" icon={<Wallet />} render={<Link to={`/fees/structures?class=${encodeURIComponent(cls.name)}`} />}>
              Fee structure
            </Button>
          ) : null}
          <div className="ml-2 flex items-center gap-2">
            <Switch id="timetable-saturday" checked={showSaturday} onCheckedChange={(checked) => setSaturdayPref(checked)} />
            <Label htmlFor="timetable-saturday" className="font-normal">
              Saturday
            </Label>
          </div>
        </div>
      </div>

      <FetchingIndicator show={isFetching && !isPending} label="Updating timetable" />

      {isError ? (
        <ErrorState title={`Couldn't load the timetable for ${label}`} description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !grid ? (
        <LoadingState variant="table" />
      ) : !teaching.length ? (
        <EmptyState
          title="No periods yet"
          description={
            admin
              ? "Set when each period starts and ends, or let us build a standard school day and fill every class in one click."
              : "Your school hasn't set up its periods yet. Ask an admin to build the timetable."
          }
          action={
            admin ? (
              <div className="flex flex-wrap justify-center gap-2">
                <Button type="button" icon={<Sparkles />} onClick={() => setGenerateOpen(true)}>
                  Generate for all classes
                </Button>
                <Button type="button" variant="outline" onClick={() => setBellOpen(true)}>
                  Set up periods
                </Button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <section aria-labelledby="timetable-title" className="rounded-3xl bg-surface p-4">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 px-1">
            <h2 id="timetable-title" className="font-display text-2xl">
              {label}
            </h2>
            <p className="text-sm text-muted-foreground">
              {visibleLessons.length} of {slots} periods planned
              {withoutTeacher ? <span className="text-orange"> · {withoutTeacher} without a teacher</span> : null}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-176 table-fixed border-separate border-spacing-1 text-left text-sm">
              <thead>
                <tr>
                  <th scope="col" className="w-32 px-2 py-2 font-medium text-muted-foreground">
                    Period
                  </th>
                  {days.map((day) => (
                    <th key={day.id} scope="col" className="px-2 py-2 font-medium">
                      <abbr title={day.label} className="no-underline">
                        {day.short}
                      </abbr>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {periods.map((period) => (
                  <tr key={period.id}>
                    <th scope="row" className="px-2 py-2 align-top font-medium">
                      {period.label}
                      <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                        {formatClock(period.startTime)}–{formatClock(period.endTime)}
                      </span>
                    </th>
                    {period.isBreak ? (
                      <td colSpan={days.length} className="rounded-xl bg-muted/60 px-3 py-2 text-center text-xs tracking-wide text-muted-foreground uppercase">
                        {period.label}
                      </td>
                    ) : (
                      days.map((day) => {
                        const lesson = lessonAt(day.id, period.id);
                        const content = lesson ? (
                          <>
                            <span className="block truncate font-medium">{lesson.subject}</span>
                            <span className={`block truncate text-xs ${lesson.staff ? "text-muted-foreground" : "text-orange"}`}>
                              {lesson.staff?.name ?? "No teacher"}
                            </span>
                          </>
                        ) : admin ? (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Plus className="size-3.5" aria-hidden /> Add
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        );
                        const tone = lesson ? "bg-primary/5" : "border border-dashed border-line";
                        return (
                          <td key={day.id} className="p-0 align-top">
                            {admin ? (
                              <button
                                type="button"
                                onClick={() => setSlot({ weekday: day.id, period })}
                                aria-label={`${day.label}, ${period.label}: ${lesson ? `${lesson.subject}${lesson.staff ? ` with ${lesson.staff.name}` : ""}` : "empty"}. Edit`}
                                className={`h-full min-h-14 w-full rounded-xl px-3 py-2 text-left transition-colors hover:bg-primary/10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none ${tone}`}
                              >
                                {content}
                              </button>
                            ) : (
                              <div className={`min-h-14 rounded-xl px-3 py-2 ${tone}`}>{content}</div>
                            )}
                          </td>
                        );
                      })
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {admin && !visibleLessons.length ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-3 text-sm">
              <span>{label} has no lessons yet. Fill it by clicking periods, or generate every class at once.</span>
              <Button type="button" size="sm" icon={<Sparkles />} onClick={() => setGenerateOpen(true)}>
                Generate for all classes
              </Button>
            </div>
          ) : null}
        </section>
      )}

      {admin && grid ? (
        <LessonSheet
          slot={slot}
          cls={cls}
          grid={grid}
          staff={staff}
          weekdays={days.map((day) => day.id)}
          onClose={() => setSlot(null)}
          onSaved={async (text) => {
            setSlot(null);
            setMessage(text);
            await refreshTimetables();
          }}
        />
      ) : null}
    </div>
  );
}
