import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { fmt } from "@wellrun/i18n";
import type { ParentDiaryEntry } from "@wellrun/shared";
import { CalendarClock, ChevronLeft } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Card, Chip, Empty, ErrorBox, Loading, Screen } from "@/components/ui";
import { api, mediaUrl } from "@/lib/api";
import { addDays, formatDate, formatLongDate, todayIso } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { keys, useChild } from "@/lib/queries";

const KIND_TONE = { HOMEWORK: "indigo", CLASSWORK: "grey", NOTE: "orange" } as const;

export function DiaryPage() {
  const { id = "" } = useParams();
  const { m, locale } = useLocale();
  const { child } = useChild(id);
  const today = todayIso();
  const [date, setDate] = useState(today);
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: keys.diary(id, date),
    queryFn: () => api.diary(id, date),
    placeholderData: keepPreviousData,
  });

  const kindLabel = (kind: ParentDiaryEntry["kind"]) => m.diary[`kind${kind}` as "kindHOMEWORK"];

  const entry = (row: ParentDiaryEntry, showDate = false) => (
    <li key={row.id}>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={KIND_TONE[row.kind]}>{kindLabel(row.kind)}</Chip>
          <span className="text-lg font-semibold">{row.subject ?? m.diary.general}</span>
        </div>
        {showDate ? <p className="mt-1 text-base text-muted">{formatDate(row.date, locale)}</p> : null}
        {row.title ? <h2 dir="auto" className="mt-3 text-xl font-semibold">{row.title}</h2> : null}
        <p dir="auto" className="mt-2 whitespace-pre-wrap text-lg">{row.body}</p>
        {row.imageUrl ? (
          <a href={mediaUrl(row.imageUrl)} target="_blank" rel="noreferrer" className="mt-3 block">
            <img src={mediaUrl(row.imageUrl)} alt={m.diary.photo} className="max-h-72 w-full rounded-2xl object-contain ring-1 ring-line" />
          </a>
        ) : null}
        {row.dueOn ? (
          <p className="mt-3 flex items-center gap-2 text-lg font-semibold text-orange">
            <CalendarClock className="size-5" aria-hidden /> {fmt(m.diary.due, { date: formatDate(row.dueOn, locale) })}
          </p>
        ) : null}
        {row.author ? <p className="mt-2 text-base text-muted">{fmt(m.diary.by, { name: row.author })}</p> : null}
      </Card>
    </li>
  );

  return (
    <Screen title={child ? `${child.firstName} · ${m.diary.title}` : m.diary.title} back={`/child/${id}`}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => setDate(addDays(date, -1))} aria-label={m.common.previous} className="grid size-14 place-items-center rounded-full bg-white shadow-sm ring-1 ring-line active:bg-paper">
          <ChevronLeft className="size-6 rtl:rotate-180" aria-hidden />
        </button>
        <div className="text-center">
          <p className="text-xl font-semibold">{date === today ? m.common.today : formatDate(date, locale)}</p>
          <p className="text-base text-muted">{formatLongDate(date, locale)}</p>
        </div>
        <button type="button" onClick={() => setDate(addDays(date, 1))} disabled={date >= addDays(today, 1)} aria-label={m.common.next} className="grid size-14 place-items-center rounded-full bg-white shadow-sm ring-1 ring-line active:bg-paper disabled:opacity-30">
          <ChevronLeft className="size-6 rotate-180 rtl:rotate-0" aria-hidden />
        </button>
      </div>

      {isPending ? (
        <Loading />
      ) : isError || !data ? (
        <ErrorBox error={error} onRetry={() => void refetch()} />
      ) : (
        <div className={`space-y-4 ${isFetching ? "opacity-70" : ""}`}>
          {data.entries.length ? <ul className="space-y-4">{data.entries.map((row) => entry(row))}</ul> : <Empty title={m.diary.nothing} />}
          {data.dueSoon.length ? (
            <>
              <h2 className="pt-2 text-xl font-semibold">{m.diary.dueSoon}</h2>
              <ul className="space-y-4">{data.dueSoon.map((row) => entry(row, true))}</ul>
            </>
          ) : null}
        </div>
      )}
    </Screen>
  );
}
