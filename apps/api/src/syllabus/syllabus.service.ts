import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  classSortIndex,
  paginate,
  paperCoverageSchema,
  syllabusCopyYearSchema,
  syllabusCreateSchema,
  syllabusOrderSchema,
  syllabusTopicUpdateSchema,
  syllabusTopicsCreateSchema,
  syllabusUnitSchema,
  syllabusUnitUpdateSchema,
  syllabusUpdateSchema,
  topicProgressBulkSchema,
  topicProgressSchema,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import { assertYearOpen, assertYearWritable, yearLockMessage } from "../common/year-lock";
import type { TeacherScope } from "../exams/access";
import { PrismaService } from "../prisma/prisma.service";
import { assertCanEditSyllabus, canEditSyllabus, canViewGrade, gradeKey, syllabusScope, type SyllabusScope } from "./access";
import { replaceCoverage, topicUsage, validateCoverage } from "./coverage";
import {
  coverageFrozen,
  lockMessage,
  mapTermByPosition,
  shiftDate,
  syllabusStats,
  validOrder,
  yearShiftMs,
  type SyllabusStats,
} from "./syllabus.rules";

const isoDate = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
const classLabel = (c: { name: string; section: string }) => (c.section ? `${c.name} ${c.section}` : c.name);

function today() {
  return dateOnly(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi" }).format(new Date()));
}

export type SyllabusListQuery = { gradeName?: string; subjectId?: string; status?: string; q?: string; page?: string; pageSize?: string };

@Injectable()
export class SyllabusService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Shared lookups ------------------------------------------------------------------------------------

  /** Stats for every syllabus of the year (or the given ones) from two light queries. */
  private async statsFor(schoolId: string, yearId: string, syllabusIds?: string[]) {
    const where = { syllabus: { schoolId, yearId, ...(syllabusIds ? { id: { in: syllabusIds } } : {}) } };
    const [units, topics] = await Promise.all([
      this.prisma.syllabusUnit.findMany({ where, select: { id: true, syllabusId: true, plannedTo: true } }),
      this.prisma.syllabusTopic.findMany({
        where,
        select: { syllabusId: true, unitId: true, progress: true, plannedPeriods: true, _count: { select: { examLinks: true } } },
      }),
    ]);
    const ids = new Set<string>([...units.map((u) => u.syllabusId), ...topics.map((t) => t.syllabusId)]);
    const out = new Map<string, SyllabusStats>();
    const now = today();
    for (const id of ids) {
      out.set(
        id,
        syllabusStats(
          units.filter((u) => u.syllabusId === id),
          topics.filter((t) => t.syllabusId === id).map((t) => ({ unitId: t.unitId, progress: t.progress, plannedPeriods: t.plannedPeriods, locked: t._count.examLinks > 0 })),
          now,
        ),
      );
    }
    return out;
  }

  /** Teacher names per grade + subject, from teacher assignments (matched to subjects by name). */
  private async teachersFor(schoolId: string, yearId: string) {
    const [assignments, subjects] = await Promise.all([
      this.prisma.teacherAssignment.findMany({
        where: { schoolId, subject: { not: "" }, class: { yearId } },
        select: { subject: true, class: { select: { name: true } }, staff: { select: { name: true } } },
      }),
      this.prisma.subject.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ]);
    const idByName = new Map(subjects.map((s) => [s.name.trim().toLowerCase(), s.id]));
    const out = new Map<string, string[]>();
    for (const a of assignments) {
      const subjectId = idByName.get(a.subject.trim().toLowerCase());
      if (!subjectId) continue;
      const key = gradeKey(a.class.name, subjectId);
      const names = out.get(key) ?? [];
      if (!names.includes(a.staff.name)) names.push(a.staff.name);
      out.set(key, names);
    }
    return out;
  }

  private async scopeFor(schoolId: string, yearId: string, teacher: TeacherScope) {
    return syllabusScope(this.prisma, schoolId, yearId, teacher);
  }

  /** The syllabus a write touches: it must exist in this school, its year must be open and the user may edit it. */
  private async editable(schoolId: string, id: string, teacher: TeacherScope) {
    const syllabus = await this.prisma.syllabus.findFirst({ where: { id, schoolId }, select: { id: true, yearId: true, gradeName: true, subjectId: true } });
    if (!syllabus) throw new NotFoundException("Syllabus not found");
    await assertYearWritable(this.prisma, schoolId, syllabus.yearId);
    assertCanEditSyllabus(await this.scopeFor(schoolId, syllabus.yearId, teacher), syllabus.gradeName, syllabus.subjectId);
    return syllabus;
  }

  private async unitForWrite(schoolId: string, unitId: string, teacher: TeacherScope) {
    const unit = await this.prisma.syllabusUnit.findFirst({
      where: { id: unitId, syllabus: { schoolId } },
      select: { id: true, title: true, syllabusId: true, topics: { select: { id: true, _count: { select: { examLinks: true } } } } },
    });
    if (!unit) throw new NotFoundException("Unit not found");
    const syllabus = await this.editable(schoolId, unit.syllabusId, teacher);
    return { unit, syllabus };
  }

  private async topicForWrite(schoolId: string, topicId: string, teacher: TeacherScope) {
    const topic = await this.prisma.syllabusTopic.findFirst({
      where: { id: topicId, syllabus: { schoolId } },
      select: { id: true, title: true, objectives: true, resources: true, plannedPeriods: true, unitId: true, syllabusId: true, _count: { select: { examLinks: true } } },
    });
    if (!topic) throw new NotFoundException("Topic not found");
    const syllabus = await this.editable(schoolId, topic.syllabusId, teacher);
    return { topic, syllabus };
  }

  private async lockedConflict(topicIds: string[], what: string): Promise<never> {
    const usage = await topicUsage(this.prisma, topicIds);
    throw new ConflictException(lockMessage([...usage.values()].flat(), what));
  }

  private async lockedIn(topicIds: string[]) {
    if (!topicIds.length) return [];
    const rows = await this.prisma.examPaperTopic.findMany({ where: { topicId: { in: topicIds } }, select: { topicId: true }, distinct: ["topicId"] });
    return rows.map((r) => r.topicId);
  }

  private async assertWithinYear(yearId: string, from?: string | null, to?: string | null) {
    if (!from && !to) return;
    const year = await this.prisma.academicYear.findUnique({ where: { id: yearId }, select: { name: true, startsOn: true, endsOn: true } });
    if (!year) return;
    const lo = isoDate(year.startsOn)!;
    const hi = isoDate(year.endsOn)!;
    for (const value of [from, to]) {
      if (value && (value.slice(0, 10) < lo || value.slice(0, 10) > hi)) throw new BadRequestException(`Planned dates must fall within ${year.name} (${lo} to ${hi})`);
    }
  }

  private async assertTermInYear(yearId: string, termId?: string | null) {
    if (!termId) return;
    const found = await this.prisma.term.count({ where: { id: termId, yearId } });
    if (!found) throw new BadRequestException("That term isn't part of this academic year");
  }

  // Reading ---------------------------------------------------------------------------------------------------

  /** Grade × subject grid with progress; every cell says whether a syllabus exists and how teaching is going. */
  async overview(schoolId: string, yearId: string, teacher: TeacherScope) {
    const scope = await this.scopeFor(schoolId, yearId, teacher);
    const [year, classes, subjects, syllabi, stats, teachers] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: yearId, schoolId }, select: { id: true, name: true, status: true } }),
      this.prisma.class.findMany({ where: { schoolId, yearId }, select: { name: true, subjects: { select: { subjectId: true } } } }),
      this.prisma.subject.findMany({ where: { schoolId, enabled: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      this.prisma.syllabus.findMany({ where: { schoolId, yearId }, select: { id: true, gradeName: true, subjectId: true, updatedAt: true } }),
      this.statsFor(schoolId, yearId),
      this.teachersFor(schoolId, yearId),
    ]);
    const gradeMap = new Map<string, { sections: number; subjectIds: Set<string> }>();
    for (const c of classes) {
      const g = gradeMap.get(c.name) ?? { sections: 0, subjectIds: new Set<string>() };
      g.sections += 1;
      c.subjects.forEach((s) => g.subjectIds.add(s.subjectId));
      gradeMap.set(c.name, g);
    }
    const byKey = new Map(syllabi.map((s) => [gradeKey(s.gradeName, s.subjectId), s]));
    const grades = [...gradeMap]
      .filter(([name]) => canViewGrade(scope, name))
      .sort((a, b) => classSortIndex(a[0]) - classSortIndex(b[0]) || a[0].localeCompare(b[0]))
      .map(([name, g]) => ({
        name,
        sections: g.sections,
        cells: subjects
          .filter((s) => g.subjectIds.has(s.id) || byKey.has(gradeKey(name, s.id)))
          .map((s) => {
            const syllabus = byKey.get(gradeKey(name, s.id));
            return {
              subjectId: s.id,
              syllabusId: syllabus?.id ?? null,
              stats: syllabus ? (stats.get(syllabus.id) ?? null) : null,
              teachers: teachers.get(gradeKey(name, s.id)) ?? [],
              canEdit: canEditSyllabus(scope, name, s.id),
            };
          }),
      }));
    const all = grades.flatMap((g) => g.cells);
    const mine = all.filter((c) => c.syllabusId);
    return {
      year,
      subjects,
      grades,
      summary: {
        slots: all.length,
        created: mine.length,
        missing: all.length - mine.length,
        behind: mine.filter((c) => c.stats?.status === "BEHIND").length,
        complete: mine.filter((c) => c.stats?.status === "COMPLETE").length,
        locked: mine.reduce((s, c) => s + (c.stats?.locked ?? 0), 0),
        topics: mine.reduce((s, c) => s + (c.stats?.topics ?? 0), 0),
        taught: mine.reduce((s, c) => s + (c.stats?.completed ?? 0), 0),
      },
    };
  }

  async list(schoolId: string, yearId: string, query: SyllabusListQuery, teacher: TeacherScope) {
    const scope = await this.scopeFor(schoolId, yearId, teacher);
    const [rows, stats, teachers] = await Promise.all([
      this.prisma.syllabus.findMany({
        where: {
          schoolId,
          yearId,
          ...(query.gradeName ? { gradeName: query.gradeName } : {}),
          ...(query.subjectId ? { subjectId: query.subjectId } : {}),
          ...(query.q ? { OR: [{ gradeName: { contains: query.q, mode: "insensitive" } }, { subject: { name: { contains: query.q, mode: "insensitive" } } }] } : {}),
        },
        select: { id: true, gradeName: true, subjectId: true, updatedAt: true, subject: { select: { name: true } } },
      }),
      this.statsFor(schoolId, yearId),
      this.teachersFor(schoolId, yearId),
    ]);
    const visible = rows
      .filter((r) => canViewGrade(scope, r.gradeName))
      .map((r) => ({
        id: r.id,
        gradeName: r.gradeName,
        subject: { id: r.subjectId, name: r.subject.name },
        stats: stats.get(r.id) ?? syllabusStats([], [], today()),
        teachers: teachers.get(gradeKey(r.gradeName, r.subjectId)) ?? [],
        updatedAt: r.updatedAt,
        canEdit: canEditSyllabus(scope, r.gradeName, r.subjectId),
      }));
    const statusCounts: Record<string, number> = {};
    visible.forEach((r) => (statusCounts[r.stats.status] = (statusCounts[r.stats.status] ?? 0) + 1));
    const filtered = (query.status ? visible.filter((r) => r.stats.status === query.status) : visible).sort(
      (a, b) => classSortIndex(a.gradeName) - classSortIndex(b.gradeName) || a.gradeName.localeCompare(b.gradeName) || a.subject.name.localeCompare(b.subject.name),
    );
    return { ...paginate(filtered, query, 25), statusCounts };
  }

  async detail(schoolId: string, id: string, teacher: TeacherScope) {
    const syllabus = await this.prisma.syllabus.findFirst({
      where: { id, schoolId },
      include: {
        year: { select: { id: true, name: true, status: true } },
        subject: { select: { id: true, name: true } },
        units: {
          orderBy: { sortOrder: "asc" },
          include: { topics: { orderBy: { sortOrder: "asc" } } },
        },
      },
    });
    if (!syllabus) throw new NotFoundException("Syllabus not found");
    const scope = await this.scopeFor(schoolId, syllabus.yearId, teacher);
    if (!canViewGrade(scope, syllabus.gradeName)) throw new ForbiddenException("This class is not assigned to you");
    const topicIds = syllabus.units.flatMap((u) => u.topics.map((t) => t.id));
    const [usage, terms, classes, teachers] = await Promise.all([
      topicUsage(this.prisma, topicIds),
      this.prisma.term.findMany({ where: { schoolId, yearId: syllabus.yearId }, orderBy: [{ sortOrder: "asc" }, { startsOn: "asc" }], select: { id: true, name: true } }),
      this.prisma.class.findMany({ where: { schoolId, yearId: syllabus.yearId, name: syllabus.gradeName }, orderBy: { section: "asc" }, select: { id: true, name: true, section: true } }),
      this.teachersFor(schoolId, syllabus.yearId),
    ]);
    const yearClosed = syllabus.year.status === "CLOSED";
    const canEdit = !yearClosed && canEditSyllabus(scope, syllabus.gradeName, syllabus.subjectId);
    const readOnlyReason = yearClosed
      ? yearLockMessage(syllabus.year)
      : canEdit
        ? null
        : "You can view this syllabus. Only the subject teacher or an admin can change it.";
    const units = syllabus.units.map((u) => {
      const topics = u.topics.map((t) => ({
        id: t.id,
        title: t.title,
        objectives: t.objectives,
        resources: t.resources,
        plannedPeriods: t.plannedPeriods,
        sortOrder: t.sortOrder,
        progress: t.progress,
        completedOn: isoDate(t.completedOn),
        locked: usage.has(t.id),
        usedIn: usage.get(t.id) ?? [],
      }));
      return {
        id: u.id,
        title: u.title,
        description: u.description,
        termId: u.termId,
        plannedFrom: isoDate(u.plannedFrom),
        plannedTo: isoDate(u.plannedTo),
        sortOrder: u.sortOrder,
        locked: topics.some((t) => t.locked),
        topics,
      };
    });
    const stats = syllabusStats(
      syllabus.units.map((u) => ({ id: u.id, plannedTo: u.plannedTo })),
      syllabus.units.flatMap((u) => u.topics.map((t) => ({ unitId: u.id, progress: t.progress, plannedPeriods: t.plannedPeriods, locked: usage.has(t.id) }))),
      today(),
    );
    return {
      id: syllabus.id,
      year: syllabus.year,
      gradeName: syllabus.gradeName,
      subject: syllabus.subject,
      overview: syllabus.overview,
      assessmentNotes: syllabus.assessmentNotes,
      resources: syllabus.resources,
      updatedAt: syllabus.updatedAt,
      classes: classes.map((c) => ({ id: c.id, label: classLabel(c) })),
      teachers: teachers.get(gradeKey(syllabus.gradeName, syllabus.subjectId)) ?? [],
      terms,
      stats,
      permissions: { canEdit, readOnlyReason },
      units,
    };
  }

  /** Existing syllabi of the same subject (any year or grade) to start a new one from. */
  async sources(schoolId: string, yearId: string, query: { subjectId?: string }, teacher: TeacherScope) {
    if (!query.subjectId) throw new BadRequestException("Pick a subject");
    const scope = await this.scopeFor(schoolId, yearId, teacher);
    const rows = await this.prisma.syllabus.findMany({
      where: { schoolId, subjectId: query.subjectId, units: { some: {} } },
      select: { id: true, gradeName: true, year: { select: { name: true, startsOn: true } }, _count: { select: { topics: true, units: true } } },
      take: 80,
    });
    return rows
      .filter((r) => canViewGrade(scope, r.gradeName))
      .sort((a, b) => b.year.startsOn.getTime() - a.year.startsOn.getTime() || classSortIndex(a.gradeName) - classSortIndex(b.gradeName))
      .map((r) => ({ id: r.id, label: `${r.gradeName} · ${r.year.name}`, units: r._count.units, topics: r._count.topics }));
  }

  // Writing: syllabus ------------------------------------------------------------------------------------------

  async create(schoolId: string, actorId: string, yearId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = syllabusCreateSchema.parse(body);
    await assertYearWritable(this.prisma, schoolId, yearId);
    const [grade, subject] = await Promise.all([
      this.prisma.class.findFirst({ where: { schoolId, yearId, name: data.gradeName }, select: { id: true } }),
      this.prisma.subject.findFirst({ where: { id: data.subjectId, schoolId }, select: { id: true } }),
    ]);
    if (!grade) throw new BadRequestException(`There is no ${data.gradeName} class in this academic year`);
    if (!subject) throw new BadRequestException("Subject not found");
    assertCanEditSyllabus(await this.scopeFor(schoolId, yearId, teacher), data.gradeName, data.subjectId);

    const existing = await this.prisma.syllabus.findUnique({ where: { yearId_gradeName_subjectId: { yearId, gradeName: data.gradeName, subjectId: data.subjectId } }, select: { id: true } });
    if (existing) return { id: existing.id, existed: true, units: 0, topics: 0 };

    const source = data.copyFromId
      ? await this.prisma.syllabus.findFirst({ where: { id: data.copyFromId, schoolId }, select: { id: true, yearId: true, overview: true, assessmentNotes: true, resources: true } })
      : null;
    if (data.copyFromId && !source) throw new NotFoundException("The syllabus to copy from was not found");

    const created = await this.prisma.$transaction(async (tx) => {
      const syllabus = await tx.syllabus.create({
        data: {
          schoolId,
          yearId,
          gradeName: data.gradeName,
          subjectId: data.subjectId,
          updatedById: actorId,
          ...(source ? { overview: source.overview, assessmentNotes: source.assessmentNotes, resources: source.resources } : {}),
        },
        select: { id: true },
      });
      const copied = source ? await this.cloneContent(tx, source.id, source.yearId, syllabus.id, yearId) : { units: 0, topics: 0 };
      return { id: syllabus.id, ...copied };
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "syllabus_created",
      entity: "syllabus",
      entityId: created.id,
      summary: `${data.gradeName}${source ? ` (copied: ${created.topics} topics)` : ""}`,
    });
    return { ...created, existed: false };
  }

  /** Units and topics of one syllabus copied into another. Progress and exam links are never carried over. */
  private async cloneContent(tx: Prisma.TransactionClient, sourceId: string, sourceYearId: string, targetId: string, targetYearId: string) {
    const source = await tx.syllabus.findUniqueOrThrow({
      where: { id: sourceId },
      select: { units: { orderBy: { sortOrder: "asc" }, select: { title: true, description: true, termId: true, plannedFrom: true, plannedTo: true, topics: { orderBy: { sortOrder: "asc" } } } } },
    });
    const sameYear = sourceYearId === targetYearId;
    let shift = 0;
    let oldTerms: { id: string }[] = [];
    let newTerms: { id: string }[] = [];
    if (!sameYear) {
      const [from, to, ot, nt] = await Promise.all([
        tx.academicYear.findUniqueOrThrow({ where: { id: sourceYearId }, select: { startsOn: true } }),
        tx.academicYear.findUniqueOrThrow({ where: { id: targetYearId }, select: { startsOn: true } }),
        tx.term.findMany({ where: { yearId: sourceYearId }, orderBy: [{ sortOrder: "asc" }, { startsOn: "asc" }], select: { id: true } }),
        tx.term.findMany({ where: { yearId: targetYearId }, orderBy: [{ sortOrder: "asc" }, { startsOn: "asc" }], select: { id: true } }),
      ]);
      shift = yearShiftMs(from.startsOn, to.startsOn);
      oldTerms = ot;
      newTerms = nt;
    }
    const units: Prisma.SyllabusUnitCreateManyInput[] = [];
    const topics: Prisma.SyllabusTopicCreateManyInput[] = [];
    source.units.forEach((u, unitIndex) => {
      const unitId = randomUUID();
      units.push({
        id: unitId,
        syllabusId: targetId,
        title: u.title,
        description: u.description,
        termId: sameYear ? u.termId : mapTermByPosition(u.termId, oldTerms, newTerms),
        plannedFrom: sameYear ? u.plannedFrom : shiftDate(u.plannedFrom, shift),
        plannedTo: sameYear ? u.plannedTo : shiftDate(u.plannedTo, shift),
        sortOrder: unitIndex,
      });
      u.topics.forEach((t, topicIndex) =>
        topics.push({ syllabusId: targetId, unitId, title: t.title, objectives: t.objectives, resources: t.resources, plannedPeriods: t.plannedPeriods, sortOrder: topicIndex }),
      );
    });
    if (units.length) await tx.syllabusUnit.createMany({ data: units });
    if (topics.length) await tx.syllabusTopic.createMany({ data: topics });
    return { units: units.length, topics: topics.length };
  }

  async update(schoolId: string, actorId: string, id: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = syllabusUpdateSchema.parse(body);
    await this.editable(schoolId, id, teacher);
    const updated = await this.prisma.syllabus.update({ where: { id }, data: { ...data, updatedById: actorId }, select: { id: true, updatedAt: true } });
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_updated", entity: "syllabus", entityId: id });
    return updated;
  }

  async remove(schoolId: string, actorId: string, id: string, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const syllabus = await this.editable(schoolId, id, teacher);
    const topicIds = (await this.prisma.syllabusTopic.findMany({ where: { syllabusId: id }, select: { id: true } })).map((t) => t.id);
    if ((await this.lockedIn(topicIds)).length) await this.lockedConflict(topicIds, "deleted");
    await this.prisma.syllabus.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_deleted", entity: "syllabus", entityId: id, summary: syllabus.gradeName });
    return { ok: true };
  }

  /** Carry every syllabus of an earlier year into this one (new-year start). Existing syllabi are left alone. */
  async copyYear(schoolId: string, actorId: string, toYearId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const { fromYearId } = syllabusCopyYearSchema.parse(body);
    if (fromYearId === toYearId) throw new BadRequestException("Pick a different year to copy from");
    const [from, to] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: fromYearId, schoolId }, select: { id: true, name: true } }),
      this.prisma.academicYear.findFirst({ where: { id: toYearId, schoolId }, select: { id: true, name: true, status: true } }),
    ]);
    if (!from || !to) throw new NotFoundException("Academic year not found");
    assertYearOpen(to);
    const [sources, classes, existing] = await Promise.all([
      this.prisma.syllabus.findMany({ where: { schoolId, yearId: fromYearId }, select: { id: true, gradeName: true, subjectId: true, overview: true, assessmentNotes: true, resources: true } }),
      this.prisma.class.findMany({ where: { schoolId, yearId: toYearId }, select: { name: true } }),
      this.prisma.syllabus.findMany({ where: { schoolId, yearId: toYearId }, select: { gradeName: true, subjectId: true } }),
    ]);
    const grades = new Set(classes.map((c) => c.name));
    const have = new Set(existing.map((e) => gradeKey(e.gradeName, e.subjectId)));
    let created = 0;
    let skipped = 0;
    let topics = 0;
    for (const s of sources) {
      if (!grades.has(s.gradeName) || have.has(gradeKey(s.gradeName, s.subjectId))) {
        skipped += 1;
        continue;
      }
      const copied = await this.prisma.$transaction(async (tx) => {
        const syllabus = await tx.syllabus.create({
          data: { schoolId, yearId: toYearId, gradeName: s.gradeName, subjectId: s.subjectId, overview: s.overview, assessmentNotes: s.assessmentNotes, resources: s.resources, updatedById: actorId },
          select: { id: true },
        });
        return this.cloneContent(tx, s.id, fromYearId, syllabus.id, toYearId);
      });
      created += 1;
      topics += copied.topics;
    }
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_year_copied", entity: "syllabus", entityId: toYearId, summary: `${from.name} → ${to.name}: ${created} syllabi, ${topics} topics` });
    return { created, skipped, topics };
  }

  // Writing: units ------------------------------------------------------------------------------------------------

  async createUnit(schoolId: string, actorId: string, syllabusId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = syllabusUnitSchema.parse(body);
    const syllabus = await this.editable(schoolId, syllabusId, teacher);
    await Promise.all([this.assertTermInYear(syllabus.yearId, data.termId), this.assertWithinYear(syllabus.yearId, data.plannedFrom, data.plannedTo)]);
    const last = await this.prisma.syllabusUnit.aggregate({ where: { syllabusId }, _max: { sortOrder: true } });
    const unit = await this.prisma.syllabusUnit.create({
      data: {
        syllabusId,
        title: data.title,
        description: data.description,
        termId: data.termId || null,
        plannedFrom: data.plannedFrom ? dateOnly(data.plannedFrom) : null,
        plannedTo: data.plannedTo ? dateOnly(data.plannedTo) : null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
      },
      select: { id: true },
    });
    await this.touch(syllabusId, actorId);
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_unit_added", entity: "syllabus", entityId: syllabusId, summary: data.title });
    return unit;
  }

  async updateUnit(schoolId: string, actorId: string, unitId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = syllabusUnitUpdateSchema.parse(body);
    const { unit, syllabus } = await this.unitForWrite(schoolId, unitId, teacher);
    if (data.title !== undefined && data.title !== unit.title) {
      const locked = await this.lockedIn(unit.topics.map((t) => t.id));
      if (locked.length) await this.lockedConflict(locked, "renamed");
    }
    await Promise.all([this.assertTermInYear(syllabus.yearId, data.termId), this.assertWithinYear(syllabus.yearId, data.plannedFrom, data.plannedTo)]);
    await this.prisma.syllabusUnit.update({
      where: { id: unitId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.termId !== undefined ? { termId: data.termId || null } : {}),
        ...(data.plannedFrom !== undefined ? { plannedFrom: data.plannedFrom ? dateOnly(data.plannedFrom) : null } : {}),
        ...(data.plannedTo !== undefined ? { plannedTo: data.plannedTo ? dateOnly(data.plannedTo) : null } : {}),
      },
    });
    await this.touch(syllabus.id, actorId);
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_unit_updated", entity: "syllabus", entityId: syllabus.id, summary: unit.title });
    return { ok: true };
  }

  async removeUnit(schoolId: string, actorId: string, unitId: string, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const { unit, syllabus } = await this.unitForWrite(schoolId, unitId, teacher);
    const locked = await this.lockedIn(unit.topics.map((t) => t.id));
    if (locked.length) await this.lockedConflict(locked, "deleted");
    await this.prisma.syllabusUnit.delete({ where: { id: unitId } });
    await this.touch(syllabus.id, actorId);
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_unit_deleted", entity: "syllabus", entityId: syllabus.id, summary: unit.title });
    return { ok: true };
  }

  async reorderUnits(schoolId: string, actorId: string, syllabusId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const { ids } = syllabusOrderSchema.parse(body);
    await this.editable(schoolId, syllabusId, teacher);
    const existing = (await this.prisma.syllabusUnit.findMany({ where: { syllabusId }, select: { id: true } })).map((u) => u.id);
    if (!validOrder(ids, existing)) throw new BadRequestException("The unit list changed — refresh and try again");
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.syllabusUnit.update({ where: { id }, data: { sortOrder: index } })));
    await this.touch(syllabusId, actorId);
    return { ok: true };
  }

  // Writing: topics -------------------------------------------------------------------------------------------------

  /** One topic or a pasted list; adding to a unit that has locked topics is fine. */
  async createTopics(schoolId: string, actorId: string, unitId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = syllabusTopicsCreateSchema.parse(body);
    const { syllabus } = await this.unitForWrite(schoolId, unitId, teacher);
    const current = await this.prisma.syllabusTopic.findMany({ where: { unitId }, select: { title: true, sortOrder: true } });
    const have = new Set(current.map((t) => t.title.trim().toLowerCase()));
    const titles = data.titles.filter((t) => {
      const key = t.trim().toLowerCase();
      if (have.has(key)) return false;
      have.add(key);
      return true;
    });
    const start = current.reduce((m, t) => Math.max(m, t.sortOrder), -1) + 1;
    if (titles.length) {
      await this.prisma.syllabusTopic.createMany({
        data: titles.map((title, i) => ({ syllabusId: syllabus.id, unitId, title, plannedPeriods: data.plannedPeriods ?? 1, sortOrder: start + i })),
      });
      await this.touch(syllabus.id, actorId);
      await audit(this.prisma, { schoolId, actorId, action: "syllabus_topics_added", entity: "syllabus", entityId: syllabus.id, summary: `${titles.length} topics` });
    }
    return { added: titles.length, skipped: data.titles.length - titles.length };
  }

  async updateTopic(schoolId: string, actorId: string, topicId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = syllabusTopicUpdateSchema.parse(body);
    const { topic, syllabus } = await this.topicForWrite(schoolId, topicId, teacher);
    const changes =
      (data.title !== undefined && data.title !== topic.title) ||
      (data.objectives !== undefined && data.objectives !== topic.objectives) ||
      (data.resources !== undefined && data.resources !== topic.resources) ||
      (data.plannedPeriods !== undefined && data.plannedPeriods !== topic.plannedPeriods);
    const moving = data.unitId !== undefined && data.unitId !== topic.unitId;
    if (topic._count.examLinks > 0 && (changes || moving)) await this.lockedConflict([topicId], moving && !changes ? "moved" : "edited");
    if (moving) {
      const target = await this.prisma.syllabusUnit.findFirst({ where: { id: data.unitId, syllabusId: syllabus.id }, select: { id: true } });
      if (!target) throw new BadRequestException("That unit isn't part of this syllabus");
    }
    let sortOrder: number | undefined;
    if (moving) {
      const last = await this.prisma.syllabusTopic.aggregate({ where: { unitId: data.unitId }, _max: { sortOrder: true } });
      sortOrder = (last._max.sortOrder ?? -1) + 1;
    }
    await this.prisma.syllabusTopic.update({
      where: { id: topicId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.objectives !== undefined ? { objectives: data.objectives } : {}),
        ...(data.resources !== undefined ? { resources: data.resources } : {}),
        ...(data.plannedPeriods !== undefined ? { plannedPeriods: data.plannedPeriods } : {}),
        ...(moving ? { unitId: data.unitId, sortOrder } : {}),
      },
    });
    await this.touch(syllabus.id, actorId);
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_topic_updated", entity: "syllabus", entityId: syllabus.id, summary: topic.title });
    return { ok: true };
  }

  async removeTopic(schoolId: string, actorId: string, topicId: string, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const { topic, syllabus } = await this.topicForWrite(schoolId, topicId, teacher);
    if (topic._count.examLinks > 0) await this.lockedConflict([topicId], "deleted");
    await this.prisma.syllabusTopic.delete({ where: { id: topicId } });
    await this.touch(syllabus.id, actorId);
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_topic_deleted", entity: "syllabus", entityId: syllabus.id, summary: topic.title });
    return { ok: true };
  }

  async reorderTopics(schoolId: string, actorId: string, unitId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const { ids } = syllabusOrderSchema.parse(body);
    const { unit, syllabus } = await this.unitForWrite(schoolId, unitId, teacher);
    if (!validOrder(ids, unit.topics.map((t) => t.id))) throw new BadRequestException("The topic list changed — refresh and try again");
    await this.prisma.$transaction(ids.map((id, index) => this.prisma.syllabusTopic.update({ where: { id }, data: { sortOrder: index } })));
    await this.touch(syllabus.id, actorId);
    return { ok: true };
  }

  /** Teaching progress is a record of what happened in class, so it stays editable even on locked topics. */
  async setProgress(schoolId: string, actorId: string, topicId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = topicProgressSchema.parse(body);
    const { topic, syllabus } = await this.topicForWrite(schoolId, topicId, teacher);
    await this.prisma.syllabusTopic.update({
      where: { id: topicId },
      data: { progress: data.progress, completedOn: data.progress === "COMPLETED" ? (data.completedOn ? dateOnly(data.completedOn) : today()) : null },
    });
    await this.touch(syllabus.id, actorId);
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_progress", entity: "syllabus", entityId: syllabus.id, summary: `${topic.title}: ${data.progress}` });
    return { ok: true };
  }

  async setProgressBulk(schoolId: string, actorId: string, body: unknown, teacher: TeacherScope) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = topicProgressBulkSchema.parse(body);
    const topics = await this.prisma.syllabusTopic.findMany({ where: { id: { in: data.topicIds }, syllabus: { schoolId } }, select: { id: true, syllabusId: true } });
    if (topics.length !== new Set(data.topicIds).size) throw new NotFoundException("Some topics were not found");
    const syllabusIds = [...new Set(topics.map((t) => t.syllabusId))];
    if (syllabusIds.length !== 1) throw new BadRequestException("Update topics of one syllabus at a time");
    await this.editable(schoolId, syllabusIds[0], teacher);
    await this.prisma.syllabusTopic.updateMany({
      where: { id: { in: topics.map((t) => t.id) } },
      data: { progress: data.progress, completedOn: data.progress === "COMPLETED" ? (data.completedOn ? dateOnly(data.completedOn) : today()) : null },
    });
    await this.touch(syllabusIds[0], actorId);
    await audit(this.prisma, { schoolId, actorId, action: "syllabus_progress", entity: "syllabus", entityId: syllabusIds[0], summary: `${topics.length} topics: ${data.progress}` });
    return { updated: topics.length };
  }

  private touch(syllabusId: string, actorId: string) {
    return this.prisma.syllabus.update({ where: { id: syllabusId }, data: { updatedById: actorId }, select: { id: true } });
  }

  // Exam coverage -----------------------------------------------------------------------------------------------------

  /** Units and topics of one grade + subject, for pickers (exam wizard, paper coverage). */
  async coverageOptions(schoolId: string, yearId: string, query: { gradeName?: string; subjectId?: string }, teacher: TeacherScope) {
    if (!query.gradeName || !query.subjectId) throw new BadRequestException("Pick a class and subject");
    const scope = await this.scopeFor(schoolId, yearId, teacher);
    if (!canViewGrade(scope, query.gradeName)) throw new ForbiddenException("This class is not assigned to you");
    return this.optionsTree(schoolId, yearId, query.gradeName, query.subjectId);
  }

  private async optionsTree(schoolId: string, yearId: string, gradeName: string, subjectId: string) {
    const syllabus = await this.prisma.syllabus.findUnique({
      where: { yearId_gradeName_subjectId: { yearId, gradeName, subjectId } },
      select: {
        id: true,
        schoolId: true,
        units: {
          orderBy: { sortOrder: "asc" },
          select: {
            id: true,
            title: true,
            termId: true,
            term: { select: { name: true } },
            plannedTo: true,
            topics: { orderBy: { sortOrder: "asc" }, select: { id: true, title: true, progress: true, _count: { select: { examLinks: true } } } },
          },
        },
      },
    });
    if (!syllabus || syllabus.schoolId !== schoolId) return { syllabusId: null as string | null, units: [] as CoverageUnit[] };
    return {
      syllabusId: syllabus.id as string | null,
      units: syllabus.units.map<CoverageUnit>((u) => ({
        id: u.id,
        title: u.title,
        termId: u.termId,
        termName: u.term?.name ?? "",
        plannedTo: isoDate(u.plannedTo),
        topics: u.topics.map((t) => ({ id: t.id, title: t.title, progress: t.progress, usedByExams: t._count.examLinks })),
      })),
    };
  }

  /** What a paper covers, with the full syllabus to pick from. */
  async paperCoverage(schoolId: string, paperId: string, teacher: TeacherScope) {
    const paper = await this.prisma.examPaper.findFirst({
      where: { id: paperId, schoolId },
      select: {
        id: true,
        status: true,
        classId: true,
        subjectId: true,
        class: { select: { name: true, section: true } },
        subject: { select: { name: true } },
        exam: { select: { id: true, name: true, kind: true, status: true, yearId: true } },
        topics: { select: { topicId: true } },
      },
    });
    if (!paper) throw new NotFoundException("Paper not found");
    if (teacher && !teacher.classIds.has(paper.classId)) throw new ForbiddenException("This class is not assigned to you");
    const tree = await this.optionsTree(schoolId, paper.exam.yearId, paper.class.name, paper.subjectId);
    const frozen = coverageFrozen(paper.status, paper.exam.status);
    return {
      paper: {
        id: paper.id,
        examId: paper.exam.id,
        examName: paper.exam.name,
        kind: paper.exam.kind,
        className: classLabel(paper.class),
        gradeName: paper.class.name,
        subject: paper.subject.name,
        subjectId: paper.subjectId,
        frozen,
        frozenReason: frozen ? "Marks are in review or approved, or results are published — coverage can't change any more." : null,
      },
      ...tree,
      selected: paper.topics.map((t) => t.topicId),
    };
  }

  async setPaperCoverage(schoolId: string, actorId: string, paperId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = paperCoverageSchema.parse(body);
    const paper = await this.prisma.examPaper.findFirst({
      where: { id: paperId, schoolId },
      select: { id: true, status: true, examId: true, subjectId: true, class: { select: { name: true } }, exam: { select: { name: true, status: true, yearId: true } } },
    });
    if (!paper) throw new NotFoundException("Paper not found");
    await assertYearWritable(this.prisma, schoolId, paper.exam.yearId);
    if (coverageFrozen(paper.status, paper.exam.status)) throw new BadRequestException("Marks are in review or approved, or results are published — coverage can't change any more.");
    const topicIds = await validateCoverage(this.prisma, schoolId, { yearId: paper.exam.yearId, gradeName: paper.class.name, subjectId: paper.subjectId }, data.topicIds);

    const targets = data.allSections
      ? await this.prisma.examPaper.findMany({
          where: { examId: paper.examId, subjectId: paper.subjectId, class: { name: paper.class.name, yearId: paper.exam.yearId } },
          select: { id: true, status: true },
        })
      : [{ id: paper.id, status: paper.status }];
    const open = targets.filter((t) => !coverageFrozen(t.status, paper.exam.status));
    await this.prisma.$transaction(async (tx) => {
      for (const t of open) await replaceCoverage(tx, t.id, topicIds);
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "exam_coverage_set",
      entity: "exam_paper",
      entityId: paperId,
      summary: `${paper.exam.name}: ${topicIds.length} topics${open.length > 1 ? ` on ${open.length} sections` : ""}`,
    });
    return { updated: open.length, skipped: targets.length - open.length, topics: topicIds.length };
  }
}

export type CoverageUnit = {
  id: string;
  title: string;
  termId: string | null;
  termName: string;
  plannedTo: string | null;
  topics: { id: string; title: string; progress: string; usedByExams: number }[];
};

export type { SyllabusScope };
