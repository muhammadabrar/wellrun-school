import { useMutation } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { FormSelect } from "@/components/form/form-select";
import { TimePicker } from "@/components/form/time-picker";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, type BellSchedule, type GenerateTimetableResult } from "@/lib/api";

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

export function GenerateSheet({
  open,
  classIds,
  campusName,
  hasPeriods,
  onClose,
  onDone,
}: {
  open: boolean;
  classIds: string[];
  campusName: string;
  hasPeriods: boolean;
  onClose: () => void;
  onDone: (result: GenerateTimetableResult) => Promise<void> | void;
}) {
  const [days, setDays] = useState("5");
  const [mode, setMode] = useState<"fill_empty" | "replace">("fill_empty");
  const [schedule, setSchedule] = useState<BellSchedule>({
    startTime: "08:00",
    periodMinutes: 40,
    periodsPerDay: 8,
    breakAfter: 4,
    breakMinutes: 20,
  });
  const [error, setError] = useState<string | null>(null);

  const generate = useMutation({
    mutationFn: () =>
      api.generateTimetable({
        classIds,
        weekdays: range(1, Number(days)),
        mode,
        schedule: hasPeriods ? undefined : schedule,
      }),
    onSuccess: (result) => onDone(result),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not build the timetable."),
  });

  const numberOptions = (values: number[], unit: string) => values.map((value) => ({ value: String(value), label: `${value} ${unit}` }));

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <form
          className="flex h-full flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            generate.mutate();
          }}
        >
          <SheetHeader className="pr-12">
            <SheetTitle className="font-display text-2xl">Generate timetables</SheetTitle>
            <SheetDescription>
              Builds a week for all {classIds.length} class{classIds.length === 1 ? "" : "es"}
              {campusName ? ` on ${campusName}` : ""}. You can change any lesson afterwards.
            </SheetDescription>
          </SheetHeader>
          <FieldGroup className="px-4">
            <Field>
              <FieldLabel htmlFor="generate-days">School days</FieldLabel>
              <FormSelect
                id="generate-days"
                value={days}
                onValueChange={(value) => setDays(value ?? "5")}
                options={[
                  { value: "5", label: "Monday to Friday" },
                  { value: "6", label: "Monday to Saturday" },
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="generate-mode">Classes that already have a timetable</FieldLabel>
              <FormSelect
                id="generate-mode"
                value={mode}
                onValueChange={(value) => setMode(value === "replace" ? "replace" : "fill_empty")}
                options={[
                  { value: "fill_empty", label: "Keep them — only fill empty classes" },
                  { value: "replace", label: "Replace them with a new timetable" },
                ]}
              />
              {mode === "replace" ? (
                <FieldDescription className="text-orange">Every lesson in these classes, including ones you placed by hand, is replaced.</FieldDescription>
              ) : null}
            </Field>

            {!hasPeriods ? (
              <FieldSet>
                <FieldLegend>Bell schedule</FieldLegend>
                <FieldDescription>Your school has no periods yet. We'll create these for every class — edit them later in Bell schedule.</FieldDescription>
                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <FieldLabel htmlFor="generate-start">First period starts</FieldLabel>
                    <TimePicker id="generate-start" value={schedule.startTime} onChange={(startTime) => setSchedule({ ...schedule, startTime })} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="generate-length">Period length</FieldLabel>
                    <FormSelect
                      id="generate-length"
                      value={String(schedule.periodMinutes)}
                      onValueChange={(value) => setSchedule({ ...schedule, periodMinutes: Number(value) })}
                      options={numberOptions([30, 35, 40, 45, 50, 60], "min")}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="generate-count">Periods a day</FieldLabel>
                    <FormSelect
                      id="generate-count"
                      value={String(schedule.periodsPerDay)}
                      onValueChange={(value) => {
                        const periodsPerDay = Number(value);
                        setSchedule({ ...schedule, periodsPerDay, breakAfter: Math.min(schedule.breakAfter, periodsPerDay - 1) });
                      }}
                      options={numberOptions(range(4, 10), "periods")}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="generate-break-after">Break</FieldLabel>
                    <FormSelect
                      id="generate-break-after"
                      value={String(schedule.breakAfter)}
                      onValueChange={(value) => setSchedule({ ...schedule, breakAfter: Number(value) })}
                      options={[
                        { value: "0", label: "No break" },
                        ...range(1, schedule.periodsPerDay - 1).map((value) => ({ value: String(value), label: `After period ${value}` })),
                      ]}
                    />
                  </Field>
                  {schedule.breakAfter ? (
                    <Field>
                      <FieldLabel htmlFor="generate-break-length">Break length</FieldLabel>
                      <FormSelect
                        id="generate-break-length"
                        value={String(schedule.breakMinutes)}
                        onValueChange={(value) => setSchedule({ ...schedule, breakMinutes: Number(value) })}
                        options={numberOptions([10, 15, 20, 25, 30, 45], "min")}
                      />
                    </Field>
                  ) : null}
                </div>
              </FieldSet>
            ) : null}

            <div className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">How lessons are chosen</p>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>Every day follows the same pattern — if period 1 is Art on Monday, it's Art all week.</li>
                <li>Subjects come from each class's subject list, or the usual subjects for that grade.</li>
                <li>With more periods than subjects, Maths, English and Urdu get the extra periods. With fewer, they're kept first.</li>
                <li>Teachers assigned to a class and subject are placed first, and never in two classes at once.</li>
              </ul>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </FieldGroup>
          <SheetFooter className="flex-row justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" icon={<Sparkles />} loading={generate.isPending} disabled={!classIds.length}>
              Generate
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
