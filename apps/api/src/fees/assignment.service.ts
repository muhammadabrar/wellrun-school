import type { DiscountType, Prisma } from "@prisma/client";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { studentDiscountSchema, studentFeeAssignmentSchema, discountSchema } from "@wellrun/shared";
import type { z } from "zod";
import { audit } from "../common/audit";
import { PrismaService } from "../prisma/prisma.service";
import { asStringArray, periodRange } from "./json";
import { toPkr } from "./money";

type AssignmentInput = z.infer<typeof studentFeeAssignmentSchema>;
type DiscountInput = z.infer<typeof discountSchema>;
type StudentDiscountInput = z.infer<typeof studentDiscountSchema>;

export async function ensureStudentFeeAssignment(
  prisma: PrismaService | Prisma.TransactionClient,
  input: {
    schoolId: string;
    studentId: string;
    className: string;
    section?: string;
    campusId?: string | null;
    academicYearId: string;
  },
) {
  const existing = await prisma.studentFeeAssignment.findFirst({
    where: { schoolId: input.schoolId, studentId: input.studentId, academicYearId: input.academicYearId, status: "ACTIVE" },
  });
  if (existing) return existing;
  const structure = await prisma.feeStructure.findFirst({
    where: {
      schoolId: input.schoolId,
      academicYearId: input.academicYearId,
      status: "ACTIVE",
      className: input.className,
      OR: [{ section: input.section || "" }, { section: "" }, ...(input.section ? [{ section: input.section }] : [])],
      AND: [
        { OR: [{ campusId: input.campusId ?? undefined }, { campusId: null }] },
      ],
    },
    orderBy: [{ section: "desc" }, { createdAt: "desc" }],
  });
  if (!structure) return null;
  return prisma.studentFeeAssignment.create({
    data: {
      schoolId: input.schoolId,
      studentId: input.studentId,
      academicYearId: input.academicYearId,
      feeStructureId: structure.id,
      effectiveFrom: structure.effectiveFrom,
      effectiveUntil: structure.effectiveUntil,
      status: "ACTIVE",
    },
  });
}

@Injectable()
export class FeeAssignmentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(schoolId: string, studentId?: string) {
    return this.prisma.studentFeeAssignment.findMany({
      where: { schoolId, ...(studentId ? { studentId } : {}) },
      include: {
        structure: { select: { id: true, name: true, className: true, section: true } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } },
        overrides: { select: { feeHeadId: true, amountPkr: true, enabled: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  async assign(schoolId: string, actorId: string, input: AssignmentInput) {
    const student = await this.prisma.student.findFirst({ where: { id: input.studentId, schoolId } });
    if (!student) throw new NotFoundException("Student not found");
    const structure = await this.prisma.feeStructure.findFirst({ where: { id: input.feeStructureId, schoolId } });
    if (!structure) throw new NotFoundException("Fee structure not found");
    const assignment = await this.prisma.$transaction(async (tx) => {
      await tx.studentFeeAssignment.updateMany({
        where: { schoolId, studentId: input.studentId, academicYearId: input.academicYearId, status: "ACTIVE" },
        data: { status: "ENDED", effectiveUntil: new Date() },
      });
      return tx.studentFeeAssignment.create({
        data: {
          schoolId,
          studentId: input.studentId,
          academicYearId: input.academicYearId,
          feeStructureId: input.feeStructureId,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
          effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
          notes: input.notes?.trim() ?? "",
          overrides: input.overrides?.length
            ? {
                create: input.overrides.map((row) => ({
                  feeHeadId: row.feeHeadId,
                  amountPkr: row.amountPkr == null ? null : toPkr(row.amountPkr),
                  enabled: row.enabled ?? true,
                })),
              }
            : undefined,
        },
        include: { overrides: true, structure: { select: { id: true, name: true } } },
      });
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fee_assignment_created",
      entity: "student_fee_assignment",
      entityId: assignment.id,
      summary: `${student.firstName} ${student.lastName}`,
    });
    return assignment;
  }

  async updateOverrides(schoolId: string, actorId: string, id: string, input: Partial<AssignmentInput>) {
    const existing = await this.prisma.studentFeeAssignment.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Assignment not found");
    const assignment = await this.prisma.$transaction(async (tx) => {
      if (input.overrides) {
        await tx.studentFeeOverride.deleteMany({ where: { assignmentId: id } });
        if (input.overrides.length) {
          await tx.studentFeeOverride.createMany({
            data: input.overrides.map((row) => ({
              assignmentId: id,
              feeHeadId: row.feeHeadId,
              amountPkr: row.amountPkr == null ? null : toPkr(row.amountPkr),
              enabled: row.enabled ?? true,
            })),
          });
        }
      }
      return tx.studentFeeAssignment.update({
        where: { id },
        data: {
          notes: input.notes?.trim() ?? existing.notes,
          effectiveUntil: input.effectiveUntil === undefined ? existing.effectiveUntil : input.effectiveUntil ? new Date(input.effectiveUntil) : null,
        },
        include: { overrides: true },
      });
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fee_assignment_updated",
      entity: "student_fee_assignment",
      entityId: assignment.id,
    });
    return assignment;
  }

  discounts(schoolId: string) {
    return this.prisma.discount.findMany({
      where: { schoolId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        value: true,
        feeHeadIds: true,
        classNames: true,
        active: true,
        _count: { select: { students: true } },
      },
    });
  }

  async createDiscount(schoolId: string, actorId: string, input: DiscountInput) {
    const discount = await this.prisma.discount.create({
      data: {
        schoolId,
        name: input.name.trim(),
        type: input.type as DiscountType,
        value: toPkr(input.value),
        feeHeadIds: input.feeHeadIds ?? [],
        classNames: input.classNames ?? [],
        active: input.active ?? true,
      },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "discount_created",
      entity: "discount",
      entityId: discount.id,
      summary: discount.name,
    });
    return discount;
  }

  async updateDiscount(schoolId: string, actorId: string, id: string, input: Partial<DiscountInput>) {
    const existing = await this.prisma.discount.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Discount not found");
    const discount = await this.prisma.discount.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? existing.name,
        type: input.type ?? existing.type,
        value: input.value != null ? toPkr(input.value) : existing.value,
        feeHeadIds: input.feeHeadIds ?? asStringArray(existing.feeHeadIds),
        classNames: input.classNames ?? asStringArray(existing.classNames),
        active: input.active ?? existing.active,
      },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "discount_updated",
      entity: "discount",
      entityId: discount.id,
      summary: discount.name,
    });
    return discount;
  }

  studentDiscounts(schoolId: string, studentId?: string) {
    return this.prisma.studentDiscount.findMany({
      where: { schoolId, ...(studentId ? { studentId } : {}), active: true },
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async assignDiscount(schoolId: string, actorId: string, input: StudentDiscountInput) {
    const student = await this.prisma.student.findFirst({ where: { id: input.studentId, schoolId } });
    if (!student) throw new NotFoundException("Student not found");
    if (input.discountId) {
      const catalog = await this.prisma.discount.findFirst({ where: { id: input.discountId, schoolId } });
      if (!catalog) throw new BadRequestException("Discount not found");
    }
    const row = await this.prisma.studentDiscount.create({
      data: {
        schoolId,
        studentId: input.studentId,
        discountId: input.discountId,
        name: input.name.trim(),
        type: input.type,
        value: toPkr(input.value),
        feeHeadIds: input.feeHeadIds ?? [],
        notes: input.notes?.trim() ?? "",
        active: input.active ?? true,
      },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "student_discount_assigned",
      entity: "student_discount",
      entityId: row.id,
      summary: `${student.firstName} ${student.lastName}: ${row.name}`,
    });
    return row;
  }

  assignmentCoversPeriod(
    assignment: { effectiveFrom: Date; effectiveUntil: Date | null; status: string },
    billingPeriod: string,
  ) {
    if (assignment.status !== "ACTIVE") return false;
    const { start, end } = periodRange(billingPeriod);
    if (assignment.effectiveFrom > end) return false;
    if (assignment.effectiveUntil && assignment.effectiveUntil < start) return false;
    return true;
  }
}
