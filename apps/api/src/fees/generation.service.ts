import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { GenerateFeesInput } from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertYearOpen } from "../common/year-lock";
import type { SchoolScope } from "../common/school-scope";
import { PrismaService } from "../prisma/prisma.service";
import { buildInvoiceLines, frequencyScopeKey, type DiscountLine, type OverrideLine, type StructureLine } from "./billing";
import { applyAvailableCredit } from "./credit.service";
import { writeInvoiceSnapshot } from "./invoice-writer";
import { invoiceViewInclude, toInvoiceView } from "./invoice-view";
import { asStringArray, currentBillingPeriod, dueDateFromPeriod, periodsThrough } from "./json";
import { addPkr } from "./money";

const assignmentInclude = {
  overrides: true,
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      campusId: true,
      enrollments: { where: { active: true }, select: { class: { select: { name: true, section: true } } }, take: 1 },
    },
  },
  structure: { include: { items: { include: { feeHead: true }, orderBy: { sortOrder: "asc" } } } },
} satisfies Prisma.StudentFeeAssignmentInclude;

type AssignmentWithRelations = Prisma.StudentFeeAssignmentGetPayload<{ include: typeof assignmentInclude }>;

type SkipReason = "already_billed" | "zero_total";

type EligibleRow = {
  assignment: AssignmentWithRelations;
  skipReason: SkipReason | null;
  totalPkr: number;
  lines: ReturnType<typeof buildInvoiceLines>;
};

@Injectable()
export class FeeGenerationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async preview(schoolId: string, input: GenerateFeesInput, scope: SchoolScope = {}) {
    const { eligible, toCreate, missingAssignment, dueOn } = await this.computeEligible(schoolId, input, scope);
    return {
      billingPeriod: input.billingPeriod,
      dueOn,
      eligible: eligible.length,
      create: toCreate.length,
      skippedAlreadyBilled: eligible.filter((row) => row.skipReason === "already_billed").length,
      skippedZeroTotal: eligible.filter((row) => row.skipReason === "zero_total").length,
      missingAssignment,
      totalPkr: addPkr(...toCreate.map((row) => row.totalPkr)),
    };
  }

  async generate(
    schoolId: string,
    actorId: string | null,
    input: GenerateFeesInput,
    scope: SchoolScope = {},
    options: { auto?: boolean } = {},
  ) {
    if (!input.confirm) throw new BadRequestException("Preview and confirm before generating invoices");
    const { yearId, dueOn, eligible, toCreate, missingAssignment } = await this.computeEligible(schoolId, input, scope);
    const createdIds: string[] = [];
    let conflicted = 0;
    for (const row of toCreate) {
      try {
        const invoice = await this.prisma.$transaction(async (tx) => {
          const written = await writeInvoiceSnapshot(tx, {
            schoolId,
            campusId: row.assignment.student.campusId,
            studentId: row.assignment.studentId,
            academicYearId: yearId,
            feeStructureId: row.assignment.feeStructureId,
            billingPeriod: input.billingPeriod,
            dueOn,
            lines: row.lines,
          });
          await applyAvailableCredit(tx, { schoolId, studentId: row.assignment.studentId, invoiceId: written.id, actorId });
          return written;
        });
        createdIds.push(invoice.id);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          conflicted += 1;
          continue;
        }
        throw error;
      }
    }
    const invoices = createdIds.length
      ? await this.prisma.invoice.findMany({
          where: { id: { in: createdIds } },
          include: invoiceViewInclude,
          orderBy: { invoiceNumber: "asc" },
        })
      : [];
    const views = invoices.map(toInvoiceView);
    const result = {
      billingPeriod: input.billingPeriod,
      created: views.length,
      skippedAlreadyBilled: eligible.filter((row) => row.skipReason === "already_billed").length + conflicted,
      skippedZeroTotal: eligible.filter((row) => row.skipReason === "zero_total").length,
      missingAssignment,
      totalPkr: addPkr(...views.map((row) => row.totalPkr)),
      invoices: views,
    };
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: options.auto ? "fees_auto_generated" : "fees_generated",
      entity: "invoice",
      entityId: schoolId,
      summary: `${result.created} invoices for ${input.billingPeriod}`,
    });
    return result;
  }

  /**
   * Generates one student's invoice for one billing period against their currently active fee
   * structure, outside the batch cycle — used right after admission so a family doesn't have to
   * wait for the next manual/auto batch run to see their first regular invoice.
   */
  async generateForAssignment(schoolId: string, studentId: string, academicYearId: string, billingPeriod: string) {
    const assignment = await this.prisma.studentFeeAssignment.findFirst({
      where: { schoolId, studentId, academicYearId, status: "ACTIVE" },
      include: assignmentInclude,
    });
    if (!assignment) return { created: false, reason: "no_assignment" as const };
    const existing = await this.prisma.invoice.findFirst({
      where: { schoolId, studentId, billingPeriod, status: { notIn: ["CANCELLED", "DRAFT"] } },
    });
    if (existing) return { created: false, reason: "already_billed" as const };
    const [settings, year, discounts] = await Promise.all([
      this.prisma.schoolFeeSettings.upsert({ where: { schoolId }, create: { schoolId }, update: {} }),
      this.prisma.academicYear.findFirstOrThrow({ where: { id: academicYearId, schoolId } }),
      this.prisma.studentDiscount.findMany({ where: { schoolId, studentId, active: true } }),
    ]);
    assertYearOpen(year);
    const discountByStudent = new Map<string, DiscountLine[]>([
      [studentId, discounts.map((row) => ({ type: row.type, value: row.value, feeHeadIds: asStringArray(row.feeHeadIds) }))],
    ]);
    const billedScopeKeys = await this.billedScopeKeys(schoolId, academicYearId, [assignment]);
    const { totalPkr, lines } = this.buildEligibleRow(assignment, billingPeriod, year.startsOn, discountByStudent, billedScopeKeys);
    if (totalPkr <= 0) return { created: false, reason: "zero_total" as const };
    const dueOn = dueDateFromPeriod(billingPeriod, settings.defaultDueDay);
    try {
      const invoice = await this.prisma.$transaction(async (tx) => {
        const written = await writeInvoiceSnapshot(tx, {
          schoolId,
          campusId: assignment.student.campusId,
          studentId,
          academicYearId,
          feeStructureId: assignment.feeStructureId,
          billingPeriod,
          dueOn,
          lines,
        });
        await applyAvailableCredit(tx, { schoolId, studentId, invoiceId: written.id, actorId: null });
        return written;
      });
      return { created: true as const, invoiceId: invoice.id, totalPkr: invoice.totalAmountPkr };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return { created: false, reason: "already_billed" as const };
      }
      throw error;
    }
  }

  /**
   * Generates every remaining billing-period invoice for one student through the end of the
   * academic year, so a family paying the whole year upfront has real invoices to pay against in
   * one lump-sum payment rather than needing credit/advance-payment bookkeeping. Safe to call
   * repeatedly — periods already billed are reported as skipped, never duplicated.
   */
  async generateYearForStudent(schoolId: string, studentId: string, academicYearId: string, from: "year_start" | "this_month") {
    const year = await this.prisma.academicYear.findFirstOrThrow({ where: { id: academicYearId, schoolId } });
    // "year_start" also bills months before the student joined, when the school charges the full year.
    const periods = periodsThrough(from === "year_start" ? currentBillingPeriod(year.startsOn) : currentBillingPeriod(), year.endsOn);
    const results = [];
    for (const billingPeriod of periods) {
      const result = await this.generateForAssignment(schoolId, studentId, academicYearId, billingPeriod);
      results.push({ billingPeriod, ...result });
    }
    return {
      periods: results,
      createdInvoiceIds: results.filter((row) => row.created).map((row) => row.invoiceId!),
      totalPkr: addPkr(...results.filter((row) => row.created).map((row) => row.totalPkr!)),
    };
  }

  private async computeEligible(schoolId: string, input: GenerateFeesInput, scope: SchoolScope) {
    const yearId = input.academicYearId || scope.yearId;
    const campusId = input.campusId || scope.campusId;
    if (!yearId) throw new BadRequestException("Choose an academic year");
    const [settings, year] = await Promise.all([
      this.prisma.schoolFeeSettings.upsert({ where: { schoolId }, create: { schoolId }, update: {} }),
      this.prisma.academicYear.findFirstOrThrow({ where: { id: yearId, schoolId } }),
    ]);
    assertYearOpen(year);
    const dueOn = dueDateFromPeriod(input.billingPeriod, settings.defaultDueDay);
    const studentWhere = {
      schoolId,
      status: "active",
      ...(campusId ? { campusId } : {}),
      enrollments: {
        some: {
          active: true,
          class: {
            yearId,
            ...(campusId ? { campusId } : {}),
            ...(input.className ? { name: input.className } : {}),
            ...(input.section ? { section: input.section } : {}),
          },
        },
      },
    } satisfies Prisma.StudentWhereInput;
    const [assignments, missingAssignment] = await Promise.all([
      this.prisma.studentFeeAssignment.findMany({
        where: {
          schoolId,
          academicYearId: yearId,
          status: "ACTIVE",
          ...(input.feeStructureId ? { feeStructureId: input.feeStructureId } : {}),
          student: studentWhere,
          structure: { status: "ACTIVE" },
        },
        include: assignmentInclude,
      }),
      this.prisma.student.count({
        where: { ...studentWhere, feeAssignments: { none: { academicYearId: yearId, status: "ACTIVE" } } },
      }),
    ]);
    const discounts = await this.prisma.studentDiscount.findMany({
      where: { schoolId, active: true, studentId: { in: assignments.map((row) => row.studentId) } },
    });
    const discountByStudent = new Map<string, DiscountLine[]>();
    for (const row of discounts) {
      const list = discountByStudent.get(row.studentId) ?? [];
      list.push({ type: row.type, value: row.value, feeHeadIds: asStringArray(row.feeHeadIds) });
      discountByStudent.set(row.studentId, list);
    }
    // "One recurring invoice per student per period" — deliberately not scoped by feeStructureId,
    // so a student whose structure changed mid-period (e.g. after promotion) is still caught as already billed.
    const existing = await this.prisma.invoice.findMany({
      where: {
        schoolId,
        billingPeriod: input.billingPeriod,
        status: { notIn: ["CANCELLED", "DRAFT"] },
        studentId: { in: assignments.map((row) => row.studentId) },
      },
      select: { studentId: true },
    });
    const alreadyBilledStudents = new Set(existing.map((row) => row.studentId));
    const billedScopeKeys = await this.billedScopeKeys(schoolId, yearId, assignments);
    const eligible: EligibleRow[] = [];
    for (const assignment of assignments) {
      if (alreadyBilledStudents.has(assignment.studentId)) {
        eligible.push({ assignment, skipReason: "already_billed", totalPkr: 0, lines: [] });
        continue;
      }
      const { totalPkr, lines } = this.buildEligibleRow(assignment, input.billingPeriod, year.startsOn, discountByStudent, billedScopeKeys);
      eligible.push({ assignment, skipReason: totalPkr > 0 ? null : "zero_total", totalPkr, lines });
    }
    const toCreate = eligible.filter((row) => !row.skipReason);
    return { yearId, dueOn, eligible, toCreate, missingAssignment };
  }

  /** Prior InvoiceItems (this school year, not cancelled/draft) for non-monthly heads, keyed for the frequency-gating check below. */
  private async billedScopeKeys(schoolId: string, yearId: string, assignments: AssignmentWithRelations[]) {
    const freqByHead = new Map<string, "MONTHLY" | "QUARTERLY" | "ANNUAL" | "ONE_TIME">();
    for (const assignment of assignments) {
      for (const item of assignment.structure.items) freqByHead.set(item.feeHeadId, item.feeHead.frequency);
    }
    const nonMonthlyHeadIds = [...freqByHead.entries()].filter(([, freq]) => freq !== "MONTHLY").map(([id]) => id);
    if (!nonMonthlyHeadIds.length) return new Set<string>();
    const priorItems = await this.prisma.invoiceItem.findMany({
      where: {
        feeHeadId: { in: nonMonthlyHeadIds },
        invoice: {
          schoolId,
          academicYearId: yearId,
          studentId: { in: assignments.map((row) => row.studentId) },
          status: { notIn: ["CANCELLED", "DRAFT"] },
        },
      },
      select: { feeHeadId: true, invoice: { select: { studentId: true, billingPeriod: true } } },
    });
    const keys = new Set<string>();
    const year = await this.prisma.academicYear.findFirstOrThrow({ where: { id: yearId } });
    for (const item of priorItems) {
      if (!item.feeHeadId) continue;
      const frequency = freqByHead.get(item.feeHeadId);
      if (!frequency) continue;
      const key = frequencyScopeKey({
        feeHeadId: item.feeHeadId,
        frequency,
        billingPeriod: item.invoice.billingPeriod,
        yearStartsOn: year.startsOn,
        academicYearId: yearId,
      });
      if (key) keys.add(`${item.invoice.studentId}:${key}`);
    }
    return keys;
  }

  /** Builds the billable lines for one assignment, excluding non-monthly heads already billed this scope period. */
  private buildEligibleRow(
    assignment: AssignmentWithRelations,
    billingPeriod: string,
    yearStartsOn: Date,
    discountByStudent: Map<string, DiscountLine[]>,
    billedScopeKeys: Set<string>,
  ) {
    const structureLines: StructureLine[] = assignment.structure.items
      .filter((item) => {
        if (item.feeHead.frequency === "MONTHLY") return true;
        const key = frequencyScopeKey({
          feeHeadId: item.feeHeadId,
          frequency: item.feeHead.frequency,
          billingPeriod,
          yearStartsOn,
          academicYearId: assignment.academicYearId,
        });
        return key ? !billedScopeKeys.has(`${assignment.studentId}:${key}`) : true;
      })
      .map((item) => ({
        feeHeadId: item.feeHeadId,
        name: item.feeHead.name,
        amountPkr: item.amountPkr,
        isOptional: item.isOptional,
        taxable: item.taxable,
      }));
    const overrides: OverrideLine[] = assignment.overrides.map((row) => ({
      feeHeadId: row.feeHeadId,
      amountPkr: row.amountPkr,
      enabled: row.enabled,
    }));
    const lines = buildInvoiceLines(structureLines, overrides, discountByStudent.get(assignment.studentId) ?? []);
    const totalPkr = addPkr(...lines.map((line) => line.netAmountPkr));
    return { totalPkr, lines };
  }
}
