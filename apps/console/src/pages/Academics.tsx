import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { CLASS_TEMPLATE_LABELS, SUBJECT_TEMPLATES, classSortIndex, type ClassTemplateId } from "@wellrun/shared";
import { BookOpen, CalendarDays, ClipboardCheck, Pencil, Plus, Sparkles, Trash2, Users, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ClassSubjectsSheet } from "@/components/academics/class-subjects-sheet";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCampus } from "@/hooks/use-campus";
import { api, type AcademicClass, type AcademicSubject, type Academics } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { refreshSchoolContext, readYearId } from "@/lib/school-context";
import { nextSection } from "@/lib/setup-helpers";

type Notify = (message: string, tone?: "ok" | "error") => void;

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function AcademicsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "subjects" ? "subjects" : "classes";
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.academics, queryFn: api.academics });
  const { campusId, active } = useCampus();
  const [notice, setNotice] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const notify: Notify = (message, tone = "ok") => setNotice({ message, tone });

  async function reload(classesChanged = false) {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.academics }),
      classesChanged ? refreshSchoolContext() : queryClient.invalidateQueries({ queryKey: ["timetable"] }),
    ]);
  }

  const yearId = readYearId() || data?.years.find((year) => year.current)?.id || data?.years[0]?.id || "";
  const classes = useMemo(
    () =>
      (data?.classes ?? [])
        .filter((cls) => (!yearId || cls.yearId === yearId) && (!campusId || !cls.campusId || cls.campusId === campusId))
        .sort(
          (a, b) => classSortIndex(a.name) - classSortIndex(b.name) || a.name.localeCompare(b.name) || a.section.localeCompare(b.section),
        ),
    [data?.classes, yearId, campusId],
  );

  if (isPending) return <LoadingState variant="table" />;
  if (isError || !data) {
    return <ErrorState title="Couldn't load classes and subjects" description="Check your connection and try again." onRetry={() => void refetch()} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Classes & subjects"
        description={`Manage the classes${active ? ` on ${active.name}` : ""} and the subjects they study. Jump from any class to its timetable, students or fees.`}
      />
      {notice ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${notice.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/5 text-primary"}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      ) : null}
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          next.set("tab", String(value));
          setParams(next, { replace: true });
          setNotice(null);
        }}
      >
        <TabsList>
          <TabsTrigger value="classes">
            Classes <span className="ml-1 text-xs opacity-70 tabular-nums">{classes.length}</span>
          </TabsTrigger>
          <TabsTrigger value="subjects">
            Subjects <span className="ml-1 text-xs opacity-70 tabular-nums">{data.subjects.length}</span>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="classes" className="mt-4">
          <ClassesTab classes={classes} subjects={data.subjects} yearId={yearId} campusId={campusId} notify={notify} reload={reload} />
        </TabsContent>
        <TabsContent value="subjects" className="mt-4">
          <SubjectsTab data={data} notify={notify} reload={reload} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────────── Classes ───────────────────────────── */

function ClassesTab({
  classes,
  subjects,
  yearId,
  campusId,
  notify,
  reload,
}: {
  classes: AcademicClass[];
  subjects: AcademicSubject[];
  yearId: string;
  campusId: string;
  notify: Notify;
  reload: (classesChanged?: boolean) => Promise<void>;
}) {
  const [subjectsFor, setSubjectsFor] = useState<AcademicClass | null>(null);
  const [deleting, setDeleting] = useState<AcademicClass | null>(null);
  const grades = useMemo(() => {
    const map = new Map<string, AcademicClass[]>();
    for (const cls of classes) map.set(cls.name, [...(map.get(cls.name) ?? []), cls]);
    return [...map.entries()];
  }, [classes]);
  const subjectName = useMemo(() => new Map(subjects.map((subject) => [subject.id, subject.name])), [subjects]);

  const remove = useMutation({
    mutationFn: (cls: AcademicClass) => api.removeClass(cls.id),
    onSuccess: async (_result, cls) => {
      setDeleting(null);
      notify(`${cls.name} ${cls.section} deleted.`);
      await reload(true);
    },
    onError: (err) => {
      setDeleting(null);
      notify(errorText(err, "Could not delete this class."), "error");
    },
  });

  const students = classes.reduce((sum, cls) => sum + cls.students, 0);
  const withTimetable = classes.filter((cls) => cls.lessons > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <AddClassForm yearId={yearId} campusId={campusId} notify={notify} reload={reload} existing={classes} />

      {!classes.length ? (
        <EmptyState title="No classes yet" description="Add your first class above — for example Grade 1 with sections A and B. Students, fees and timetables are all organised by class." />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Classes" value={String(classes.length)} />
            <Stat label="Students" value={students.toLocaleString()} />
            <Stat label="With a timetable" value={`${withTimetable} / ${classes.length}`} />
            <div className="flex items-center rounded-3xl bg-surface p-4">
              <Button variant="outline" className="w-full" icon={<Sparkles />} render={<Link to="/timetable" />}>
                {withTimetable < classes.length ? "Build timetables" : "Open timetables"}
              </Button>
            </div>
          </dl>
          <div className="flex flex-col gap-4">
            {grades.map(([name, sections]) => (
              <GradeCard
                key={name}
                name={name}
                sections={sections}
                subjectName={subjectName}
                yearId={yearId}
                campusId={campusId}
                notify={notify}
                reload={reload}
                onSubjects={setSubjectsFor}
                onDelete={setDeleting}
              />
            ))}
          </div>
        </>
      )}

      <ClassSubjectsSheet
        cls={subjectsFor}
        siblings={subjectsFor ? classes.filter((cls) => cls.name === subjectsFor.name && cls.id !== subjectsFor.id) : []}
        subjects={subjects}
        onClose={() => setSubjectsFor(null)}
        onSaved={async (message) => {
          setSubjectsFor(null);
          notify(message);
          await reload();
        }}
      />
      <Dialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? ""} ${deleting?.section ?? ""}?`}
        description="Its timetable and subject list are deleted too. Fee structures and past records stay. This can't be undone."
        confirmLabel="Delete class"
        danger
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-surface p-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-display text-2xl tabular-nums">{value}</dd>
    </div>
  );
}

function AddClassForm({
  yearId,
  campusId,
  existing,
  notify,
  reload,
}: {
  yearId: string;
  campusId: string;
  existing: AcademicClass[];
  notify: Notify;
  reload: (classesChanged?: boolean) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [sections, setSections] = useState("A");
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: async () => {
      const className = name.trim();
      const list = [...new Set(sections.split(/[\s,]+/).map((value) => value.trim().toUpperCase()).filter(Boolean))];
      const taken = existing.filter((cls) => cls.name.toLowerCase() === className.toLowerCase()).map((cls) => cls.section);
      const fresh = (list.length ? list : ["A"]).filter((section) => !taken.includes(section));
      if (!fresh.length) throw new Error(`${className} already has ${list.join(", ")}.`);
      for (const section of fresh) await api.createClass({ name: className, section, yearId, campusId: campusId || undefined });
      return { className, fresh };
    },
    onSuccess: async ({ className, fresh }) => {
      setName("");
      setSections("A");
      notify(`${className} added with section${fresh.length === 1 ? "" : "s"} ${fresh.join(", ")}.`);
      await reload(true);
    },
    onError: (err) => setError(errorText(err, "Could not add this class.")),
  });

  return (
    <form
      className="grid gap-4 rounded-3xl bg-surface p-5 sm:grid-cols-[1fr_12rem_auto] sm:items-start"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) {
          setError("Enter a class name.");
          return;
        }
        if (!yearId) {
          setError("Create an academic year first.");
          return;
        }
        setError(null);
        create.mutate();
      }}
    >
      <Field data-invalid={Boolean(error) || undefined}>
        <FieldLabel htmlFor="new-class-name">New class</FieldLabel>
        <Input id="new-class-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Grade 6" capitalize="words" aria-invalid={Boolean(error) || undefined} />
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </Field>
      <Field>
        <FieldLabel htmlFor="new-class-sections">Sections</FieldLabel>
        <Input id="new-class-sections" value={sections} onChange={(event) => setSections(event.target.value)} placeholder="A, B, C" capitalize="none" />
        <FieldDescription>Separate with commas.</FieldDescription>
      </Field>
      <Button type="submit" icon={<Plus />} loading={create.isPending} className="sm:mt-6">
        Add class
      </Button>
    </form>
  );
}

function GradeCard({
  name,
  sections,
  subjectName,
  yearId,
  campusId,
  notify,
  reload,
  onSubjects,
  onDelete,
}: {
  name: string;
  sections: AcademicClass[];
  subjectName: Map<string, string>;
  yearId: string;
  campusId: string;
  notify: Notify;
  reload: (classesChanged?: boolean) => Promise<void>;
  onSubjects: (cls: AcademicClass) => void;
  onDelete: (cls: AcademicClass) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const rename = useMutation({
    mutationFn: async () => {
      for (const cls of sections) await api.updateClass(cls.id, { name: draft.trim() });
    },
    onSuccess: async () => {
      setEditing(false);
      notify(`${name} renamed to ${draft.trim()}.`);
      await reload(true);
    },
    onError: (err) => notify(errorText(err, "Could not rename this class."), "error"),
  });
  const addSection = useMutation({
    mutationFn: () =>
      api.createClass({ name, section: nextSection(sections.map((cls) => cls.section)), yearId, campusId: campusId || undefined }),
    onSuccess: async () => {
      notify(`Section added to ${name}.`);
      await reload(true);
    },
    onError: (err) => notify(errorText(err, "Could not add a section."), "error"),
  });
  const students = sections.reduce((sum, cls) => sum + cls.students, 0);

  return (
    <section aria-label={name} className="rounded-3xl bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim() && draft.trim() !== name) rename.mutate();
              else setEditing(false);
            }}
          >
            <Input aria-label={`Rename ${name}`} value={draft} onChange={(event) => setDraft(event.target.value)} capitalize="words" className="w-56" autoFocus />
            <Button type="submit" size="sm" loading={rename.isPending}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(name);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-2xl">{name}</h2>
            <span className="text-sm text-muted-foreground">
              {sections.length} section{sections.length === 1 ? "" : "s"} · {students} student{students === 1 ? "" : "s"}
            </span>
          </div>
        )}
        {!editing ? (
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" size="sm" icon={<Pencil />} onClick={() => setEditing(true)}>
              Rename
            </Button>
            <Button type="button" variant="outline" size="sm" icon={<Plus />} loading={addSection.isPending} onClick={() => addSection.mutate()}>
              Add section
            </Button>
          </div>
        ) : null}
      </div>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {sections.map((cls) => (
          <SectionCard key={cls.id} cls={cls} subjectName={subjectName} onSubjects={() => onSubjects(cls)} onDelete={() => onDelete(cls)} />
        ))}
      </ul>
    </section>
  );
}

function SectionCard({
  cls,
  subjectName,
  onSubjects,
  onDelete,
}: {
  cls: AcademicClass;
  subjectName: Map<string, string>;
  onSubjects: () => void;
  onDelete: () => void;
}) {
  const label = `${cls.name} ${cls.section}`.trim();
  const hasTimetable = cls.lessons > 0;
  const subjects = hasTimetable
    ? cls.timetableSubjects
    : cls.subjectIds.map((id) => subjectName.get(id)).filter((value): value is string => Boolean(value)).sort((a, b) => a.localeCompare(b));
  const studentsLink = `/students?className=${encodeURIComponent(cls.name)}&section=${encodeURIComponent(cls.section)}`;

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">Section {cls.section}</h3>
          {hasTimetable ? <Badge tone="success">Timetable ready</Badge> : <Badge tone="warning">No timetable</Badge>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={cls.students ? `${label} has students — move them before deleting` : `Delete ${label}`}
          title={cls.students ? "Move its students to another class before deleting" : `Delete ${label}`}
          disabled={cls.students > 0}
          onClick={onDelete}
        >
          <Trash2 />
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Students</dt>
          <dd className="font-display text-xl tabular-nums">{cls.students}</dd>
        </div>
        <div className="rounded-xl bg-muted/50 px-3 py-2">
          <dt className="text-xs text-muted-foreground">Teachers</dt>
          <dd className="font-display text-xl tabular-nums">{cls.teachers.length}</dd>
        </div>
      </dl>

      {cls.teachers.length ? (
        <p className="text-sm text-muted-foreground">
          <span className="text-foreground">Teachers: </span>
          {cls.teachers.map((teacher) => teacher.name).join(", ")}
        </p>
      ) : null}

      <div>
        <p className="text-xs text-muted-foreground">{hasTimetable ? "Subjects on the timetable" : "Subjects"}</p>
        {subjects.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {subjects.map((subject) => (
              <li key={subject}>
                <Badge tone="indigo">{subject}</Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">None chosen — grade defaults are used when generating.</p>
        )}
      </div>

      <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
        <Button variant="outline" size="sm" icon={<CalendarDays />} render={<Link to={`/timetable?classId=${cls.id}`} />}>
          Timetable
        </Button>
        <Button variant="outline" size="sm" icon={<Users />} render={<Link to={studentsLink} />}>
          Students
        </Button>
        <Button variant="outline" size="sm" icon={<ClipboardCheck />} render={<Link to={`/attendance/register?classId=${cls.id}`} />}>
          Attendance
        </Button>
        <Button variant="outline" size="sm" icon={<Wallet />} render={<Link to={`/fees/structures?class=${encodeURIComponent(cls.name)}`} />}>
          Fee structure
        </Button>
        <Button type="button" variant="ghost" size="sm" icon={<BookOpen />} onClick={onSubjects}>
          Subjects
        </Button>
      </div>
    </li>
  );
}

/* ───────────────────────────── Subjects ───────────────────────────── */

function SubjectsTab({ data, notify, reload }: { data: Academics; notify: Notify; reload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [template, setTemplate] = useState<ClassTemplateId | null>(null);
  const [deleting, setDeleting] = useState<AcademicSubject | null>(null);

  const add = useMutation({
    mutationFn: () => api.saveSubject({ name: name.trim() }),
    onSuccess: async () => {
      notify(`${name.trim()} added.`);
      setName("");
      await reload();
    },
    onError: (err) => setError(errorText(err, "Could not add this subject.")),
  });
  const applyTemplate = useMutation({
    mutationFn: (id: ClassTemplateId) => api.applySubjects({ template: id }),
    onSuccess: async (_result, id) => {
      notify(`${CLASS_TEMPLATE_LABELS[id]} subjects added.`);
      setTemplate(null);
      await reload();
    },
    onError: (err) => notify(errorText(err, "Could not load these subjects."), "error"),
  });
  const remove = useMutation({
    mutationFn: (subject: AcademicSubject) => api.removeSubject(subject.id),
    onSuccess: async (_result, subject) => {
      setDeleting(null);
      notify(`${subject.name} deleted.`);
      await reload();
    },
    onError: (err) => {
      setDeleting(null);
      notify(errorText(err, "Could not delete this subject."), "error");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="flex flex-col gap-3 rounded-3xl bg-surface p-5"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              setError("Enter a subject name.");
              return;
            }
            if (data.subjects.some((subject) => subject.name.toLowerCase() === name.trim().toLowerCase())) {
              setError(`${name.trim()} is already on the list.`);
              return;
            }
            setError(null);
            add.mutate();
          }}
        >
          <Field data-invalid={Boolean(error) || undefined}>
            <FieldLabel htmlFor="new-subject">Add a subject</FieldLabel>
            <div className="flex gap-2">
              <Input id="new-subject" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Computer Science" capitalize="words" aria-invalid={Boolean(error) || undefined} />
              <Button type="submit" icon={<Plus />} loading={add.isPending}>
                Add
              </Button>
            </div>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
          </Field>
        </form>
        <div className="flex flex-col gap-3 rounded-3xl bg-surface p-5">
          <Field>
            <FieldLabel htmlFor="subject-template">Add a ready-made list</FieldLabel>
            <div className="flex gap-2">
              <FormSelect
                id="subject-template"
                value={template}
                onValueChange={(value) => setTemplate(value as ClassTemplateId | null)}
                placeholder="Choose a curriculum"
                options={(Object.keys(SUBJECT_TEMPLATES) as ClassTemplateId[]).map((id) => ({ value: id, label: CLASS_TEMPLATE_LABELS[id] }))}
              />
              <Button type="button" variant="outline" disabled={!template} loading={applyTemplate.isPending} onClick={() => template && applyTemplate.mutate(template)}>
                Add
              </Button>
            </div>
            <FieldDescription>
              {template ? SUBJECT_TEMPLATES[template].join(", ") : "Subjects you already have are kept."}
            </FieldDescription>
          </Field>
        </div>
      </div>

      {!data.subjects.length ? (
        <EmptyState title="No subjects yet" description="Add subjects one by one or load a ready-made list above. Classes use them for timetables." />
      ) : (
        <div className="overflow-x-auto rounded-3xl bg-surface p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th scope="col" className="px-3 py-3 font-medium">
                  Subject
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  Classes
                </th>
                <th scope="col" className="px-3 py-3 font-medium">
                  In use
                </th>
                <th scope="col" className="px-3 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.subjects.map((subject) => (
                <SubjectRow key={`${subject.id}-${subject.name}-${subject.enabled}`} subject={subject} notify={notify} reload={reload} onDelete={() => setDeleting(subject)} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={Boolean(deleting)}
        title={`Delete ${deleting?.name ?? "this subject"}?`}
        description={
          deleting?.classes
            ? `It is removed from ${deleting.classes} class${deleting.classes === 1 ? "" : "es"}. Lessons already on timetables stay until you change them.`
            : "Lessons already on timetables stay until you change them."
        }
        confirmLabel="Delete subject"
        danger
        loading={remove.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
      />
    </div>
  );
}

function SubjectRow({ subject, notify, reload, onDelete }: { subject: AcademicSubject; notify: Notify; reload: () => Promise<void>; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(subject.name);
  const save = useMutation({
    mutationFn: (payload: { name: string; enabled: boolean }) => api.saveSubject({ id: subject.id, ...payload }),
    onSuccess: async () => {
      setEditing(false);
      await reload();
    },
    onError: (err) => notify(errorText(err, "Could not save this subject."), "error"),
  });

  return (
    <tr className="border-t border-line">
      <td className="px-3 py-2">
        {editing ? (
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (draft.trim() && draft.trim() !== subject.name) save.mutate({ name: draft.trim(), enabled: subject.enabled });
              else setEditing(false);
            }}
          >
            <Input aria-label={`Rename ${subject.name}`} value={draft} onChange={(event) => setDraft(event.target.value)} capitalize="words" className="w-56" autoFocus />
            <Button type="submit" size="sm" loading={save.isPending}>
              Save
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(subject.name);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </form>
        ) : (
          <span className={`font-medium ${subject.enabled ? "" : "text-muted-foreground line-through"}`}>{subject.name}</span>
        )}
      </td>
      <td className="px-3 py-2 tabular-nums text-muted-foreground">{subject.classes ? `${subject.classes} class${subject.classes === 1 ? "" : "es"}` : "Not assigned"}</td>
      <td className="px-3 py-2">
        <Switch
          aria-label={`${subject.name} in use`}
          checked={subject.enabled}
          disabled={save.isPending}
          onCheckedChange={(enabled) => save.mutate({ name: subject.name, enabled })}
        />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {!editing ? (
          <Button type="button" variant="ghost" size="sm" icon={<Pencil />} onClick={() => setEditing(true)}>
            Rename
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${subject.name}`} onClick={onDelete}>
          <Trash2 />
        </Button>
      </td>
    </tr>
  );
}
