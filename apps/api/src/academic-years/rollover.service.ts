import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  copySetupSchema,
  isFinalClass,
  nextClassName,
  promotionSchema,
  type CopySetupResult,
  type PromotionAction,
  type PromotionPreview,
  type PromotionResult,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertYearOpen } from "../common/year-lock";
import { ensureStudentFeeAssignment } from "../fees/assignment.service";
import { PrismaService } from "../prisma/prisma.service";

const WORKING_STAFF = ["ACTIVE", "ON_LEAVE"] as const;
const DAY_MS = 86_400_000;

type ClassRow = { id: string; name: string; section: string; campusId: string | null };

const classLabel = (c: { name: string; section: string }) => (c.section ? `${c.name} ${c.section}` : c.name);
const sameSpot = (a: ClassRow, b: { name: string; section: string; campusId: string | null }) =>
  a.campusId === b.campusId && a.name.toLowerCase() === b.name.toLowerCase() && a.section === b.section;

/** Class with this name in the new year: same campus & section first, then any section on that campus. */
function findTarget(targets: ClassRow[], name: string | null, like: ClassRow) {
  if (!name) return null;
  const lower = name.toLowerCase();
  const onCampus = targets.filter((t) => t.campusId === like.campusId && t.name.toLowerCase() === lower);
  return onCampus.find((t) => t.section === like.section) ?? onCampus[0] ?? null;
}

/** Rounded to the nearest 10 PKR so raised fees stay tidy. */
export function raiseAmount(amountPkr: number, pct: number) {
  if (!pct) return amountPkr;
  return Math.round((amountPkr * (1 + pct / 100)) / 10) * 10;
}

/** What to suggest for one student, from their annual result and where their class leads. */
export function suggestAction(input: { passed: boolean | null; isFinal: boolean; hasRepeatTarget: boolean }): PromotionAction {
  if (input.passed === false && input.hasRepeatTarget) return "REPEAT";
  return input.isFinal ? "GRADUATE" : "PROMOTE";
}

@Injectable()
export class RolloverService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Copies last year's structure into the new one. Safe to run twice: anything already there is skipped. */
  async copySetup(schoolId: string, actorId: string, toYearId: string, body: unknown): Promise<CopySetupResult> {
    const input = copySetupSchema.parse(body);
    const { from, to } = await this.years(schoolId, input.fromYearId, toYearId);
    const shiftMs = to.startsOn.getTime() - from.startsOn.getTime();
    const result: CopySetupResult = { classes: 0, subjects: 0, teachers: 0, lessons: 0, feeStructures: 0, terms: 0 };

    const classMap = new Map<string, string>();
    if (input.classes || input.teachers || input.timetable) {
      const [source, existing, workingStaff] = await Promise.all([
        this.prisma.class.findMany({
          where: { schoolId, yearId: from.id },
          include: { subjects: true, assignments: true, lessons: true },
        }),
        this.prisma.class.findMany({ where: { schoolId, yearId: to.id }, select: { id: true, name: true, section: true, campusId: true } }),
        this.prisma.staff.findMany({ where: { schoolId, status: { in: [...WORKING_STAFF] } }, select: { id: true } }),
      ]);
      const working = new Set(workingStaff.map((s) => s.id));
      for (const cls of source) {
        let target = existing.find((row) => sameSpot(row, cls));
        if (!target && input.classes) {
          target = await this.prisma.class.create({
            data: { schoolId, yearId: to.id, campusId: cls.campusId, name: cls.name, section: cls.section },
            select: { id: true, name: true, section: true, campusId: true },
          });
          existing.push(target);
          result.classes += 1;
        }
        if (!target) continue;
        classMap.set(cls.id, target.id);
        if (input.classes && cls.subjects.length) {
          const { count } = await this.prisma.classSubject.createMany({
            data: cls.subjects.map((s) => ({ schoolId, classId: target.id, subjectId: s.subjectId })),
            skipDuplicates: true,
          });
          result.subjects += count;
        }
        if (input.teachers) {
          const rows = cls.assignments.filter((a) => working.has(a.staffId));
          if (rows.length) {
            const { count } = await this.prisma.teacherAssignment.createMany({
              data: rows.map((a) => ({ schoolId, staffId: a.staffId, classId: target.id, subject: a.subject })),
              skipDuplicates: true,
            });
            result.teachers += count;
          }
        }
        if (input.timetable && cls.lessons.length) {
          const { count } = await this.prisma.timetableLesson.createMany({
            data: cls.lessons.map((l) => ({
              schoolId,
              classId: target.id,
              periodId: l.periodId,
              weekday: l.weekday,
              subject: l.subject,
              staffId: l.staffId && working.has(l.staffId) ? l.staffId : null,
              override: l.override,
            })),
            skipDuplicates: true,
          });
          result.lessons += count;
        }
      }
    }

    if (input.fees) {
      const [source, existing] = await Promise.all([
        this.prisma.feeStructure.findMany({ where: { schoolId, academicYearId: from.id, status: { not: "ARCHIVED" } }, include: { items: true } }),
        this.prisma.feeStructure.findMany({ where: { schoolId, academicYearId: to.id }, select: { name: true, className: true, section: true, campusId: true } }),
      ]);
      for (const fs of source) {
        const clash = existing.some((e) => e.name === fs.name && e.className === fs.className && e.section === fs.section && e.campusId === fs.campusId);
        if (clash) continue;
        await this.prisma.feeStructure.create({
          data: {
            schoolId,
            campusId: fs.campusId,
            academicYearId: to.id,
            name: fs.name,
            className: fs.className,
            section: fs.section,
            frequency: fs.frequency,
            effectiveFrom: to.startsOn,
            effectiveUntil: null,
            status: fs.status,
            notes: fs.notes,
            items: {
              create: fs.items.map((item) => ({
                feeHeadId: item.feeHeadId,
                amountPkr: raiseAmount(item.amountPkr, input.feeIncreasePct),
                isOptional: item.isOptional,
                taxable: item.taxable,
                sortOrder: item.sortOrder,
              })),
            },
          },
        });
        result.feeStructures += 1;
      }
    }

    if (input.terms) {
      const [source, existing] = await Promise.all([
        this.prisma.term.findMany({ where: { schoolId, yearId: from.id } }),
        this.prisma.term.findMany({ where: { schoolId, yearId: to.id }, select: { name: true } }),
      ]);
      const taken = new Set(existing.map((t) => t.name.toLowerCase()));
      const rows = source.filter((t) => !taken.has(t.name.toLowerCase()));
      if (rows.length) {
        const { count } = await this.prisma.term.createMany({
          data: rows.map((t) => ({
            schoolId,
            yearId: to.id,
            name: t.name,
            startsOn: new Date(Math.round((t.startsOn.getTime() + shiftMs) / DAY_MS) * DAY_MS),
            endsOn: new Date(Math.round((t.endsOn.getTime() + shiftMs) / DAY_MS) * DAY_MS),
            sortOrder: t.sortOrder,
            weight: t.weight,
          })),
        });
        result.terms = count;
      }
    }

    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "year_setup_copied",
      entity: "academic_year",
      entityId: to.id,
      summary: `From ${from.name}: ${result.classes} classes, ${result.feeStructures} fee structures, ${result.terms} terms`,
    });
    return result;
  }

  async promotionPreview(schoolId: string, toYearId: string, fromYearId: string | undefined): Promise<PromotionPreview> {
    if (!fromYearId) throw new BadRequestException("Pick the year students are coming from");
    const { from, to } = await this.years(schoolId, fromYearId, toYearId, false);
    const [source, targets, results, moved] = await Promise.all([
      this.prisma.class.findMany({
        where: { schoolId, yearId: from.id },
        select: {
          id: true,
          name: true,
          section: true,
          campusId: true,
          enrollments: {
            where: { active: true },
            select: { rollNo: true, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
          },
        },
      }),
      this.prisma.class.findMany({ where: { schoolId, yearId: to.id }, select: { id: true, name: true, section: true, campusId: true } }),
      this.prisma.studentResult.findMany({
        where: { schoolId, yearId: from.id, scope: "ANNUAL" },
        select: { studentId: true, passed: true, percentage: true, grade: true },
      }),
      this.prisma.enrollment.findMany({ where: { schoolId, class: { yearId: to.id } }, select: { studentId: true }, distinct: ["studentId"] }),
    ]);
    const resultOf = new Map(results.map((r) => [r.studentId, { passed: r.passed, percentage: r.percentage, grade: r.grade }]));
    const movedIds = new Set(moved.map((m) => m.studentId));
    const known = [...new Set([...source, ...targets].map((c) => c.name))];
    const byLadder = (a: { name: string; section: string }, b: { name: string; section: string }) => a.name.localeCompare(b.name, undefined, { numeric: true }) || a.section.localeCompare(b.section);

    return {
      fromYear: { id: from.id, name: from.name },
      toYear: { id: to.id, name: to.name },
      targets: [...targets].sort(byLadder).map((t) => ({ id: t.id, label: classLabel(t), campusId: t.campusId })),
      classes: [...source].sort(byLadder).map((cls) => {
        const isFinal = isFinalClass(cls.name, known);
        const next = findTarget(targets, isFinal ? null : nextClassName(cls.name, known), cls);
        const repeat = findTarget(targets, cls.name, cls);
        return {
          id: cls.id,
          label: classLabel(cls),
          name: cls.name,
          section: cls.section,
          campusId: cls.campusId,
          suggestedTargetId: next?.id ?? null,
          repeatTargetId: repeat?.id ?? null,
          isFinal,
          students: cls.enrollments
            .map((e) => {
              const result = resultOf.get(e.student.id) ?? null;
              return {
                id: e.student.id,
                name: `${e.student.firstName} ${e.student.lastName}`.trim(),
                admissionNo: e.student.admissionNo,
                rollNo: e.rollNo,
                result,
                suggested: suggestAction({ passed: result?.passed ?? null, isFinal, hasRepeatTarget: Boolean(repeat) }),
                alreadyMoved: movedIds.has(e.student.id),
              };
            })
            .sort((a, b) => a.name.localeCompare(b.name)),
        };
      }),
    };
  }

  /** Applies the reviewed decisions. Students who already have a class in the new year are skipped, so re-running is safe. */
  async promote(schoolId: string, actorId: string, toYearId: string, body: unknown): Promise<PromotionResult> {
    const input = promotionSchema.parse(body);
    const { from, to } = await this.years(schoolId, input.fromYearId, toYearId);
    const [targets, current, moved] = await Promise.all([
      this.prisma.class.findMany({ where: { schoolId, yearId: to.id }, select: { id: true, name: true, section: true, campusId: true } }),
      this.prisma.enrollment.findMany({
        where: { schoolId, active: true, class: { yearId: from.id }, studentId: { in: input.decisions.map((d) => d.studentId) } },
        select: { id: true, studentId: true },
      }),
      this.prisma.enrollment.findMany({ where: { schoolId, class: { yearId: to.id } }, select: { studentId: true }, distinct: ["studentId"] }),
    ]);
    const targetById = new Map(targets.map((t) => [t.id, t]));
    const enrollmentOf = new Map(current.map((e) => [e.studentId, e.id]));
    const movedIds = new Set(moved.map((m) => m.studentId));
    for (const d of input.decisions) {
      if (d.toClassId && (d.action === "PROMOTE" || d.action === "REPEAT") && !targetById.has(d.toClassId)) {
        throw new BadRequestException(`That class isn't part of ${to.name}`);
      }
    }

    // Roll numbers continue from whatever each new class already has.
    const rollCounters = new Map<string, number>();
    const nextRoll = async (classId: string) => {
      if (!rollCounters.has(classId)) {
        const rows = await this.prisma.enrollment.findMany({ where: { schoolId, classId, active: true }, select: { rollNo: true } });
        const used = rows.map((r) => Number.parseInt(r.rollNo, 10)).filter(Number.isFinite);
        rollCounters.set(classId, used.length ? Math.max(...used) : 0);
      }
      const next = rollCounters.get(classId)! + 1;
      rollCounters.set(classId, next);
      return String(next);
    };

    const out: PromotionResult = { promoted: 0, repeated: 0, left: 0, graduated: 0, skipped: 0, withoutFees: 0 };
    const now = new Date();
    for (const d of input.decisions) {
      const enrollmentId = enrollmentOf.get(d.studentId);
      if (!enrollmentId || movedIds.has(d.studentId)) {
        out.skipped += 1;
        continue;
      }
      const endStatus = { PROMOTE: "promoted", REPEAT: "repeated", LEAVE: "left", GRADUATE: "graduated" }[d.action];
      if (d.action === "LEAVE" || d.action === "GRADUATE") {
        await this.prisma.$transaction([
          this.prisma.enrollment.update({ where: { id: enrollmentId }, data: { active: false, status: endStatus, endedAt: now } }),
          this.prisma.student.update({ where: { id: d.studentId }, data: { status: d.action === "LEAVE" ? "inactive" : "graduated" } }),
        ]);
        if (d.action === "LEAVE") out.left += 1;
        else out.graduated += 1;
        continue;
      }
      const target = targetById.get(d.toClassId!)!;
      const rollNo = await nextRoll(target.id);
      const fee = await this.prisma.$transaction(async (tx) => {
        await tx.enrollment.update({ where: { id: enrollmentId }, data: { active: false, status: endStatus, endedAt: now } });
        await tx.enrollment.create({
          data: { schoolId, studentId: d.studentId, classId: target.id, active: true, rollNo, status: "active", studentType: "returning" },
        });
        await tx.student.update({ where: { id: d.studentId }, data: { rollNo, campusId: target.campusId, status: "active" } });
        return ensureStudentFeeAssignment(tx, {
          schoolId,
          studentId: d.studentId,
          className: target.name,
          section: target.section,
          campusId: target.campusId,
          academicYearId: to.id,
        });
      });
      if (!fee) out.withoutFees += 1;
      if (d.action === "PROMOTE") out.promoted += 1;
      else out.repeated += 1;
    }

    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "students_rolled_over",
      entity: "academic_year",
      entityId: to.id,
      summary: `${from.name} → ${to.name}: ${out.promoted} promoted, ${out.repeated} repeated, ${out.left} left, ${out.graduated} graduated`,
    });
    return out;
  }

  private async years(schoolId: string, fromYearId: string, toYearId: string, mustBeOpen = true) {
    if (fromYearId === toYearId) throw new BadRequestException("Pick a different year to copy from");
    const [from, to] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { id: fromYearId, schoolId } }),
      this.prisma.academicYear.findFirst({ where: { id: toYearId, schoolId } }),
    ]);
    if (!from || !to) throw new NotFoundException("Academic year not found");
    if (mustBeOpen) assertYearOpen(to);
    return { from, to };
  }
}
