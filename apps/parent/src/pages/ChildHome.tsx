import { useQuery } from "@tanstack/react-query";
import { fmt } from "@wellrun/i18n";
import type { AttendanceStatus } from "@wellrun/shared";
import { CalendarCheck, CalendarDays, Clock, Megaphone, NotebookPen, Trophy, Wallet } from "lucide-react";
import { useParams } from "react-router-dom";
import { Avatar, Card, Chip, ErrorBox, Loading, Screen, Tile } from "@/components/ui";
import { api, mediaUrl } from "@/lib/api";
import { formatDate, pkr } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { keys, useChild } from "@/lib/queries";

const TONE: Record<AttendanceStatus, "green" | "red" | "orange" | "indigo"> = { PRESENT: "green", ABSENT: "red", LATE: "orange", LEAVE: "indigo", EXCUSED: "indigo" };

export function ChildHomePage() {
  const { id = "" } = useParams();
  const { m, locale } = useLocale();
  const { child, isPending: mePending, isError: meError, error: meErr, refetch: meRefetch } = useChild(id);
  const summary = useQuery({ queryKey: keys.summary(id), queryFn: () => api.summary(id), enabled: Boolean(child) });

  if (mePending) return <Screen title="" back="/"><Loading /></Screen>;
  if (meError) return <Screen title="" back="/"><ErrorBox error={meErr} onRetry={() => void meRefetch()} /></Screen>;
  if (!child) return <Screen title="" back="/"><ErrorBox error={null} onRetry={() => void meRefetch()} /></Screen>;

  const s = summary.data;
  const att = s?.attendance;
  const base = `/child/${id}`;

  return (
    <Screen title={child.firstName} back="/">
      <Card>
        <div className="flex items-center gap-4">
          <Avatar name={child.firstName} photo={mediaUrl(child.photoUrl)} size="size-20" />
          <div className="min-w-0">
            <p className="text-2xl font-semibold leading-tight">{child.name}</p>
            {child.classLabel ? <p className="text-lg text-muted">{fmt(m.home.classLabel, { class: child.classLabel })}</p> : null}
            <p className="truncate text-base font-semibold text-indigo">{child.school.name}</p>
          </div>
        </div>
      </Card>

      {summary.isPending ? (
        <Loading />
      ) : summary.isError || !s ? (
        <ErrorBox error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          <Card>
            <p className="text-base font-semibold text-muted">{m.summary.attendanceToday}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {att!.status ? (
                <Chip tone={TONE[att!.status]}>{m.status[att!.status]}</Chip>
              ) : !att!.working ? (
                <Chip tone="grey">{att!.holiday ? fmt(m.summary.holiday, { name: att!.holiday }) : m.summary.closedToday}</Chip>
              ) : (
                <Chip tone="grey">{m.status.NONE}</Chip>
              )}
            </div>
            <p className="mt-3 text-lg">
              {att!.monthPct === null ? m.summary.noMonthYet : <span>{fmt(m.summary.thisMonth, { pct: att!.monthPct })}</span>}
            </p>
            {att!.absentThisMonth > 0 ? <p className="text-base text-muted">{fmt(m.summary.absentDays, { n: att!.absentThisMonth })}</p> : null}
          </Card>

          <Card>
            <p className="text-base font-semibold text-muted">{m.summary.feesTitle}</p>
            {s.fees.dueTotalPkr > 0 ? (
              <>
                <p className="ltr-num mt-2 text-3xl font-semibold">{pkr(s.fees.dueTotalPkr)}</p>
                <p className="mt-1 text-lg">{m.fees.totalDue}</p>
                {s.fees.overdueCount > 0 ? <div className="mt-2"><Chip tone="red">{fmt(m.summary.overdue, { n: s.fees.overdueCount })}</Chip></div> : null}
                {s.fees.nextDueOn ? <p className="mt-2 text-base text-muted">{fmt(m.summary.nextDue, { date: formatDate(s.fees.nextDueOn, locale) })}</p> : null}
              </>
            ) : (
              <p className="mt-2 text-xl font-semibold text-success">{m.summary.allPaid}</p>
            )}
          </Card>

          <Card>
            <p className="text-base font-semibold text-muted">{m.summary.nextExam}</p>
            <p className="mt-2 text-lg font-semibold">
              {s.nextExam ? fmt(m.summary.examLine, { subject: s.nextExam.subject, date: formatDate(s.nextExam.date, locale) }) : m.summary.noExam}
            </p>
            {s.nextExam ? <p className="text-base text-muted">{s.nextExam.examName}</p> : null}
          </Card>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Tile to={`${base}/attendance`} icon={<CalendarCheck className="size-9" aria-hidden />} label={m.tiles.attendance} />
        <Tile
          to={`${base}/homework`}
          icon={<NotebookPen className="size-9" aria-hidden />}
          label={m.tiles.homework}
          badge={s && s.diary.todayCount + s.diary.dueSoonCount > 0 ? <Chip tone="orange">{s.diary.todayCount + s.diary.dueSoonCount}</Chip> : null}
        />
        <Tile to={`${base}/fees`} icon={<Wallet className="size-9" aria-hidden />} label={m.tiles.fees} badge={s && s.fees.dueTotalPkr > 0 ? <Chip tone="red">{s.fees.openCount}</Chip> : null} />
        <Tile to={`${base}/results`} icon={<Trophy className="size-9" aria-hidden />} label={m.tiles.results} />
        <Tile to={`${base}/notices`} icon={<Megaphone className="size-9" aria-hidden />} label={m.tiles.notices} badge={s?.notice ? <Chip tone="indigo">1</Chip> : null} />
        <Tile to={`${base}/timetable`} icon={<Clock className="size-9" aria-hidden />} label={m.tiles.timetable} />
        <Tile to={`${base}/calendar`} icon={<CalendarDays className="size-9" aria-hidden />} label={m.tiles.calendar} className="col-span-2" />
      </div>
    </Screen>
  );
}
