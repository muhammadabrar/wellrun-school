import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { lessonSchema, periodSchema } from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertWritableSchool, teacherClassIds } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TimetableService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  periods(schoolId: string) {
    return this.prisma.timetablePeriod.findMany({
      where: { schoolId },
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

  async grid(schoolId: string, classId: string | undefined, user: { role: string; email: string; schoolId: string | null }) {
    const allowed = await teacherClassIds(this.prisma, user);
    const focus = classId && (!allowed || allowed.includes(classId)) ? classId : allowed?.[0];
    if (!focus) {
      const periods = await this.periods(schoolId);
      return { classId: null, periods, lessons: [] };
    }
    const [periods, lessons] = await Promise.all([
      this.periods(schoolId),
      this.prisma.timetableLesson.findMany({
        where: { schoolId, classId: focus },
        include: { staff: true, period: true },
      }),
    ]);
    return { classId: focus, periods, lessons };
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
        `This teacher is already assigned to ${clash.class.name} ${clash.class.section} in ${clash.period.label}. Tick override if this is intentional.`,
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
}
