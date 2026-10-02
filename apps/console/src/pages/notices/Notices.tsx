import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { NoticeView } from "@wellrun/shared";
import { Badge, Dialog, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { Megaphone, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { useCallback, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCampus } from "@/hooks/use-campus";
import { currentUser } from "@/lib/api";
import { noticeKeys, noticesApi } from "@/lib/diary-api";
import { useClampPage } from "@/lib/paging";

function postedOn(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" });
}

export function NoticesPage() {
  const isAdmin = currentUser()?.role === "SCHOOL_ADMIN";
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [editing, setEditing] = useState<NoticeView | "new" | null>(null);
  const [deleting, setDeleting] = useState<NoticeView | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const setPage = useCallback(
    (next: number) =>
      setParams(
        (current) => {
          const out = new URLSearchParams(current);
          if (next > 1) out.set("page", String(next));
          else out.delete("page");
          return out;
        },
        { replace: true },
      ),
    [setParams],
  );

  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: noticeKeys.list(page), queryFn: () => noticesApi.list(page), placeholderData: keepPreviousData });
  useClampPage(data, setPage);

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: noticeKeys.root });
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };
  const remove = useMutation({
    mutationFn: (id: string) => noticesApi.remove(id),
    onSuccess: () => {
      setDeleting(null);
      done("Notice removed");
    },
  });
  const pin = useMutation({
    mutationFn: (notice: NoticeView) => noticesApi.update(notice.id, { pinned: !notice.pinned }),
    onSuccess: (notice) => done(notice.pinned ? "Pinned to the top" : "Unpinned"),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notices"
        description={isAdmin ? "Post a notice for the whole school or for chosen classes. Parents read it in their portal." : "Notices from the school that reach your classes."}
        actions={
          isAdmin ? (
            <Button onClick={() => setEditing("new")}>
              <Plus className="size-4" aria-hidden /> New notice
            </Button>
          ) : null
        }
      />

      {editing && isAdmin ? (
        <NoticeForm
          key={editing === "new" ? "new" : editing.id}
          notice={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            setEditing(null);
            done(message);
          }}
        />
      ) : null}

      <FetchingIndicator show={isFetching && !isPending} />
      {isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load notices" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data.items.length ? (
        <EmptyState
          title="No notices yet"
          description={isAdmin ? "Post the first one, for example a holiday or a parents' meeting." : "When the school posts a notice for your classes, it will appear here."}
          action={isAdmin ? <Button onClick={() => setEditing("new")}>New notice</Button> : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {data.items.map((notice) => (
            <li key={notice.id} className="rounded-3xl bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Megaphone className="size-4 text-primary" aria-hidden />
                  <Badge tone={notice.audience === "ALL" ? "indigo" : "neutral"}>{notice.audience === "ALL" ? "Everyone" : notice.classLabels.join(", ") || "Chosen classes"}</Badge>
                  {notice.pinned ? <Badge tone="warning">Pinned</Badge> : null}
                  <span className="text-xs text-muted-foreground">{postedOn(notice.publishedAt)}{notice.author ? ` · ${notice.author}` : ""}</span>
                </div>
                {isAdmin ? (
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => pin.mutate(notice)} disabled={pin.isPending}>
                      <Pin className="size-3.5" aria-hidden /> {notice.pinned ? "Unpin" : "Pin"}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(notice)}>
                      <Pencil className="size-3.5" aria-hidden /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(notice)} aria-label="Delete notice">
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                ) : null}
              </div>
              <h3 dir="auto" className="mt-3 font-display text-xl">
                {notice.title}
              </h3>
              <p dir="auto" className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                {notice.body}
              </p>
            </li>
          ))}
        </ul>
      )}
      {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="notice" busy={isFetching} onPageChange={setPage} /> : null}

      <Dialog
        open={Boolean(deleting)}
        title="Delete this notice?"
        description={deleting ? `"${deleting.title}" will disappear from every parent's portal.` : undefined}
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
        onClose={() => setDeleting(null)}
      />
      <Toast message={toast} />
    </div>
  );
}

function NoticeForm({ notice, onClose, onSaved }: { notice: NoticeView | null; onClose: () => void; onSaved: (message: string) => void }) {
  const { classes } = useCampus();
  const [audience, setAudience] = useState<"ALL" | "CLASSES">(notice?.audience ?? "ALL");
  const [classIds, setClassIds] = useState<string[]>(notice?.classIds ?? []);
  const [pinned, setPinned] = useState(notice?.pinned ?? false);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (form: { title: string; body: string }) => {
      const payload = { ...form, audience, classIds: audience === "CLASSES" ? classIds : [], pinned };
      return notice ? noticesApi.update(notice.id, payload) : noticesApi.create(payload);
    },
    onSuccess: () => onSaved(notice ? "Notice updated" : "Notice posted"),
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save the notice"),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    if (audience === "CLASSES" && !classIds.length) {
      setError("Pick at least one class, or send it to everyone");
      return;
    }
    save.mutate({ title: String(form.get("title") ?? ""), body: String(form.get("body") ?? "") });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-3xl border border-line bg-surface p-5">
      <h2 className="font-display text-xl">{notice ? "Edit notice" : "New notice"}</h2>
      <div>
        <Label htmlFor="notice-title">Title</Label>
        <Input id="notice-title" name="title" dir="auto" required maxLength={120} defaultValue={notice?.title ?? ""} placeholder="School closed on Monday" />
      </div>
      <div>
        <Label htmlFor="notice-body">Notice</Label>
        <Textarea id="notice-body" name="body" dir="auto" required rows={5} maxLength={4000} defaultValue={notice?.body ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="notice-audience">Who is it for?</Label>
          <FormSelect
            id="notice-audience"
            value={audience}
            onValueChange={(value) => value && setAudience(value as "ALL" | "CLASSES")}
            options={[
              { value: "ALL", label: "Everyone" },
              { value: "CLASSES", label: "Chosen classes" },
            ]}
          />
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(event) => setPinned(event.target.checked)} /> Pin to the top
        </label>
      </div>
      {audience === "CLASSES" ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Classes</legend>
          <div className="flex flex-wrap gap-2">
            {classes.map((cls) => {
              const on = classIds.includes(cls.id);
              return (
                <button
                  key={cls.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setClassIds((current) => (on ? current.filter((id) => id !== cls.id) : [...current, cls.id]))}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${on ? "bg-indigo text-white" : "bg-paper hover:bg-indigo/10"}`}
                >
                  {cls.name} {cls.section}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}
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
          {notice ? "Save changes" : "Post notice"}
        </Button>
      </div>
    </form>
  );
}
