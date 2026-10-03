import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { dateRange } from "../reports/helpers";
import { eventSchema, eventVisibleTo, isoOf, type CalendarItem, type CalendarView, type EventView, type Viewer } from "@wellrun/shared";
import { loadHolidays } from "../attendance/rules";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import { dateOnly, karachiToday } from "../common/date";
import type { TeacherScope } from "../exams/access";
import { ExamsService } from "../exams/exams.service";
import { PrismaService } from "../prisma/prisma.service";
import { groupExamPapers } from "./calendar";

const MAX_WINDOW_DAYS = 400;

const idsOf = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []);

@Injectable()
export class EventsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ExamsService) private readonly exams: ExamsService,
  ) {}

  private async classLabels(schoolId: string, ids: string[]) {
    if (!ids.length) return new Map<string, string>();
    const rows = await this.prisma.class.findMany({ where: { schoolId, id: { in: ids } }, select: { id: true, name: true, section: true } });
    return new Map(rows.map((c) => [c.id, `${c.name} ${c.section}`.trim()]));
  }

  private toView(row: Prisma.SchoolEventGetPayload<object>, labels: Map<string, string>, author: string | null): EventView {
    const classIds = idsOf(row.classIds);
    return {
      id: row.id,
      title: row.title,
      description: row.description,
      kind: row.kind,
      startsOn: isoOf(row.startsOn),
      endsOn: row.endsOn ? isoOf(row.endsOn) : null,
      allDay: row.allDay,
      startTime: row.startTime,
      endTime: row.endTime,
      location: row.location,
      audience: row.audience,
      classIds,
      classLabels: classIds.map((id) => labels.get(id)).filter((l): l is string => Boolean(l)),
      createdBy: author,
    };
  }

  async get(schoolId: string, id: string): Promise<EventView> {
    const row = await this.prisma.schoolEvent.findFirst({ where: { id, schoolId } });
    if (!row) throw new NotFoundException("Event not found");
    const [labels, author] = await Promise.all([this.classLabels(schoolId, idsOf(row.classIds)), row.createdById ? this.prisma.user.findUnique({ where: { id: row.createdById }, select: { name: true } }) : null]);
    return this.toView(row, labels, author?.name ?? null);
  }

  /** Events, holidays and exam days between two dates, for the people allowed to see them. */
  async calendar(schoolId: string, yearId: string, campusId: string | undefined, teacher: TeacherScope, query: { from?: string; to?: string }): Promise<CalendarView> {
    const { from, to } = dateRange(query, karachiToday());
    if (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`) > MAX_WINDOW_DAYS * 86_400_000) throw new BadRequestException("Pick a window of about a year or less");
    const viewer: Viewer = { role: teacher ? "teacher" : "admin", classIds: teacher?.classIds ?? new Set<string>() };
    const [events, holidays, papers] = await Promise.all([
      this.prisma.schoolEvent.findMany({
        where: {
          schoolId,
          startsOn: { lte: dateOnly(to) },
          OR: [{ endsOn: { gte: dateOnly(from) } }, { endsOn: null, startsOn: { gte: dateOnly(from) } }],
          ...(campusId ? { AND: [{ OR: [{ campusId: null }, { campusId }] }] } : {}),
        },
        orderBy: [{ startsOn: "asc" }, { startTime: "asc" }, { id: "asc" }],
        take: 1000,
      }),
      loadHolidays(this.prisma, schoolId, from, to, campusId),
      this.exams.calendar(schoolId, yearId, { from, to }, teacher),
    ]);
    const visible = events.filter((e) => eventVisibleTo({ audience: e.audience, classIds: idsOf(e.classIds) }, viewer));
    const labels = await this.classLabels(schoolId, [...new Set(visible.flatMap((e) => idsOf(e.classIds)))]);
    const items: CalendarItem[] = [
      ...holidays.map((h) => ({ id: `holiday:${h.name}:${h.startsOn}`, type: "HOLIDAY" as const, title: h.name, subtitle: "School closed", date: h.startsOn, endDate: h.endsOn, startTime: "", endTime: "", kind: null, audience: null, classLabels: [], eventId: null })),
      ...visible.map((e) => ({
        id: e.id,
        type: "EVENT" as const,
        title: e.title,
        subtitle: [e.location, e.audience === "STAFF" ? "Staff only" : ""].filter(Boolean).join(" · "),
        date: isoOf(e.startsOn),
        endDate: e.endsOn ? isoOf(e.endsOn) : isoOf(e.startsOn),
        startTime: e.allDay ? "" : e.startTime,
        endTime: e.allDay ? "" : e.endTime,
        kind: e.kind,
        audience: e.audience,
        classLabels: idsOf(e.classIds).map((id) => labels.get(id)).filter((l): l is string => Boolean(l)),
        eventId: e.id,
      })),
      ...groupExamPapers(papers.map((p) => ({ id: p.id, date: p.date ?? "", startTime: p.startTime, endTime: p.endTime, className: p.className, subject: p.subject, examId: p.examId, examName: p.examName })).filter((p) => p.date)),
    ];
    return { from, to, items, truncated: papers.length >= 2000 || events.length >= 1000 };
  }

  private async checkClasses(schoolId: string, audience: string, classIds: string[]) {
    if (audience !== "CLASSES") return [];
    const unique = [...new Set(classIds)];
    if ((await this.prisma.class.count({ where: { schoolId, id: { in: unique } } })) !== unique.length) throw new BadRequestException("One of the classes was not found");
    return unique;
  }

  async create(schoolId: string, user: CurrentUser, body: unknown): Promise<EventView> {
    const data = eventSchema.parse(body);
    const classIds = await this.checkClasses(schoolId, data.audience, data.classIds);
    const row = await this.prisma.schoolEvent.create({
      data: {
        schoolId,
        title: data.title,
        description: data.description,
        kind: data.kind,
        startsOn: dateOnly(data.startsOn),
        endsOn: data.endsOn && data.endsOn !== data.startsOn ? dateOnly(data.endsOn) : null,
        allDay: data.allDay,
        startTime: data.allDay ? "" : data.startTime,
        endTime: data.allDay ? "" : data.endTime,
        location: data.location,
        audience: data.audience,
        classIds,
        createdById: user.id,
      },
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "event_created", entity: "event", entityId: row.id, summary: row.title });
    return this.get(schoolId, row.id);
  }

  async update(schoolId: string, user: CurrentUser, id: string, body: unknown): Promise<EventView> {
    const data = eventSchema.parse(body);
    if (!(await this.prisma.schoolEvent.findFirst({ where: { id, schoolId }, select: { id: true } }))) throw new NotFoundException("Event not found");
    const classIds = await this.checkClasses(schoolId, data.audience, data.classIds);
    await this.prisma.schoolEvent.update({
      where: { id },
      data: {
        title: data.title,
        description: data.description,
        kind: data.kind,
        startsOn: dateOnly(data.startsOn),
        endsOn: data.endsOn && data.endsOn !== data.startsOn ? dateOnly(data.endsOn) : null,
        allDay: data.allDay,
        startTime: data.allDay ? "" : data.startTime,
        endTime: data.allDay ? "" : data.endTime,
        location: data.location,
        audience: data.audience,
        classIds,
      },
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "event_updated", entity: "event", entityId: id, summary: data.title });
    return this.get(schoolId, id);
  }

  async remove(schoolId: string, user: CurrentUser, id: string) {
    const row = await this.prisma.schoolEvent.findFirst({ where: { id, schoolId }, select: { id: true, title: true } });
    if (!row) throw new NotFoundException("Event not found");
    await this.prisma.schoolEvent.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "event_deleted", entity: "event", entityId: id, summary: row.title });
    return { ok: true };
  }
}
