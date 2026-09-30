import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { academicYearSchema, activateYearSchema, type AcademicYearSummary, type YearCloseCheck } from "@wellrun/shared";
import { audit } from "../common/audit";
import { dateOnly } from "../common/date";
import { assertYearOpen } from "../common/year-lock";
import { PrismaService } from "../prisma/prisma.service";

const OPEN_INVOICE = ["ISSUED", "PARTIALLY_PAID", "OVERDUE"] as const;
const CLOSED_ADMISSION = ["ADMISSION_CONFIRMED", "REJECTED", "WITHDRAWN"] as const;

@Injectable()
export class AcademicYearsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(schoolId: string): Promise<AcademicYearSummary[]> {
    const [years, students] = await Promise.all([
      this.prisma.academicYear.findMany({
        where: { schoolId },
        orderBy: { startsOn: "desc" },
        include: { _count: { select: { classes: true, exams: true, invoices: true } } },
      }),
      this.prisma.$queryRaw<{ yearId: string; students: bigint }[]>`
        SELECT c."yearId", COUNT(DISTINCT e."studentId") AS students
        FROM "Enrollment" e JOIN "Class" c ON c."id" = e."classId"
        WHERE e."schoolId" = ${schoolId}
        GROUP BY c."yearId"`,
    ]);
    const studentsByYear = new Map(students.map((row) => [row.yearId, Number(row.students)]));
    return years.map((y) => ({
      id: y.id,
      name: y.name,
      startsOn: y.startsOn.toISOString(),
      endsOn: y.endsOn.toISOString(),
      status: y.status,
      current: y.current,
      closedAt: y.closedAt?.toISOString() ?? null,
      counts: { classes: y._count.classes, students: studentsByYear.get(y.id) ?? 0, exams: y._count.exams, invoices: y._count.invoices },
    }));
  }

  /** New years start as PLANNING. The first year a school creates becomes ACTIVE straight away. */
  async create(schoolId: string, actorId: string, body: unknown) {
    const input = academicYearSchema.parse(body);
    await this.assertNameFree(schoolId, input.name);
    await this.assertNoOverlap(schoolId, input.startsOn, input.endsOn);
    const hasActive = await this.prisma.academicYear.count({ where: { schoolId, current: true } });
    const year = await this.prisma.academicYear.create({
      data: {
        schoolId,
        name: input.name,
        startsOn: dateOnly(input.startsOn),
        endsOn: dateOnly(input.endsOn),
        status: hasActive ? "PLANNING" : "ACTIVE",
        current: !hasActive,
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "year_created", entity: "academic_year", entityId: year.id, summary: year.name });
    return year;
  }

  async update(schoolId: string, actorId: string, id: string, body: unknown) {
    const existing = await this.yearOrThrow(schoolId, id);
    assertYearOpen(existing);
    const input = academicYearSchema.parse(body);
    if (input.name !== existing.name) await this.assertNameFree(schoolId, input.name);
    await this.assertNoOverlap(schoolId, input.startsOn, input.endsOn, id);
    const year = await this.prisma.academicYear.update({
      where: { id },
      data: { name: input.name, startsOn: dateOnly(input.startsOn), endsOn: dateOnly(input.endsOn) },
    });
    await audit(this.prisma, { schoolId, actorId, action: "year_updated", entity: "academic_year", entityId: id, summary: year.name });
    return year;
  }

  /** Only an empty upcoming year can be deleted — anything with data should be closed instead. */
  async remove(schoolId: string, actorId: string, id: string) {
    const year = await this.yearOrThrow(schoolId, id);
    if (year.status !== "PLANNING") throw new BadRequestException("Only an upcoming year can be deleted. Close it instead.");
    const [classes, invoices, exams, structures] = await Promise.all([
      this.prisma.class.count({ where: { yearId: id } }),
      this.prisma.invoice.count({ where: { academicYearId: id } }),
      this.prisma.exam.count({ where: { yearId: id } }),
      this.prisma.feeStructure.count({ where: { academicYearId: id } }),
    ]);
    if (classes || invoices || exams || structures) {
      throw new BadRequestException(`${year.name} already has classes, fees or exams, so it can't be deleted.`);
    }
    await this.prisma.academicYear.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "year_deleted", entity: "academic_year", entityId: id, summary: year.name });
    return { ok: true };
  }

  async closeCheck(schoolId: string, id: string): Promise<YearCloseCheck> {
    const year = await this.yearOrThrow(schoolId, id);
    const [unpublishedExams, draftInvoices, pendingAdmissions, enrolled, withAnnual, outstanding] = await Promise.all([
      this.prisma.exam.count({ where: { schoolId, yearId: id, status: { not: "PUBLISHED" } } }),
      this.prisma.invoice.count({ where: { schoolId, academicYearId: id, status: "DRAFT" } }),
      this.prisma.admissionApplication.count({ where: { schoolId, yearId: id, status: { notIn: [...CLOSED_ADMISSION] } } }),
      this.prisma.enrollment.findMany({ where: { schoolId, class: { yearId: id } }, select: { studentId: true }, distinct: ["studentId"] }),
      this.prisma.studentResult.findMany({ where: { schoolId, yearId: id, scope: "ANNUAL" }, select: { studentId: true }, distinct: ["studentId"] }),
      this.prisma.invoice.aggregate({
        where: { schoolId, academicYearId: id, status: { in: [...OPEN_INVOICE] } },
        _sum: { balanceAmountPkr: true },
        _count: { _all: true },
      }),
    ]);
    const nextYear = await this.prisma.academicYear.findFirst({ where: { schoolId, startsOn: { gt: year.startsOn } }, orderBy: { startsOn: "asc" }, select: { id: true, name: true } });
    const notRolledOver = nextYear
      ? await this.prisma.enrollment.count({
          where: { schoolId, active: true, class: { yearId: id }, student: { enrollments: { none: { class: { yearId: nextYear.id } } } } },
        })
      : 0;
    const noAnnual = enrolled.length && withAnnual.length < enrolled.length ? enrolled.length - withAnnual.length : 0;
    return {
      yearId: id,
      name: year.name,
      items: [
        { key: "unpublishedExams" as const, label: "Exams without published results", count: unpublishedExams },
        { key: "noAnnualResults" as const, label: "Students without an annual result", count: noAnnual },
        { key: "notRolledOver" as const, label: `Students not yet moved into ${nextYear?.name ?? "next year"}`, count: notRolledOver },
        { key: "draftInvoices" as const, label: "Draft invoices never issued", count: draftInvoices },
        { key: "pendingAdmissions" as const, label: "Admission applications still open", count: pendingAdmissions },
        {
          key: "outstanding" as const,
          label: "Unpaid invoices (stay payable after closing)",
          count: outstanding._count._all,
          amountPkr: Number(outstanding._sum.balanceAmountPkr ?? 0),
        },
      ].filter((item) => item.count > 0),
    };
  }

  /** Make a year the running one. Another ACTIVE year must be closed — here (closePrevious) or beforehand. */
  async activate(schoolId: string, actorId: string, id: string, body: unknown) {
    const { closePrevious } = activateYearSchema.parse(body ?? {});
    const year = await this.yearOrThrow(schoolId, id);
    if (year.status === "ACTIVE") return year;
    if (year.status === "CLOSED") throw new BadRequestException(`${year.name} is closed. Re-open it instead.`);
    const active = await this.prisma.academicYear.findFirst({ where: { schoolId, current: true, id: { not: id } } });
    if (active && !closePrevious) {
      throw new BadRequestException(`${active.name} is still running. Close it first, or close it as part of going live.`);
    }
    const result = await this.prisma.$transaction(async (tx) => {
      if (active) {
        await tx.academicYear.update({
          where: { id: active.id },
          data: { status: "CLOSED", current: false, closedAt: new Date(), closedById: actorId },
        });
      }
      return tx.academicYear.update({ where: { id }, data: { status: "ACTIVE", current: true, closedAt: null, closedById: null } });
    });
    if (active) await audit(this.prisma, { schoolId, actorId, action: "year_closed", entity: "academic_year", entityId: active.id, summary: active.name });
    await audit(this.prisma, { schoolId, actorId, action: "year_activated", entity: "academic_year", entityId: id, summary: year.name });
    return result;
  }

  async close(schoolId: string, actorId: string, id: string) {
    const year = await this.yearOrThrow(schoolId, id);
    if (year.status === "CLOSED") return year;
    if (year.status === "PLANNING") throw new BadRequestException("An upcoming year hasn't started — delete it instead of closing.");
    const result = await this.prisma.academicYear.update({
      where: { id },
      data: { status: "CLOSED", current: false, closedAt: new Date(), closedById: actorId },
    });
    await audit(this.prisma, { schoolId, actorId, action: "year_closed", entity: "academic_year", entityId: id, summary: year.name });
    return result;
  }

  /** Undo a close to fix mistakes. Only when no other year is running, so there is never more than one current year. */
  async reopen(schoolId: string, actorId: string, id: string) {
    const year = await this.yearOrThrow(schoolId, id);
    if (year.status !== "CLOSED") throw new BadRequestException(`${year.name} is not closed.`);
    const active = await this.prisma.academicYear.findFirst({ where: { schoolId, current: true } });
    if (active) throw new ForbiddenException(`${active.name} is the current year. Close it before re-opening ${year.name}.`);
    const result = await this.prisma.academicYear.update({
      where: { id },
      data: { status: "ACTIVE", current: true, closedAt: null, closedById: null },
    });
    await audit(this.prisma, { schoolId, actorId, action: "year_reopened", entity: "academic_year", entityId: id, summary: year.name });
    return result;
  }

  private async yearOrThrow(schoolId: string, id: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { id, schoolId } });
    if (!year) throw new NotFoundException("Academic year not found");
    return year;
  }

  private async assertNameFree(schoolId: string, name: string) {
    const clash = await this.prisma.academicYear.findFirst({ where: { schoolId, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
    if (clash) throw new BadRequestException(`A year called ${name} already exists.`);
  }

  private async assertNoOverlap(schoolId: string, startsOn: string, endsOn: string, exceptId?: string) {
    const clash = await this.prisma.academicYear.findFirst({
      where: {
        schoolId,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        startsOn: { lte: dateOnly(endsOn) },
        endsOn: { gte: dateOnly(startsOn) },
      },
      select: { name: true },
    });
    if (clash) throw new BadRequestException(`These dates overlap ${clash.name}.`);
  }
}
