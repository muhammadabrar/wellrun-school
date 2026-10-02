import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DIARY_KINDS, DIARY_KIND_LABEL, addDays, diaryWindow, type DiaryEntryView, type DiaryKind } from "@wellrun/shared";
import { Badge, Dialog, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination, Skeleton } from "@wellrun/ui";
import { CalendarDays, ChevronLeft, ChevronRight, Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { FileUpload } from "@/components/FileUpload";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCampus } from "@/hooks/use-campus";
import { currentUser } from "@/lib/api";
import { diaryApi, diaryKeys, type DiaryOverview } from "@/lib/diary-api";
import { mediaUrl, todayIso } from "@/lib/format";
import { useClampPage } from "@/lib/paging";

const KIND_TONE: Record<DiaryKind, "indigo" | "warning" | "neutral"> = { HOMEWORK: "indigo", CLASSWORK: "neutral", NOTE: "warning" };
const GENERAL = "general";

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.readAsDataURL(file);
  });
}

function dayLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

export function DiaryPage() {
  const isTeacher = currentUser()?.role === "TEACHER";
  const { classes } = useCampus();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const date = params.get("date") || today;
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [editing, setEditing] = useState<DiaryEntryView | "new" | null>(null);
  const [copying, setCopying] = useState<DiaryEntryView | null>(null);
  const [deleting, setDeleting] = useState<DiaryEntryView | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const choices = useQuery({ queryKey: diaryKeys.choices, queryFn: diaryApi.choices, enabled: isTeacher });
  const options = useMemo(
    () =>
      isTeacher
        ? (choices.data?.classes ?? []).map((cls) => ({ value: cls.id, label: cls.label }))
        : classes.map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}` })),
    [isTeacher, choices.data, classes],
  );
  const classId = params.get("classId") || options[0]?.value || "";

  const setParam = useCallback(
    (key: string, value: string | null) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key !== "page") next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const list = useQuery({
    queryKey: diaryKeys.list({ classId, date, page }),
    queryFn: () => diaryApi.list({ classId, date, page }),
    enabled: Boolean(classId),
    placeholderData: keepPreviousData,
  });
  useClampPage(list.data, (next) => setParam("page", next > 1 ? String(next) : null));

  const overview = useQuery({ queryKey: diaryKeys.overview(date), queryFn: () => diaryApi.overview(date), enabled: !isTeacher });

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: diaryKeys.root });
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };
  const remove = useMutation({
    mutationFn: (id: string) => diaryApi.remove(id),
    onSuccess: () => {
      setDeleting(null);
      done("Entry removed");
    },
  });

  const selectedClass = choices.data?.classes.find((cls) => cls.id === classId);
  const { from, to } = diaryWindow(today);
  const noClasses = isTeacher ? choices.isSuccess && !options.length : !classes.length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diary"
        description={
          isTeacher
            ? "Tell a class and its parents what was set today: homework, classwork or a note."
            : "What teachers have set for each class. Teachers write it; you can see everything and take an entry down."
        }
        actions={
          isTeacher && classId ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> Add to diary
            </Button>
          ) : null
        }
      />

      {noClasses ? (
        <EmptyState
          title={isTeacher ? "No classes assigned to you yet" : "No classes yet"}
          description={isTeacher ? "Ask your school admin to assign you to a class and subject, then you can write the diary." : "Add classes under Classes & subjects first."}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-56">
              <Label htmlFor="diary-class">Class</Label>
              <FormSelect id="diary-class" value={classId} onValueChange={(value) => setParam("classId", value)} options={options} placeholder="Choose a class" />
            </div>
            <div className="flex items-end gap-1">
              <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setParam("date", addDays(date, -1))}>
                <ChevronLeft className="size-4" aria-hidden />
              </Button>
              <div className="w-48">
                <Label htmlFor="diary-date">Day</Label>
                <DatePicker id="diary-date" value={date} onChange={(value) => setParam("date", value)} fromYear={2020} toYear={new Date().getFullYear() + 1} />
              </div>
              <Button variant="outline" size="icon" aria-label="Next day" onClick={() => setParam("date", addDays(date, 1))}>
                <ChevronRight className="size-4" aria-hidden />
              </Button>
              {date !== today ? (
                <Button variant="ghost" onClick={() => setParam("date", null)}>
                  Today
                </Button>
              ) : null}
            </div>
            <FetchingIndicator show={list.isFetching && !list.isPending} />
          </div>

          {!isTeacher ? <Overview data={overview.data} pending={overview.isPending} error={overview.isError} onRetry={() => void overview.refetch()} classId={classId} onPick={(id) => setParam("classId", id)} /> : null}

          {editing && isTeacher && selectedClass ? (
            <Composer
              key={editing === "new" ? `new-${classId}-${date}` : editing.id}
              entry={editing === "new" ? null : editing}
              classId={classId}
              classLabel={selectedClass.label}
              subjects={selectedClass.subjects}
              defaultDate={date < from ? today : date}
              minDate={from}
              maxDate={to}
              onClose={() => setEditing(null)}
              onSaved={(message) => {
                setEditing(null);
                done(message);
              }}
            />
          ) : null}

          {list.isPending ? (
            <div className="space-y-3">
              <Skeleton className="h-28 rounded-3xl" />
              <Skeleton className="h-28 rounded-3xl" />
            </div>
          ) : list.isError ? (
            <ErrorState title="Couldn't load the diary" description="Check your connection and try again." onRetry={() => void list.refetch()} />
          ) : !list.data.items.length ? (
            <EmptyState
              title={`Nothing in the diary for ${dayLabel(date)}`}
              description={isTeacher ? "Add homework, classwork or a note and parents will see it in their portal." : "No teacher has written the diary for this class on this day."}
              action={isTeacher ? <Button onClick={() => setEditing("new")}>Add to diary</Button> : undefined}
            />
          ) : (
            <ul className="space-y-3">
              {list.data.items.map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  onEdit={() => setEditing(entry)}
                  onCopy={() => setCopying(entry)}
                  onDelete={() => setDeleting(entry)}
                  canCopy={isTeacher && entry.mine && (choices.data?.classes.filter((cls) => cls.gradeName === selectedClass?.gradeName).length ?? 0) > 1}
                />
              ))}
            </ul>
          )}
          {list.data ? <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} noun="entry" busy={list.isFetching} onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)} /> : null}
        </>
      )}

      {copying && choices.data ? (
        <CopyDialog
          entry={copying}
          choices={choices.data.classes}
          onClose={() => setCopying(null)}
          onCopied={(count) => {
            setCopying(null);
            done(`Copied to ${count} ${count === 1 ? "class" : "classes"}`);
          }}
        />
      ) : null}

      <Dialog
        open={Boolean(deleting)}
        title="Remove this entry?"
        description={deleting ? `${deleting.className}: ${deleting.title || deleting.body.slice(0, 60)}. Parents will no longer see it.` : undefined}
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
      <Toast message={toast} />
    </div>
  );
}

function EntryCard({ entry, onEdit, onCopy, onDelete, canCopy }: { entry: DiaryEntryView; onEdit: () => void; onCopy: () => void; onDelete: () => void; canCopy: boolean }) {
  return (
    <li className="rounded-3xl bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={KIND_TONE[entry.kind]}>{DIARY_KIND_LABEL[entry.kind]}</Badge>
          <span className="text-sm font-medium">{entry.subject ?? "General"}</span>
          <span className="text-sm text-muted-foreground">· {entry.className}</span>
        </div>
        <div className="flex items-center gap-1">
          {canCopy ? (
            <Button variant="ghost" size="sm" onClick={onCopy}>
              <Copy className="size-3.5" aria-hidden /> Copy to sections
            </Button>
          ) : null}
          {entry.canEdit ? (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden /> Edit
            </Button>
          ) : null}
          {entry.canDelete ? (
            <Button variant="ghost" size="sm" onClick={onDelete} aria-label="Remove entry">
              <Trash2 className="size-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
      {entry.title ? <h3 className="mt-3 font-display text-xl">{entry.title}</h3> : null}
      <p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
        {entry.body}
      </p>
      {entry.imageUrl ? <img src={mediaUrl(entry.imageUrl)} alt="Attached to the diary entry" className="mt-3 max-h-64 rounded-2xl border border-line object-contain" /> : null}
      <p className="mt-3 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
        {entry.dueOn ? (
          <span className="inline-flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden /> Due {dayLabel(entry.dueOn)}
          </span>
        ) : null}
        {entry.author ? <span>By {entry.author}</span> : null}
      </p>
    </li>
  );
}

function Overview({
  data,
  pending,
  error,
  onRetry,
  classId,
  onPick,
}: {
  data: DiaryOverview | undefined;
  pending: boolean;
  error: boolean;
  onRetry: () => void;
  classId: string;
  onPick: (id: string) => void;
}) {
  if (pending) return <Skeleton className="h-24 rounded-3xl" />;
  if (error || !data) return <ErrorState title="Couldn't load the overview" description="Try again in a moment." onRetry={onRetry} />;
  if (!data.working) {
    return <p className="rounded-2xl bg-paper px-4 py-3 text-sm text-muted-foreground">{data.holiday ? `${dayLabel(data.date)} is a holiday (${data.holiday}).` : `The school is closed on ${dayLabel(data.date)}.`}</p>;
  }
  const missing = data.classes.filter((cls) => !cls.entries);
  return (
    <section className="rounded-3xl bg-surface p-5">
      <p className="font-display text-xl">
        {data.posted} of {data.total} classes have a diary for this day
      </p>
      {missing.length ? (
        <div className="mt-3">
          <p className="text-sm text-muted-foreground">Nothing written yet for:</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {missing.map((cls) => (
              <button key={cls.id} type="button" onClick={() => onPick(cls.id)} className={`rounded-full px-3 py-1 text-xs font-medium ${cls.id === classId ? "bg-indigo text-white" : "bg-paper hover:bg-indigo/10"}`}>
                {cls.label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-1 text-sm text-success">Every class has something written.</p>
      )}
    </section>
  );
}

function Composer({
  entry,
  classId,
  classLabel,
  subjects,
  defaultDate,
  minDate,
  maxDate,
  onClose,
  onSaved,
}: {
  entry: DiaryEntryView | null;
  classId: string;
  classLabel: string;
  subjects: { id: string; name: string }[];
  defaultDate: string;
  minDate: string;
  maxDate: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [subjectId, setSubjectId] = useState(entry ? (entry.subjectId ?? GENERAL) : (subjects[0]?.id ?? GENERAL));
  const [kind, setKind] = useState<DiaryKind>(entry?.kind ?? (subjects.length ? "HOMEWORK" : "NOTE"));
  const [date, setDate] = useState(entry?.date ?? defaultDate);
  const [dueOn, setDueOn] = useState(entry?.dueOn ?? "");
  const [image, setImage] = useState<string | undefined>();
  const [imageName, setImageName] = useState("");
  const [removeImage, setRemoveImage] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A general note is the only thing a subject teacher can post without a subject.
  const subjectOptions = [...subjects.map((s) => ({ value: s.id, label: s.name })), { value: GENERAL, label: "General (whole class)" }];

  const save = useMutation({
    mutationFn: (form: { title: string; body: string }) => {
      const payload = {
        subjectId: subjectId === GENERAL ? null : subjectId,
        kind,
        date,
        title: form.title,
        body: form.body,
        dueOn: kind === "HOMEWORK" && dueOn ? dueOn : null,
        ...(image ? { image } : {}),
      };
      return entry ? diaryApi.update(entry.id, { ...payload, removeImage: removeImage && !image }) : diaryApi.create({ classId, ...payload });
    },
    onSuccess: () => onSaved(entry ? "Entry updated" : "Added to the diary"),
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save the entry"),
  });

  async function onPhoto(file: File) {
    if (file.size > 4 * 1024 * 1024) {
      setError("That photo is over 4 MB. Choose a smaller one.");
      return;
    }
    try {
      setImage(await readAsDataUrl(file));
      setImageName(file.name);
      setRemoveImage(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    save.mutate({ title: String(form.get("title") ?? ""), body: String(form.get("body") ?? "") });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-display text-xl">{entry ? "Edit entry" : `New entry for ${classLabel}`}</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="diary-subject">Subject</Label>
          <FormSelect id="diary-subject" value={subjectId} onValueChange={(value) => value && setSubjectId(value)} options={subjectOptions} />
        </div>
        <div>
          <Label htmlFor="diary-kind">Type</Label>
          <FormSelect
            id="diary-kind"
            value={kind}
            onValueChange={(value) => value && setKind(value as DiaryKind)}
            options={DIARY_KINDS.map((k) => ({ value: k, label: DIARY_KIND_LABEL[k] }))}
          />
        </div>
        <div>
          <Label htmlFor="diary-for">For the day</Label>
          <DatePicker id="diary-for" value={date} onChange={setDate} fromYear={Number(minDate.slice(0, 4))} toYear={Number(maxDate.slice(0, 4))} />
        </div>
      </div>
      <div>
        <Label htmlFor="diary-title">Title (optional)</Label>
        <Input id="diary-title" name="title" defaultValue={entry?.title ?? ""} maxLength={120} dir="auto" placeholder="Chapter 4 exercises" />
      </div>
      <div>
        <Label htmlFor="diary-body">What should the class know?</Label>
        <Textarea id="diary-body" name="body" dir="auto" required rows={5} defaultValue={entry?.body ?? ""} maxLength={4000} placeholder="Page 42, questions 1 to 5. Learn the new spellings." />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {kind === "HOMEWORK" ? (
          <div>
            <Label htmlFor="diary-due">Due on (optional)</Label>
            <DatePicker id="diary-due" value={dueOn} onChange={setDueOn} fromYear={Number(date.slice(0, 4))} toYear={Number(maxDate.slice(0, 4)) + 1} placeholder="No due date" />
            {dueOn ? (
              <button type="button" className="mt-1 text-xs text-muted-foreground underline" onClick={() => setDueOn("")}>
                Clear due date
              </button>
            ) : null}
          </div>
        ) : null}
        <div>
          <FileUpload label="Photo of the board or worksheet (optional)" accept="image/png,image/jpeg,image/webp" hint="JPG, PNG or WebP, up to 4 MB" preview={image ?? (entry?.imageUrl && !removeImage ? mediaUrl(entry.imageUrl) : undefined)} fileName={imageName} onFile={(file) => void onPhoto(file)} />
          {entry?.imageUrl && !removeImage && !image ? (
            <button type="button" className="mt-1 text-xs text-muted-foreground underline" onClick={() => setRemoveImage(true)}>
              Remove current photo
            </button>
          ) : null}
        </div>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {entry ? "Save changes" : "Add entry"}
        </Button>
      </div>
    </form>
  );
}

function CopyDialog({
  entry,
  choices,
  onClose,
  onCopied,
}: {
  entry: DiaryEntryView;
  choices: { id: string; label: string; gradeName: string; subjects: { id: string }[] }[];
  onClose: () => void;
  onCopied: (count: number) => void;
}) {
  const source = choices.find((cls) => cls.id === entry.classId);
  const targets = choices.filter((cls) => cls.id !== entry.classId && cls.gradeName === source?.gradeName && (!entry.subjectId || cls.subjects.some((s) => s.id === entry.subjectId)));
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const copy = useMutation({
    mutationFn: () => diaryApi.copy(entry.id, picked),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: diaryKeys.root });
      onCopied(result.copied);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't copy the entry"),
  });

  return (
    <Dialog
      open
      title="Copy to other sections"
      description="The same entry is added for the same day. You can then edit each copy."
      confirmLabel={picked.length ? `Copy to ${picked.length}` : "Copy"}
      loading={copy.isPending}
      onConfirm={() => (picked.length ? copy.mutate() : setError("Pick at least one section"))}
      onClose={onClose}
    >
      {targets.length ? (
        <ul className="space-y-2">
          {targets.map((cls) => (
            <li key={cls.id}>
              <label className="flex items-center gap-3 rounded-xl border border-line px-3 py-2 text-sm">
                <input type="checkbox" checked={picked.includes(cls.id)} onChange={(event) => setPicked((current) => (event.target.checked ? [...current, cls.id] : current.filter((id) => id !== cls.id)))} />
                {cls.label}
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">There is no other section of this grade that you teach this subject in.</p>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </Dialog>
  );
}
