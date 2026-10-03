import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EVENT_AUDIENCES, EVENT_AUDIENCE_LABEL, EVENT_KINDS, EVENT_KIND_LABEL, itemsByDay, type CalendarItem, type CalendarItemType, type EventAudience, type EventKind, type EventView } from "@wellrun/shared";
import { Badge, Dialog, EmptyState, ErrorState, FetchingIndicator, PageHeader } from "@wellrun/ui";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ITEM_STYLE, MonthGrid, monthBounds } from "@/components/calendar/month-grid";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useCampus } from "@/hooks/use-campus";
import { currentUser } from "@/lib/api";
import { calendarApi, documentKeys } from "@/lib/documents-api";
import { todayIso } from "@/lib/format";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDay = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" }).format(d)}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const clock = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
};

export function EventsPage() {
  const isAdmin = currentUser()?.role === "SCHOOL_ADMIN";
  const queryClient = useQueryClient();
  const today = todayIso();
  const [params, setParams] = useSearchParams();
  const month = params.get("month") ?? today.slice(0, 7);
  const day = params.get("day") ?? (today.startsWith(month) ? today : `${month}-01`);
  const hidden = new Set((params.get("hide") ?? "").split(",").filter(Boolean));
  const [editing, setEditing] = useState<EventView | "new" | null>(null);
  const [deleting, setDeleting] = useState<CalendarItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key === "month") next.delete("day");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const { from, to } = monthBounds(month);
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: documentKeys.calendar(from, to), queryFn: () => calendarApi.calendar(from, to), placeholderData: keepPreviousData });
  const shown = useMemo(() => (data?.items ?? []).filter((i) => !hidden.has(i.type)), [data, hidden.size, params.get("hide")]); // eslint-disable-line react-hooks/exhaustive-deps
  const dayItems = useMemo(() => itemsByDay(shown, from, to).get(day) ?? [], [shown, from, to, day]);

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  };
  const remove = useMutation({
    mutationFn: (id: string) => calendarApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentKeys.calendarRoot });
      setDeleting(null);
      flash("Event removed");
    },
    onError: (e) => {
      setDeleting(null);
      setError(e instanceof Error ? e.message : "Couldn't remove the event");
    },
  });

  async function openEdit(eventId: string) {
    setLoadingEdit(true);
    setError(null);
    try {
      setEditing(await calendarApi.event(eventId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the event");
    } finally {
      setLoadingEdit(false);
    }
  }

  const toggle = (type: CalendarItemType) => {
    const next = new Set(hidden);
    if (next.has(type)) next.delete(type);
    else next.add(type);
    setParam("hide", [...next].join(",") || null);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Events"
        description={isAdmin ? "Everything coming up at school: events you add, holidays and exam days. Parents see what is meant for their child's class." : "Events, holidays and exam days for the school and your classes."}
        actions={
          isAdmin ? (
            <Button onClick={() => { setError(null); setEditing("new"); }}>
              <Plus className="size-4" aria-hidden /> Add an event
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-4 text-sm">
        {(Object.keys(ITEM_STYLE) as CalendarItemType[]).map((type) => (
          <label key={type} className="inline-flex items-center gap-2">
            <input type="checkbox" checked={!hidden.has(type)} onChange={() => toggle(type)} /> {ITEM_STYLE[type].label}s
          </label>
        ))}
        <FetchingIndicator show={isFetching && !isPending} />
      </div>
      {error && !editing ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

      {isError ? (
        <ErrorState title="Couldn't load the calendar" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
          <MonthGrid month={month} items={shown} today={today} selected={day} onSelect={(d) => setParam("day", d)} onMonth={(m) => setParam("month", m)} />
          <section aria-labelledby="day-h" className="space-y-3">
            <h2 id="day-h" className="font-display text-xl">{longDay(day)}</h2>
            {data?.truncated ? <p className="rounded-2xl bg-orange/10 px-3 py-2 text-xs text-orange">This month is very busy, so some items may be missing here.</p> : null}
            {isPending ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : dayItems.length ? (
              <ul className="space-y-2">
                {dayItems.map((item) => (
                  <li key={item.id} className="rounded-2xl bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={item.type === "HOLIDAY" ? "warning" : item.type === "EXAM" ? "success" : "indigo"}>{item.kind ? EVENT_KIND_LABEL[item.kind] : ITEM_STYLE[item.type].label}</Badge>
                          {item.audience === "STAFF" ? <Badge tone="neutral">Staff only</Badge> : null}
                        </div>
                        <p dir="auto" className="mt-1.5 font-medium">{item.title}</p>
                        {item.startTime ? <p className="text-xs text-muted-foreground">{clock(item.startTime)}{item.endTime ? ` to ${clock(item.endTime)}` : ""}</p> : null}
                        {item.endDate !== item.date ? <p className="text-xs text-muted-foreground">{longDay(item.date)} to {longDay(item.endDate)}</p> : null}
                        {item.subtitle ? <p dir="auto" className="mt-0.5 flex items-start gap-1 text-sm text-muted-foreground">{item.type === "EVENT" && item.subtitle ? <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : null}{item.subtitle}</p> : null}
                        {item.audience === "CLASSES" && item.classLabels.length ? <p className="mt-1 text-xs text-muted-foreground">For {item.classLabels.join(", ")}</p> : null}
                      </div>
                      {isAdmin && item.eventId ? (
                        <div className="flex shrink-0 items-center">
                          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${item.title}`} disabled={loadingEdit} onClick={() => void openEdit(item.eventId!)}>
                            <Pencil />
                          </Button>
                          <Button variant="ghost" size="icon-sm" aria-label={`Remove ${item.title}`} onClick={() => setDeleting(item)}>
                            <Trash2 />
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nothing on this day" description={isAdmin ? "Pick another day, or add an event for it." : "Pick another day on the calendar."} action={isAdmin ? <Button onClick={() => { setError(null); setEditing("new"); }}>Add an event</Button> : undefined} />
            )}
          </section>
        </div>
      )}

      <Sheet open={Boolean(editing)} onOpenChange={(next) => !next && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {editing ? (
            <EventForm
              key={editing === "new" ? `new-${day}` : editing.id}
              event={editing === "new" ? null : editing}
              startDay={day}
              onDone={(message) => {
                setEditing(null);
                void queryClient.invalidateQueries({ queryKey: documentKeys.calendarRoot });
                if (message) flash(message);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(deleting)}
        title="Remove this event?"
        description={deleting ? `"${deleting.title}" disappears from the calendar for parents and staff.` : undefined}
        confirmLabel="Remove"
        danger
        loading={remove.isPending}
        onConfirm={() => deleting?.eventId && remove.mutate(deleting.eventId)}
        onClose={() => setDeleting(null)}
      />
      <Toast message={toast} />
    </div>
  );
}

function EventForm({ event, startDay, onDone }: { event: EventView | null; startDay: string; onDone: (message: string) => void }) {
  const { classes } = useCampus();
  const [title, setTitle] = useState(event?.title ?? "");
  const [kind, setKind] = useState<EventKind>(event?.kind ?? "EVENT");
  const [startsOn, setStartsOn] = useState(event?.startsOn ?? startDay);
  const [endsOn, setEndsOn] = useState(event?.endsOn ?? "");
  const [allDay, setAllDay] = useState(event?.allDay ?? true);
  const [startTime, setStartTime] = useState(event?.startTime || "09:00");
  const [endTime, setEndTime] = useState(event?.endTime ?? "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [audience, setAudience] = useState<EventAudience>(event?.audience ?? "ALL");
  const [classIds, setClassIds] = useState<string[]>(event?.classIds ?? []);
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () => {
      const payload = { title, kind, startsOn, endsOn: endsOn && endsOn > startsOn ? endsOn : null, allDay, startTime: allDay ? "" : startTime, endTime: allDay ? "" : endTime, location, description, audience, classIds: audience === "CLASSES" ? classIds : [] };
      return event ? calendarApi.update(event.id, payload) : calendarApi.create(payload);
    },
    onSuccess: () => onDone(event ? "Event updated" : "Event added"),
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save the event"),
  });

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        save.mutate();
      }}
    >
      <SheetHeader>
        <SheetTitle>{event ? "Edit event" : "Add an event"}</SheetTitle>
        <SheetDescription>Choose who it is for. Parents only see events meant for everyone or for their child's class.</SheetDescription>
      </SheetHeader>
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4">
        <div>
          <Label htmlFor="ev-title">Name</Label>
          <Input id="ev-title" value={title} maxLength={120} required dir="auto" onChange={(e) => setTitle(e.target.value)} placeholder="Annual sports day" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="ev-kind">Kind</Label>
            <FormSelect id="ev-kind" value={kind} onValueChange={(v) => v && setKind(v as EventKind)} options={EVENT_KINDS.map((k) => ({ value: k, label: EVENT_KIND_LABEL[k] }))} />
          </div>
          <div>
            <Label htmlFor="ev-loc">Where (optional)</Label>
            <Input id="ev-loc" value={location} maxLength={120} dir="auto" onChange={(e) => setLocation(e.target.value)} placeholder="School hall" />
          </div>
          <div>
            <Label htmlFor="ev-start">First day</Label>
            <DatePicker id="ev-start" value={startsOn} onChange={(v) => { setStartsOn(v); if (endsOn && endsOn < v) setEndsOn(""); }} fromYear={2020} toYear={new Date().getFullYear() + 2} />
          </div>
          <div>
            <Label htmlFor="ev-end">Last day (if more than one)</Label>
            <DatePicker id="ev-end" value={endsOn} onChange={setEndsOn} placeholder="Same day" fromYear={Number(startsOn.slice(0, 4))} toYear={new Date().getFullYear() + 2} />
            {endsOn ? <button type="button" className="mt-1 text-xs text-muted-foreground underline" onClick={() => setEndsOn("")}>Make it a single day</button> : null}
          </div>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={allDay} onCheckedChange={setAllDay} aria-label="All day" /> All day
        </label>
        {!allDay ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ev-from">Starts at</Label>
              <Input id="ev-from" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ev-to">Ends at (optional)</Label>
              <Input id="ev-to" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
          </div>
        ) : null}
        <div>
          <Label htmlFor="ev-aud">Who is it for?</Label>
          <FormSelect id="ev-aud" value={audience} onValueChange={(v) => v && setAudience(v as EventAudience)} options={EVENT_AUDIENCES.map((a) => ({ value: a, label: EVENT_AUDIENCE_LABEL[a] }))} />
        </div>
        {audience === "CLASSES" ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Classes</legend>
            <div className="flex flex-wrap gap-2">
              {classes.map((cls) => {
                const on = classIds.includes(cls.id);
                return (
                  <button key={cls.id} type="button" aria-pressed={on} onClick={() => setClassIds((cur) => (on ? cur.filter((id) => id !== cls.id) : [...cur, cls.id]))} className={`rounded-full px-3 py-1 text-xs font-medium ${on ? "bg-indigo text-white" : "bg-paper hover:bg-indigo/10"}`}>
                    {cls.name} {cls.section}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ) : null}
        <div>
          <Label htmlFor="ev-desc">Details (optional)</Label>
          <Textarea id="ev-desc" rows={3} maxLength={1000} dir="auto" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What parents should know or bring" />
        </div>
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </div>
      <div className="flex justify-end gap-2 border-t border-line p-4">
        <Button type="button" variant="ghost" onClick={() => onDone("")}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          {event ? "Save changes" : "Add event"}
        </Button>
      </div>
    </form>
  );
}
