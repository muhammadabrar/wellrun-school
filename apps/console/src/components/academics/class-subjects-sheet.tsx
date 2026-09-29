import { useMutation } from "@tanstack/react-query";
import { SUBJECTS_BY_GRADE } from "@wellrun/shared";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { api, type AcademicClass, type AcademicSubject } from "@/lib/api";

export function ClassSubjectsSheet({
  cls,
  siblings,
  subjects,
  onClose,
  onSaved,
}: {
  cls: AcademicClass | null;
  /** Other sections of the same grade, so one list can be applied to all of them. */
  siblings: AcademicClass[];
  subjects: AcademicSubject[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void> | void;
}) {
  return (
    <Sheet open={Boolean(cls)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {cls ? <SubjectsForm key={cls.id} cls={cls} siblings={siblings} subjects={subjects} onClose={onClose} onSaved={onSaved} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function SubjectsForm({
  cls,
  siblings,
  subjects,
  onClose,
  onSaved,
}: {
  cls: AcademicClass;
  siblings: AcademicClass[];
  subjects: AcademicSubject[];
  onClose: () => void;
  onSaved: (message: string) => Promise<void> | void;
}) {
  const available = subjects.filter((subject) => subject.enabled || cls.subjectIds.includes(subject.id));
  const [selected, setSelected] = useState<string[]>(cls.subjectIds);
  const [allSections, setAllSections] = useState(siblings.length > 0);
  const [error, setError] = useState<string | null>(null);
  const gradeDefaults = SUBJECTS_BY_GRADE[cls.name]?.map((name) => name.toLowerCase()) ?? [];
  const label = `${cls.name} ${cls.section}`.trim();

  const save = useMutation({
    mutationFn: async () => {
      const targets = allSections ? [cls, ...siblings] : [cls];
      for (const target of targets) await api.setClassSubjects(target.id, selected);
      return targets.length;
    },
    onSuccess: (count) =>
      onSaved(count > 1 ? `Subjects saved for all ${count} sections of ${cls.name}.` : `Subjects saved for ${label}.`),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save subjects."),
  });

  function toggle(id: string, checked: boolean) {
    setSelected((current) => (checked ? [...current, id] : current.filter((value) => value !== id)));
  }

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        save.mutate();
      }}
    >
      <SheetHeader className="pr-12">
        <SheetTitle className="font-display text-2xl">Subjects for {label}</SheetTitle>
        <SheetDescription>These subjects appear when building this class's timetable.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4">
        {available.length ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setSelected(available.map((subject) => subject.id))}>
                Select all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelected([])}>
                Clear
              </Button>
              {gradeDefaults.length ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelected(available.filter((subject) => gradeDefaults.includes(subject.name.toLowerCase())).map((subject) => subject.id))}
                >
                  Usual {cls.name} subjects
                </Button>
              ) : null}
            </div>
            <ul className="grid grid-cols-2 gap-2" aria-label="Subjects">
              {available.map((subject) => (
                <li key={subject.id}>
                  <Field orientation="horizontal" className="rounded-xl border border-line px-3 py-2.5">
                    <Checkbox
                      id={`class-subject-${subject.id}`}
                      checked={selected.includes(subject.id)}
                      onCheckedChange={(checked) => toggle(subject.id, Boolean(checked))}
                    />
                    <FieldLabel htmlFor={`class-subject-${subject.id}`} className="font-normal">
                      {subject.name}
                    </FieldLabel>
                  </Field>
                </li>
              ))}
            </ul>
            {siblings.length ? (
              <Field orientation="horizontal">
                <Checkbox id="class-subject-all-sections" checked={allSections} onCheckedChange={(checked) => setAllSections(Boolean(checked))} />
                <FieldLabel htmlFor="class-subject-all-sections" className="font-normal">
                  Also use for {siblings.map((row) => `${row.name} ${row.section}`.trim()).join(", ")}
                </FieldLabel>
              </Field>
            ) : null}
          </>
        ) : (
          <p className="rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">
            Your school has no subjects yet. Add them in the Subjects tab, then come back to choose them for {label}.
          </p>
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <SheetFooter className="flex-row justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!available.length}>
          Save subjects
        </Button>
      </SheetFooter>
    </form>
  );
}
