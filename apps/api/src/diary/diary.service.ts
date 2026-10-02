import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  canPostDiary,
  diaryCopySchema,
  diaryCreateSchema,
  diaryDateError,
  diaryUpdateSchema,
  holidayOn,
  isDiaryDateOpen,
  isoOf,
  pageParams,
  weekdayOf,
  type DiaryChoices,
  type DiaryEntryView,
  type DiaryKind,
  type DiaryList,
  type DiaryOverview,
  type DiaryToday,
} from "@wellrun/shared";
import { loadHolidays, loadSettings } from "../attendance/rules";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import { dateOnly, karachiToday } from "../common/date";
import { staffForUser } from "../common/school";
import { assertClassWritable } from "../common/year-lock";
import { saveDataUrl } from "../common/uploads";
import type { TeacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";

export type DiaryListQuery = { classId?: string; date?: string; from?: string; to?: string; page?: string; pageSize?: string };

const entrySelect = {
  id: true,
  classId: true,
  subjectId: true,
  date: true,
  kind: true,
  title: true,
  body: true,
  dueOn: true,
  imageUrl: true,
  authorStaffId: true,
  class: { select: { name: true, section: true } },
  subject: { select: { name: true } },
  author: { select: { name: true } },
} satisfies Prisma.DiaryEntrySelect;

type EntryRow = Prisma.DiaryEntryGetPayload<{ select: typeof entrySelect }>;

const classLabel = (cls: { name: string; section: string }) => `${cls.name} ${cls.section}`.trim();

@Injectable()
export class DiaryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private view(row: EntryRow, staffId: string | null, today: string, isAdmin: boolean): DiaryEntryView {
    const mine = Boolean(staffId) && row.authorStaffId === staffId;
    return {
      id: row.id,
      classId: row.classId,
      className: classLabel(row.class),
      subjectId: row.subjectId,
      subject: row.subject?.name ?? null,
      date: isoOf(row.date),
      kind: row.kind,
      title: row.title,
      body: row.body,
      dueOn: row.dueOn ? isoOf(row.dueOn) : null,
      imageUrl: row.imageUrl,
      author: row.author?.name ?? null,
      mine,
      canEdit: mine && isDiaryDateOpen(isoOf(row.date), today),
      canDelete: isAdmin || (mine && isDiaryDateOpen(isoOf(row.date), today)),
    };
  }

  /** The classes and subjects a teacher may write for. Admins read only, so they get nothing here. */
  async choices(schoolId: string, yearId: string, scope: TeacherScope): Promise<DiaryChoices> {
    if (!scope || !scope.classIds.size) return { classes: [] };
    const classes = await this.prisma.class.findMany({
      where: { schoolId, yearId, id: { in: [...scope.classIds] } },
      select: { id: true, name: true, section: true, subjects: { select: { subject: { select: { id: true, name: true, enabled: true } } } } },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });
    const allSubjects = new Map<string, string>();
    return {
      classes: classes.map((cls) => {
        const mapped = cls.subjects.map((row) => row.subject).filter((subject) => subject.enabled);
        for (const subject of mapped) allSubjects.set(subject.id, subject.name);
        const subjects = scope.wholeClassIds.has(cls.id)
          ? mapped
          : mapped.filter((subject) => scope.pairs.has(`${cls.id}:${subject.id}`));
        return {
          id: cls.id,
          label: classLabel(cls),
          gradeName: cls.name,
          subjects: subjects.map((subject) => ({ id: subject.id, name: subject.name })).sort((a, b) => a.name.localeCompare(b.name)),
          canNote: true,
        };
      }),
    };
  }

  async list(schoolId: string, yearId: string, user: CurrentUser, scope: TeacherScope, query: DiaryListQuery): Promise<DiaryList> {
    const { page, pageSize, skip, take } = pageParams(query, 30);
    const staff = scope ? await staffForUser(this.prisma, user) : null;
    const today = karachiToday();
    const where: Prisma.DiaryEntryWhereInput = { schoolId, yearId };
    if (query.classId) {
      if (scope && !scope.classIds.has(query.classId)) throw new ForbiddenException("This class is not assigned to you");
      where.classId = query.classId;
    } else if (scope) {
      where.classId = { in: [...scope.classIds] };
    }
    if (query.date) where.date = dateOnly(query.date);
    else if (query.from || query.to) where.date = { ...(query.from ? { gte: dateOnly(query.from) } : {}), ...(query.to ? { lte: dateOnly(query.to) } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.diaryEntry.findMany({ where, select: entrySelect, orderBy: [{ date: "desc" }, { createdAt: "desc" }, { id: "asc" }], skip, take }),
      this.prisma.diaryEntry.count({ where }),
    ]);
    return { items: rows.map((row) => this.view(row, staff?.id ?? null, today, !scope)), total, page, pageSize };
  }

  async create(schoolId: string, yearId: string, user: CurrentUser, scope: TeacherScope, body: unknown): Promise<DiaryEntryView> {
    if (!scope) throw new ForbiddenException("Teachers write the diary");
    const data = diaryCreateSchema.parse(body);
    const subjectId = data.subjectId ?? null;
    if (!canPostDiary(scope, { classId: data.classId, subjectId, kind: data.kind as DiaryKind })) {
      throw new ForbiddenException(subjectId ? "You don't teach this subject in this class" : "Pick a subject, or post a general note");
    }
    const today = karachiToday();
    const dateProblem = diaryDateError(data.date, today);
    if (dateProblem) throw new BadRequestException(dateProblem);
    const staff = await staffForUser(this.prisma, user);
    if (!staff) throw new ForbiddenException("Your login isn't linked to a staff record");
    const cls = await this.requireClass(schoolId, yearId, data.classId);
    await assertClassWritable(this.prisma, schoolId, cls.id);
    if (subjectId) await this.requireSubject(schoolId, subjectId);
    const row = await this.prisma.diaryEntry.create({
      data: {
        schoolId,
        campusId: cls.campusId,
        yearId,
        classId: cls.id,
        subjectId,
        date: dateOnly(data.date),
        kind: data.kind,
        title: data.title,
        body: data.body,
        dueOn: data.dueOn ? dateOnly(data.dueOn) : null,
        imageUrl: data.image ? saveDataUrl(schoolId, `diary-${cls.id}`, this.imageOnly(data.image)) : "",
        authorStaffId: staff.id,
      },
      select: entrySelect,
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "diary_posted", entity: "diary", entityId: row.id, summary: `${classLabel(cls)} ${data.date}` });
    return this.view(row, staff.id, today, false);
  }

  async update(schoolId: string, user: CurrentUser, scope: TeacherScope, id: string, body: unknown): Promise<DiaryEntryView> {
    if (!scope) throw new ForbiddenException("Teachers write the diary");
    const data = diaryUpdateSchema.parse(body);
    const { entry, staffId } = await this.ownEntry(schoolId, user, id);
    const today = karachiToday();
    const date = data.date ?? isoOf(entry.date);
    const subjectId = data.subjectId === undefined ? entry.subjectId : data.subjectId;
    const kind = (data.kind ?? entry.kind) as DiaryKind;
    if (!canPostDiary(scope, { classId: entry.classId, subjectId, kind })) throw new ForbiddenException("You don't teach this subject in this class");
    if (data.date) {
      const dateProblem = diaryDateError(data.date, today);
      if (dateProblem) throw new BadRequestException(dateProblem);
    }
    const dueOn = data.dueOn === undefined ? (entry.dueOn ? isoOf(entry.dueOn) : null) : data.dueOn;
    if (dueOn && dueOn < date) throw new BadRequestException("Due date can't be before the diary date");
    if (subjectId && subjectId !== entry.subjectId) await this.requireSubject(schoolId, subjectId);
    const row = await this.prisma.diaryEntry.update({
      where: { id },
      data: {
        date: dateOnly(date),
        subjectId,
        kind,
        title: data.title,
        body: data.body,
        dueOn: dueOn ? dateOnly(dueOn) : null,
        imageUrl: data.image ? saveDataUrl(schoolId, `diary-${entry.classId}`, this.imageOnly(data.image)) : data.removeImage ? "" : undefined,
      },
      select: entrySelect,
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "diary_updated", entity: "diary", entityId: id });
    return this.view(row, staffId, today, false);
  }

  async remove(schoolId: string, user: CurrentUser, scope: TeacherScope, id: string) {
    if (scope) await this.ownEntry(schoolId, user, id);
    else {
      // Admins may take down any entry.
      const found = await this.prisma.diaryEntry.findFirst({ where: { id, schoolId }, select: { id: true } });
      if (!found) throw new NotFoundException("Diary entry not found");
    }
    await this.prisma.diaryEntry.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "diary_deleted", entity: "diary", entityId: id });
    return { ok: true };
  }

  /** Copies an entry to other sections of the same grade (the same homework goes to 5A, 5B and 5C). */
  async copy(schoolId: string, yearId: string, user: CurrentUser, scope: TeacherScope, id: string, body: unknown) {
    if (!scope) throw new ForbiddenException("Teachers write the diary");
    const { classIds } = diaryCopySchema.parse(body);
    const { entry, staffId } = await this.ownEntry(schoolId, user, id);
    const source = await this.prisma.class.findFirstOrThrow({ where: { id: entry.classId, schoolId }, select: { name: true } });
    const targets = await this.prisma.class.findMany({
      where: { schoolId, yearId, name: source.name, id: { in: classIds.filter((classId) => classId !== entry.classId) } },
      select: { id: true, name: true, section: true, campusId: true },
    });
    if (targets.length !== new Set(classIds.filter((classId) => classId !== entry.classId)).size) {
      throw new BadRequestException("You can copy only to other sections of the same grade");
    }
    const allowed = targets.filter((cls) => canPostDiary(scope, { classId: cls.id, subjectId: entry.subjectId, kind: entry.kind }));
    if (allowed.length !== targets.length) throw new ForbiddenException("You don't teach this subject in one of those classes");
    for (const cls of targets) await assertClassWritable(this.prisma, schoolId, cls.id);
    await this.prisma.diaryEntry.createMany({
      data: targets.map((cls) => ({
        schoolId,
        campusId: cls.campusId,
        yearId,
        classId: cls.id,
        subjectId: entry.subjectId,
        date: entry.date,
        kind: entry.kind,
        title: entry.title,
        body: entry.body,
        dueOn: entry.dueOn,
        imageUrl: entry.imageUrl,
        authorStaffId: staffId,
      })),
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "diary_copied", entity: "diary", entityId: id, summary: `${targets.length} classes` });
    return { copied: targets.length };
  }

  /** For the teacher's own portal: today's lessons and whether a diary has been posted for each. */
  async today(schoolId: string, yearId: string, user: CurrentUser): Promise<DiaryToday> {
    const date = karachiToday();
    const staff = await staffForUser(this.prisma, user);
    const [settings, holidays] = await Promise.all([loadSettings(this.prisma, schoolId), loadHolidays(this.prisma, schoolId, date, date)]);
    const holiday = holidayOn(date, holidays)?.name ?? null;
    const working = settings.workingWeekdays.includes(weekdayOf(date)) && !holiday;
    if (!staff || !working) return { date, working, holiday, lessons: [] };
    const [lessons, posted] = await Promise.all([
      this.prisma.timetableLesson.findMany({
        where: { schoolId, staffId: staff.id, weekday: weekdayOf(date), class: { yearId } },
        select: { classId: true, subject: true, period: { select: { sortOrder: true } }, class: { select: { name: true, section: true } } },
        orderBy: { period: { sortOrder: "asc" } },
      }),
      this.prisma.diaryEntry.findMany({
        where: { schoolId, authorStaffId: staff.id, date: dateOnly(date) },
        select: { classId: true, subject: { select: { name: true } } },
      }),
    ]);
    const postedKeys = new Set(posted.map((row) => `${row.classId}:${(row.subject?.name ?? "").toLowerCase()}`));
    const postedClasses = new Set(posted.map((row) => row.classId));
    const seen = new Set<string>();
    const out: DiaryToday["lessons"] = [];
    for (const lesson of lessons) {
      const key = `${lesson.classId}:${lesson.subject.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        classId: lesson.classId,
        label: classLabel(lesson.class),
        subject: lesson.subject,
        posted: postedKeys.has(key) || (!lesson.subject.trim() && postedClasses.has(lesson.classId)),
      });
    }
    return { date, working, holiday, lessons: out };
  }

  /** Admin view: which classes have a diary for a day. */
  async overview(schoolId: string, yearId: string, campusId: string | undefined, dateInput?: string): Promise<DiaryOverview> {
    const date = dateInput || karachiToday();
    const [settings, holidays, classes, groups] = await Promise.all([
      loadSettings(this.prisma, schoolId),
      loadHolidays(this.prisma, schoolId, date, date, campusId ?? null),
      this.prisma.class.findMany({
        where: { schoolId, yearId, ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}) },
        select: { id: true, name: true, section: true },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
      this.prisma.diaryEntry.groupBy({ by: ["classId", "subjectId"], where: { schoolId, yearId, date: dateOnly(date) }, _count: { _all: true } }),
    ]);
    const holiday = holidayOn(date, holidays)?.name ?? null;
    const working = settings.workingWeekdays.includes(weekdayOf(date)) && !holiday;
    const byClass = new Map<string, { entries: number; subjects: number }>();
    for (const group of groups) {
      const current = byClass.get(group.classId) ?? { entries: 0, subjects: 0 };
      current.entries += group._count._all;
      current.subjects += 1;
      byClass.set(group.classId, current);
    }
    const rows = classes.map((cls) => ({ id: cls.id, label: classLabel(cls), entries: byClass.get(cls.id)?.entries ?? 0, subjects: byClass.get(cls.id)?.subjects ?? 0 }));
    return { date, working, holiday, classes: rows, posted: rows.filter((row) => row.entries > 0).length, total: rows.length };
  }

  private imageOnly(dataUrl: string) {
    if (!/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(dataUrl)) throw new BadRequestException("Upload a JPG, PNG or WebP photo");
    return dataUrl;
  }

  private async requireClass(schoolId: string, yearId: string, classId: string) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId, yearId }, select: { id: true, name: true, section: true, campusId: true } });
    if (!cls) throw new BadRequestException("Class not found in this academic year");
    return cls;
  }

  private async requireSubject(schoolId: string, subjectId: string) {
    const subject = await this.prisma.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true } });
    if (!subject) throw new BadRequestException("Subject not found");
  }

  /** A teacher may change only their own entries, and only while their day is still recent. */
  private async ownEntry(schoolId: string, user: CurrentUser, id: string) {
    const entry = await this.prisma.diaryEntry.findFirst({ where: { id, schoolId } });
    if (!entry) throw new NotFoundException("Diary entry not found");
    const staff = await staffForUser(this.prisma, user);
    if (!staff || entry.authorStaffId !== staff.id) throw new ForbiddenException("You can change only your own diary entries");
    if (!isDiaryDateOpen(isoOf(entry.date), karachiToday())) {
      throw new BadRequestException("This entry is more than a day old, so it's now a record of what was set");
    }
    await assertClassWritable(this.prisma, schoolId, entry.classId);
    return { entry, staffId: staff.id };
  }
}
