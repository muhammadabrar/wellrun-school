import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { SUBJECTS_BY_GRADE, generateTimetableSchema, lessonSchema, periodSchema } from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertWritableSchool, teacherClassIds } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";

type ClassWithSubjects = { name: string; subjects: { subject: { name: string; enabled: boolean } }[] };

// Subjects that keep their period when there are more subjects than periods, and that fill spare periods.
const CORE_SUBJECTS = ["mathematics", "english", "urdu", "science", "physics", "chemistry", "biology"];

function subjectRank(name: string) {
  const index = CORE_SUBJECTS.indexOf(name.toLowerCase());
  return index === -1 ? CORE_SUBJECTS.length : index;
}

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function toClock(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

@Injectable()
export class TimetableService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  periods(schoolId: string) {
    return this.prisma.timetablePeriod.findMany({
      where: { schoolId },
      select: { id: true, label: true, startTime: true, endTime: true, isBreak: true, sortOrder: true },
      orderBy: { sortOrder: "asc" },
    });
  }

  async savePeriod(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = periodSchema.parse(body);
    const period = await this.prisma.timetablePeriod.create({
      data: { schoolId, ...data, isBreak: data.isBreak ?? false },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "period_created",
      entity: "period",
      entityId: period.id,
    });
    return period;
  }

  async updatePeriod(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const existing = await this.prisma.timetablePeriod.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Period not found");
    const data = periodSchema.partial().parse(body);
    const period = await this.prisma.timetablePeriod.update({ where: { id }, data });
    // A period that becomes a break can't hold lessons any more.
    if (data.isBreak && !existing.isBreak) {
      await this.prisma.timetableLesson.deleteMany({ where: { schoolId, periodId: id } });
    }
    await audit(this.prisma, { schoolId, actorId, action: "period_updated", entity: "period", entityId: id });
    return period;
  }

  async removePeriod(schoolId: string, actorId: string, id: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const existing = await this.prisma.timetablePeriod.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Period not found");
    await this.prisma.timetablePeriod.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "period_deleted", entity: "period", entityId: id });
    return { ok: true };
  }

  async grid(schoolId: string, classId: string | undefined, user: { role: string; email: string; schoolId: string | null }) {
    const allowed = await teacherClassIds(this.prisma, user);
    const focus = classId && (!allowed || allowed.includes(classId)) ? classId : allowed?.[0];
    if (!focus) {
      const periods = await this.periods(schoolId);
      return { classId: null, periods, lessons: [], subjects: [] };
    }
    const [periods, lessons, cls] = await Promise.all([
      this.periods(schoolId),
      this.prisma.timetableLesson.findMany({
        where: { schoolId, classId: focus },
        select: {
          id: true,
          weekday: true,
          subject: true,
          periodId: true,
          staffId: true,
          staff: { select: { name: true } },
        },
      }),
      this.prisma.class.findFirst({
        where: { id: focus, schoolId },
        select: { name: true, subjects: { select: { subject: { select: { name: true, enabled: true } } } } },
      }),
    ]);
    return { classId: focus, periods, lessons, subjects: await this.subjectsFor(schoolId, cls) };
  }

  private async subjectsFor(schoolId: string, cls: ClassWithSubjects | null) {
    if (!cls) return [];
    const needsSchoolList = !cls.subjects.some((row) => row.subject.enabled) && !SUBJECTS_BY_GRADE[cls.name]?.length;
    const enabled = needsSchoolList
      ? (
          await this.prisma.subject.findMany({ where: { schoolId, enabled: true }, select: { name: true }, orderBy: { name: "asc" } })
        ).map((row) => row.name)
      : [];
    return [...new Set(this.resolveSubjects(cls, enabled))];
  }

  private async conflicts(schoolId: string, input: { staffId?: string; weekday: number; periodId: string; classId: string; ignoreId?: string }) {
    if (!input.staffId) return [];
    return this.prisma.timetableLesson.findMany({
      where: {
        schoolId,
        staffId: input.staffId,
        weekday: input.weekday,
        periodId: input.periodId,
        classId: { not: input.classId },
        id: input.ignoreId ? { not: input.ignoreId } : undefined,
      },
      include: { class: true, period: true },
    });
  }

  async upsertLesson(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = lessonSchema.parse(body);
    const clashes = await this.conflicts(schoolId, data);
    if (clashes.length && !data.override) {
      const clash = clashes[0];
      throw new BadRequestException(
        `This teacher is already teaching ${clash.class.name} ${clash.class.section} in ${clash.period.label}. Tick "Allow double-booking" if this is intentional.`,
      );
    }
    const lesson = await this.prisma.timetableLesson.upsert({
      where: {
        classId_weekday_periodId: {
          classId: data.classId,
          weekday: data.weekday,
          periodId: data.periodId,
        },
      },
      update: {
        subject: data.subject,
        staffId: data.staffId || null,
        override: data.override ?? false,
      },
      create: {
        schoolId,
        classId: data.classId,
        periodId: data.periodId,
        weekday: data.weekday,
        subject: data.subject,
        staffId: data.staffId || null,
        override: data.override ?? false,
      },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "lesson_saved",
      entity: "lesson",
      entityId: lesson.id,
    });
    return { lesson, conflicts: clashes };
  }

  async removeLesson(schoolId: string, actorId: string, id: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const existing = await this.prisma.timetableLesson.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Lesson not found");
    await this.prisma.timetableLesson.delete({ where: { id } });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "lesson_deleted",
      entity: "lesson",
      entityId: id,
    });
    return { ok: true };
  }

  /**
   * Builds a week for many classes at once. Each period keeps the same subject every day (period 1
   * is Art on Monday, so it is Art all week), and a teacher is never placed in two classes in the
   * same period. Lessons with no free teacher are still placed, without a teacher, so the admin
   * can fill them in.
   */
  async generate(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = generateTimetableSchema.parse(body);
    const weekdays = [...new Set(data.weekdays)].sort((a, b) => a - b);

    let periods = await this.periods(schoolId);
    let periodsCreated = 0;
    if (!periods.some((period) => !period.isBreak)) {
      if (!data.schedule) throw new BadRequestException("Add the school's periods first, or choose a bell schedule.");
      const { startTime, periodMinutes, periodsPerDay, breakAfter, breakMinutes } = data.schedule;
      const rows: { schoolId: string; label: string; startTime: string; endTime: string; isBreak: boolean; sortOrder: number }[] = [];
      let clock = toMinutes(startTime);
      const base = periods.length;
      for (let index = 1; index <= periodsPerDay; index += 1) {
        rows.push({ schoolId, label: `Period ${index}`, startTime: toClock(clock), endTime: toClock(clock + periodMinutes), isBreak: false, sortOrder: base + rows.length + 1 });
        clock += periodMinutes;
        if (breakAfter === index && breakMinutes > 0 && index < periodsPerDay) {
          rows.push({ schoolId, label: "Break", startTime: toClock(clock), endTime: toClock(clock + breakMinutes), isBreak: true, sortOrder: base + rows.length + 1 });
          clock += breakMinutes;
        }
      }
      await this.prisma.timetablePeriod.createMany({ data: rows });
      periodsCreated = rows.length;
      periods = await this.periods(schoolId);
    }
    const teaching = periods.filter((period) => !period.isBreak);

    const [classes, schoolSubjects, staff] = await Promise.all([
      this.prisma.class.findMany({
        where: { schoolId, id: { in: data.classIds } },
        select: {
          id: true,
          name: true,
          section: true,
          subjects: { select: { subject: { select: { name: true, enabled: true } } } },
          assignments: { select: { staffId: true, subject: true } },
          _count: { select: { lessons: true } },
        },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
      this.prisma.subject.findMany({ where: { schoolId, enabled: true }, select: { name: true }, orderBy: { name: "asc" } }),
      this.prisma.staff.findMany({ where: { schoolId }, select: { id: true, subjects: true } }),
    ]);
    const enabledNames = schoolSubjects.map((row) => row.name);
    const targets = data.mode === "replace" ? classes : classes.filter((cls) => cls._count.lessons === 0);
    const targetIds = targets.map((cls) => cls.id);

    // Teachers already booked by classes we are not touching stay booked.
    const kept = await this.prisma.timetableLesson.findMany({
      where: { schoolId, staffId: { not: null }, classId: { notIn: targetIds } },
      select: { staffId: true, weekday: true, periodId: true },
    });
    const busy = new Set(kept.map((row) => `${row.staffId}|${row.weekday}|${row.periodId}`));
    const load = new Map<string, number>();
    for (const row of kept) load.set(`${row.staffId}|${row.weekday}`, (load.get(`${row.staffId}|${row.weekday}`) ?? 0) + 1);
    const dailyCap = Math.max(1, teaching.length - 1);

    // Teachers who list a subject on their profile can cover any class for it.
    const generalists = new Map<string, string[]>();
    for (const person of staff) {
      const list = Array.isArray(person.subjects) ? (person.subjects as unknown[]) : [];
      for (const subject of list) {
        if (typeof subject !== "string" || !subject.trim()) continue;
        const key = subject.trim().toLowerCase();
        generalists.set(key, [...(generalists.get(key) ?? []), person.id]);
      }
    }

    const lessons: { schoolId: string; classId: string; periodId: string; weekday: number; subject: string; staffId: string | null }[] = [];
    const noSubjects: string[] = [];
    const tooManySubjects: string[] = [];
    let withoutTeacher = 0;

    targets.forEach((cls, classIndex) => {
      const subjects = [...new Set(this.resolveSubjects(cls, enabledNames))];
      if (!subjects.length) {
        noSubjects.push(`${cls.name} ${cls.section}`.trim());
        return;
      }
      const assigned = new Map<string, string[]>();
      for (const row of cls.assignments) {
        if (!row.subject) continue;
        const key = row.subject.trim().toLowerCase();
        assigned.set(key, [...(assigned.get(key) ?? []), row.staffId]);
      }

      // One subject per period, repeated every school day. Core subjects win when there are more
      // subjects than periods, and repeat when there are more periods than subjects.
      const byPriority = [...subjects].sort((a, b) => subjectRank(a) - subjectRank(b));
      if (byPriority.length > teaching.length) tooManySubjects.push(`${cls.name} ${cls.section}`.trim());
      const plan = byPriority.slice(0, teaching.length);
      for (let index = 0; plan.length < teaching.length; index += 1) plan.push(byPriority[index % byPriority.length]);
      // Rotate so sections of the same grade don't all want the same teacher in period 1.
      const shift = classIndex % plan.length;
      const queue = [...plan.slice(shift), ...plan.slice(0, shift)];

      // The teacher must be free in this period on every school day.
      const freeTeacher = (subject: string, periodId: string) => {
        const key = subject.toLowerCase();
        for (const pool of [assigned.get(key) ?? [], generalists.get(key) ?? []]) {
          for (const staffId of pool) {
            const clear = weekdays.every(
              (weekday) => !busy.has(`${staffId}|${weekday}|${periodId}`) && (load.get(`${staffId}|${weekday}`) ?? 0) < dailyCap,
            );
            if (clear) return staffId;
          }
        }
        return null;
      };

      let previous = "";
      for (const period of teaching) {
        // Prefer a subject whose teacher is free, and avoid the same subject twice in a row.
        const withTeacher = queue.findIndex((subject) => subject !== previous && freeTeacher(subject, period.id));
        const different = queue.findIndex((subject) => subject !== previous);
        const index = withTeacher !== -1 ? withTeacher : different !== -1 ? different : 0;
        const [pick] = queue.splice(index, 1);
        const staffId = freeTeacher(pick, period.id);
        for (const weekday of weekdays) {
          if (staffId) {
            busy.add(`${staffId}|${weekday}|${period.id}`);
            load.set(`${staffId}|${weekday}`, (load.get(`${staffId}|${weekday}`) ?? 0) + 1);
          } else {
            withoutTeacher += 1;
          }
          lessons.push({ schoolId, classId: cls.id, periodId: period.id, weekday, subject: pick, staffId });
        }
        previous = pick;
      }
    });

    const filledIds = [...new Set(lessons.map((row) => row.classId))];
    await this.prisma.$transaction([
      this.prisma.timetableLesson.deleteMany({ where: { schoolId, classId: { in: filledIds } } }),
      this.prisma.timetableLesson.createMany({ data: lessons }),
    ]);
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "timetable_generated",
      entity: "lesson",
      entityId: schoolId,
      summary: `${filledIds.length} classes, ${lessons.length} lessons`,
    });
    return {
      classes: filledIds.length,
      skipped: classes.length - targets.length,
      lessons: lessons.length,
      withoutTeacher,
      periodsCreated,
      noSubjects,
      tooManySubjects,
    };
  }

  /** Class subjects → grade defaults → every enabled school subject. */
  private resolveSubjects(cls: ClassWithSubjects, enabled: string[]) {
    const assigned = cls.subjects.filter((row) => row.subject.enabled).map((row) => row.subject.name);
    if (assigned.length) return assigned;
    const grade = SUBJECTS_BY_GRADE[cls.name];
    if (grade?.length) return grade;
    return enabled;
  }
}
