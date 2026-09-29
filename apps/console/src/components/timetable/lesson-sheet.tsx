import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { FormSelect } from "@/components/form/form-select";
import { formatClock } from "@/components/form/time-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, type Staff, type Timetable, type TimetablePeriod } from "@/lib/api";

export const WEEKDAYS = [
  { id: 1, short: "Mon", label: "Monday" },
  { id: 2, short: "Tue", label: "Tuesday" },
  { id: 3, short: "Wed", label: "Wednesday" },
  { id: 4, short: "Thu", label: "Thursday" },
  { id: 5, short: "Fri", label: "Friday" },
  { id: 6, short: "Sat", label: "Saturday" },
] as const;

const NO_TEACHER = "none";

export type LessonSlot = { weekday: number; period: TimetablePeriod };

type LessonSheetProps = {
  slot: LessonSlot | null;
  cls: { id: string; name: string; section: string };
  grid: Timetable;
  staff: Staff[];
  weekdays: number[];
  onClose: () => void;
  onSaved: (message: string) => void;
};

export function LessonSheet(props: LessonSheetProps) {
  const { slot, onClose } = props;
  return (
    <Sheet open={Boolean(slot)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-md">
        {slot ? <LessonForm key={`${slot.weekday}-${slot.period.id}`} {...props} slot={slot} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function LessonForm({ slot, cls, grid, staff, weekdays, onClose, onSaved }: LessonSheetProps & { slot: LessonSlot }) {
  const classId = cls.id;
  const classLabel = `${cls.name} ${cls.section}`.trim();
  const existing = grid.lessons.find((lesson) => lesson.weekday === slot.weekday && lesson.periodId === slot.period.id) ?? null;
  const [subject, setSubject] = useState(existing?.subject ?? "");
  const [staffId, setStaffId] = useState(existing?.staffId ?? NO_TEACHER);
  const [repeat, setRepeat] = useState(true);
  const [override, setOverride] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const day = WEEKDAYS.find((row) => row.id === slot.weekday);

  const subjectOptions = [...new Set([...grid.subjects, ...(existing ? [existing.subject] : [])])]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ value: name, label: name }));

  // Teachers already assigned to this class for the chosen subject are listed first.
  const teachesHere = (person: Staff) =>
    person.assignments.some(
      (row) =>
        row.class.name === cls.name &&
        row.class.section === cls.section &&
        (!subject || !row.subject || row.subject.toLowerCase() === subject.toLowerCase()),
    );
  const teacherOptions = [
    { value: NO_TEACHER, label: "No teacher yet" },
    ...[...staff]
      .sort((a, b) => Number(teachesHere(b)) - Number(teachesHere(a)) || a.name.localeCompare(b.name))
      .map((person) => ({
        value: person.id,
        label: teachesHere(person) ? `${person.name} · teaches ${classLabel}` : person.name,
      })),
  ];

  const save = useMutation({
    mutationFn: async () => {
      const days = repeat ? weekdays : [slot.weekday];
      for (const weekday of days) {
        await api.saveLesson({
          classId,
          weekday,
          periodId: slot.period.id,
          subject,
          staffId: staffId === NO_TEACHER ? undefined : staffId,
          override,
        });
      }
      return days.length;
    },
    onSuccess: (count) => onSaved(count > 1 ? `${subject} set for ${slot.period.label} on ${count} days.` : `${subject} saved.`),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save this lesson."),
  });

  const remove = useMutation({
    mutationFn: () => api.removeLesson(existing!.id),
    onSuccess: () => onSaved("Lesson removed."),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not remove this lesson."),
  });

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!subject) {
          setError("Choose a subject.");
          return;
        }
        setError(null);
        save.mutate();
      }}
    >
      <SheetHeader className="pr-12">
        <SheetTitle className="font-display text-2xl">
          {day?.label} · {slot.period.label}
        </SheetTitle>
        <SheetDescription>
          {classLabel} · {formatClock(slot.period.startTime)}–{formatClock(slot.period.endTime)}
        </SheetDescription>
      </SheetHeader>
      <FieldGroup className="px-4">
        <Field>
          <FieldLabel htmlFor="lesson-subject">Subject</FieldLabel>
          <FormSelect id="lesson-subject" value={subject || null} onValueChange={(value) => setSubject(value ?? "")} placeholder="Choose a subject" options={subjectOptions} />
          {!subjectOptions.length ? (
            <FieldDescription>No subjects yet. Add them in Classes &amp; subjects → Subjects.</FieldDescription>
          ) : (
            <FieldDescription>Subjects come from this class's subject list in Classes &amp; subjects.</FieldDescription>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="lesson-teacher">Teacher</FieldLabel>
          <FormSelect id="lesson-teacher" value={staffId} onValueChange={(value) => setStaffId(value ?? NO_TEACHER)} options={teacherOptions} />
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="lesson-repeat" checked={repeat} onCheckedChange={(checked) => setRepeat(Boolean(checked))} />
          <FieldLabel htmlFor="lesson-repeat" className="font-normal">
            Use this for {slot.period.label} on every school day
          </FieldLabel>
        </Field>
        <Field orientation="horizontal">
          <Checkbox id="lesson-override" checked={override} onCheckedChange={(checked) => setOverride(Boolean(checked))} />
          <FieldLabel htmlFor="lesson-override" className="font-normal">
            Allow double-booking this teacher
          </FieldLabel>
        </Field>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </FieldGroup>
      <SheetFooter className="flex-row flex-wrap justify-between">
        {existing ? (
          <Button type="button" variant="destructive" loading={remove.isPending} disabled={save.isPending} onClick={() => remove.mutate()}>
            Remove lesson
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={save.isPending} disabled={remove.isPending}>
            Save lesson
          </Button>
        </div>
      </SheetFooter>
    </form>
  );
}
