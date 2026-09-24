import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { GenerateFeesInput } from "@wellrun/shared";
import { audit } from "../common/audit";
import type { SchoolScope } from "../common/school-scope";
import { PrismaService } from "../prisma/prisma.service";
import { buildInvoiceLines, type DiscountLine, type OverrideLine, type StructureLine } from "./billing";
import { writeInvoiceSnapshot } from "./invoice-writer";
import { asStringArray, dueDateFromPeriod } from "./json";
import { addPkr } from "./money";

@Injectable()
export class FeeGenerationService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  preview(schoolId: string, input: GenerateFeesInput, scope: SchoolScope = {}) {
    return this.run(schoolId, input, scope, false);
  }

  async generate(schoolId: string, actorId: string, input: GenerateFeesInput, scope: SchoolScope = {}) {
    const result = await this.run(schoolId, input, scope, true);
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fees_generated",
      entity: "invoice",
      entityId: schoolId,
      summary: `${result.created} invoices for ${input.billingPeriod}`,
    });
    return result;
  }

  private async run(schoolId: string, input: GenerateFeesInput, scope: SchoolScope, commit: boolean) {
    const yearId = input.academicYearId || scope.yearId;
    const campusId = input.campusId || scope.campusId;
    if (!yearId) throw new BadRequestException("Choose an academic year");
    const settings = await this.prisma.schoolFeeSettings.upsert({
      where: { schoolId },
      create: { schoolId },
      update: {},
    });
    const dueOn = dueDateFromPeriod(input.billingPeriod, settings.defaultDueDay);
    const assignments = await this.prisma.studentFeeAssignment.findMany({
      where: {
        schoolId,
        academicYearId: yearId,
        status: "ACTIVE",
        ...(input.feeStructureId ? { feeStructureId: input.feeStructureId } : {}),
        student: {
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
        },
        structure: { status: "ACTIVE" },
      },
      include: {
        overrides: true,
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, campusId: true } },
        structure: { include: { items: { include: { feeHead: true }, orderBy: { sortOrder: "asc" } } } },
      },
    });
    const discounts = await this.prisma.studentDiscount.findMany({
      where: { schoolId, active: true, studentId: { in: assignments.map((row) => row.studentId) } },
    });
    const discountByStudent = new Map<string, DiscountLine[]>();
    for (const row of discounts) {
      const list = discountByStudent.get(row.studentId) ?? [];
      list.push({ type: row.type, value: row.value, feeHeadIds: asStringArray(row.feeHeadIds) });
      discountByStudent.set(row.studentId, list);
    }
    const existing = await this.prisma.invoice.findMany({
      where: {
        schoolId,
        billingPeriod: input.billingPeriod,
        status: { notIn: ["CANCELLED", "DRAFT"] },
        studentId: { in: assignments.map((row) => row.studentId) },
      },
      select: { studentId: true, feeStructureId: true },
    });
    const existingKey = new Set(existing.map((row) => `${row.studentId}:${row.feeStructureId ?? ""}`));
    const eligible = [];
    for (const assignment of assignments) {
      const key = `${assignment.studentId}:${assignment.feeStructureId}`;
      if (existingKey.has(key)) {
        eligible.push({ assignment, skipped: true, totalPkr: 0, lines: [] as ReturnType<typeof buildInvoiceLines> });
        continue;
      }
      const structureLines: StructureLine[] = assignment.structure.items.map((item) => ({
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
      eligible.push({ assignment, skipped: false, totalPkr, lines });
    }
    const toCreate = eligible.filter((row) => !row.skipped && row.totalPkr > 0);
    if (!commit) {
      return {
        billingPeriod: input.billingPeriod,
        eligible: eligible.length,
        create: toCreate.length,
        skipped: eligible.filter((row) => row.skipped).length,
        totalPkr: addPkr(...toCreate.map((row) => row.totalPkr)),
        students: toCreate.slice(0, 50).map((row) => ({
          id: row.assignment.student.id,
          name: `${row.assignment.student.firstName} ${row.assignment.student.lastName}`,
          admissionNo: row.assignment.student.admissionNo,
          amountPkr: row.totalPkr,
        })),
      };
    }
    const created = await this.prisma.$transaction(async (tx) => {
      const invoices = [];
      for (const row of toCreate) {
        const invoice = await writeInvoiceSnapshot(tx, {
          schoolId,
          campusId: row.assignment.student.campusId,
          studentId: row.assignment.studentId,
          academicYearId: yearId,
          feeStructureId: row.assignment.feeStructureId,
          billingPeriod: input.billingPeriod,
          dueOn,
          lines: row.lines,
        });
        invoices.push(invoice);
      }
      return invoices;
    });
    return {
      billingPeriod: input.billingPeriod,
      created: created.length,
      skipped: eligible.filter((row) => row.skipped).length,
      totalPkr: addPkr(...created.map((row) => row.totalAmountPkr)),
      invoiceIds: created.map((row) => row.id),
    };
  }
}
