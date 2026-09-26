import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { FeeFrequency, FeeStructureStatus } from "@prisma/client";
import type { FeeHeadInput, FeeStructureInput } from "@wellrun/shared";
import { audit } from "../common/audit";
import type { SchoolScope } from "../common/school-scope";
import { PrismaService } from "../prisma/prisma.service";
import { feeHeadCode } from "./billing";
import { addPkr, toPkr } from "./money";

@Injectable()
export class FeeCatalogService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  heads(schoolId: string, scope: SchoolScope = {}) {
    return this.prisma.feeHead.findMany({
      where: {
        schoolId,
        ...(scope.campusId ? { OR: [{ campusId: scope.campusId }, { campusId: null }] } : {}),
      },
      select: {
        id: true,
        name: true,
        code: true,
        category: true,
        frequency: true,
        recurring: true,
        taxable: true,
        description: true,
        active: true,
        amountPkr: true,
        sortOrder: true,
        campusId: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async createHead(schoolId: string, actorId: string, input: FeeHeadInput) {
    const duplicate = await this.prisma.feeHead.findFirst({
      where: { schoolId, active: true, name: { equals: input.name.trim(), mode: "insensitive" } },
    });
    if (duplicate) throw new BadRequestException(`A fee head called "${duplicate.name}" already exists`);
    const count = await this.prisma.feeHead.count({ where: { schoolId } });
    const head = await this.prisma.feeHead.create({
      data: {
        schoolId,
        campusId: input.campusId ?? undefined,
        name: input.name.trim(),
        code: (input.code?.trim() || feeHeadCode(input.name)) || `HEAD_${count + 1}`,
        category: input.category?.trim() || "tuition",
        frequency: input.frequency ?? "MONTHLY",
        recurring: input.recurring ?? true,
        taxable: input.taxable ?? false,
        description: input.description?.trim() ?? "",
        active: input.active ?? true,
        amountPkr: toPkr(input.amountPkr ?? 0),
        sortOrder: count,
      },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fee_head_created",
      entity: "fee_head",
      entityId: head.id,
      summary: head.name,
    });
    return head;
  }

  async updateHead(schoolId: string, actorId: string, id: string, input: Partial<FeeHeadInput>) {
    const existing = await this.prisma.feeHead.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Fee head not found");
    const head = await this.prisma.feeHead.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? existing.name,
        code: input.code?.trim() || existing.code,
        category: input.category?.trim() ?? existing.category,
        frequency: input.frequency ?? existing.frequency,
        recurring: input.recurring ?? existing.recurring,
        taxable: input.taxable ?? existing.taxable,
        description: input.description?.trim() ?? existing.description,
        active: input.active ?? existing.active,
        amountPkr: input.amountPkr != null ? toPkr(input.amountPkr) : existing.amountPkr,
        campusId: input.campusId === undefined ? existing.campusId : input.campusId,
      },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fee_head_updated",
      entity: "fee_head",
      entityId: head.id,
      summary: head.name,
    });
    return head;
  }

  async archiveHead(schoolId: string, actorId: string, id: string) {
    const existing = await this.prisma.feeHead.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Fee head not found");
    const head = await this.prisma.feeHead.update({ where: { id }, data: { active: false } });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fee_head_archived",
      entity: "fee_head",
      entityId: head.id,
      summary: head.name,
    });
    return head;
  }

  structures(schoolId: string, scope: SchoolScope = {}) {
    return this.prisma.feeStructure.findMany({
      where: {
        schoolId,
        ...(scope.campusId ? { OR: [{ campusId: scope.campusId }, { campusId: null }] } : {}),
        ...(scope.yearId ? { academicYearId: scope.yearId } : {}),
      },
      select: {
        id: true,
        name: true,
        className: true,
        section: true,
        frequency: true,
        status: true,
        academicYearId: true,
        campusId: true,
        effectiveFrom: true,
        effectiveUntil: true,
        notes: true,
        year: { select: { id: true, name: true } },
        items: {
          select: { id: true, feeHeadId: true, amountPkr: true, isOptional: true, taxable: true, sortOrder: true, feeHead: { select: { name: true, code: true } } },
          orderBy: { sortOrder: "asc" },
        },
      },
      orderBy: [{ className: "asc" }, { name: "asc" }],
    }).then((rows) =>
      rows.map((row) => ({
        ...row,
        subtotalPkr: addPkr(...row.items.map((item) => item.amountPkr)),
      })),
    );
  }

  async structure(schoolId: string, id: string) {
    const row = await this.prisma.feeStructure.findFirst({
      where: { id, schoolId },
      include: {
        year: { select: { id: true, name: true } },
        items: { include: { feeHead: { select: { id: true, name: true, code: true, amountPkr: true } } }, orderBy: { sortOrder: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("Fee structure not found");
    return { ...row, subtotalPkr: addPkr(...row.items.map((item) => item.amountPkr)) };
  }

  async createStructure(schoolId: string, actorId: string, input: FeeStructureInput) {
    if (!input.items?.length) throw new BadRequestException("Add at least one fee head");
    await this.assertYear(schoolId, input.academicYearId);
    const structure = await this.prisma.feeStructure.create({
      data: {
        schoolId,
        campusId: input.campusId ?? undefined,
        academicYearId: input.academicYearId,
        name: input.name.trim(),
        className: input.className?.trim() ?? "",
        section: input.section?.trim() ?? "",
        frequency: (input.frequency ?? "MONTHLY") as FeeFrequency,
        effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : new Date(),
        effectiveUntil: input.effectiveUntil ? new Date(input.effectiveUntil) : null,
        status: (input.status ?? "DRAFT") as FeeStructureStatus,
        notes: input.notes?.trim() ?? "",
        items: {
          create: input.items.map((item, index) => ({
            feeHeadId: item.feeHeadId,
            amountPkr: toPkr(item.amountPkr),
            isOptional: item.isOptional ?? false,
            taxable: item.taxable ?? false,
            sortOrder: item.sortOrder ?? index,
          })),
        },
      },
      include: { items: true },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fee_structure_created",
      entity: "fee_structure",
      entityId: structure.id,
      summary: structure.name,
    });
    return structure;
  }

  async updateStructure(schoolId: string, actorId: string, id: string, input: Partial<FeeStructureInput>) {
    const existing = await this.prisma.feeStructure.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Fee structure not found");
    if (input.academicYearId) await this.assertYear(schoolId, input.academicYearId);
    const structure = await this.prisma.$transaction(async (tx) => {
      if (input.items) {
        await tx.feeStructureItem.deleteMany({ where: { feeStructureId: id } });
        await tx.feeStructureItem.createMany({
          data: input.items.map((item, index) => ({
            feeStructureId: id,
            feeHeadId: item.feeHeadId,
            amountPkr: toPkr(item.amountPkr),
            isOptional: item.isOptional ?? false,
            taxable: item.taxable ?? false,
            sortOrder: item.sortOrder ?? index,
          })),
        });
      }
      return tx.feeStructure.update({
        where: { id },
        data: {
          name: input.name?.trim() ?? existing.name,
          campusId: input.campusId === undefined ? existing.campusId : input.campusId,
          academicYearId: input.academicYearId ?? existing.academicYearId,
          className: input.className?.trim() ?? existing.className,
          section: input.section?.trim() ?? existing.section,
          frequency: input.frequency ?? existing.frequency,
          effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : existing.effectiveFrom,
          effectiveUntil: input.effectiveUntil === undefined ? existing.effectiveUntil : input.effectiveUntil ? new Date(input.effectiveUntil) : null,
          status: input.status ?? existing.status,
          notes: input.notes?.trim() ?? existing.notes,
        },
        include: { items: true },
      });
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fee_structure_updated",
      entity: "fee_structure",
      entityId: structure.id,
      summary: structure.name,
    });
    return structure;
  }

  /**
   * Puts every active fee head, at its catalog amount, on each class's structure in one go.
   * Classes without a structure get one; existing structures only gain the heads they're missing,
   * so amounts a school already customised for a class are never overwritten.
   */
  async applyCatalogToClasses(
    schoolId: string,
    actorId: string,
    input: { academicYearId: string; campusId?: string | null; classNames: string[] },
  ) {
    await this.assertYear(schoolId, input.academicYearId);
    const campusId = input.campusId || null;
    const heads = await this.prisma.feeHead.findMany({
      where: {
        schoolId,
        active: true,
        // One-time heads (e.g. admission fee) are charged at admission, never on a monthly structure.
        frequency: { not: "ONE_TIME" },
        ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    if (!heads.length) throw new BadRequestException("Add recurring fee heads (e.g. tuition) to the catalog first");
    const classNames = [...new Set(input.classNames.map((name) => name.trim()).filter(Boolean))];
    // One read for every class up front, then one small write per class. Each class's write is
    // atomic on its own, and re-running only adds what's still missing — so no long transaction
    // is needed (a single transaction across all classes timed out against a remote database).
    const structures = await this.prisma.feeStructure.findMany({
      where: {
        schoolId,
        academicYearId: input.academicYearId,
        className: { in: classNames },
        ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}),
      },
      include: { items: { select: { feeHeadId: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    });
    const byClass = new Map<string, (typeof structures)[number]>();
    for (const row of structures) if (!byClass.has(row.className)) byClass.set(row.className, row);
    let created = 0;
    let updated = 0;
    for (const className of classNames) {
      const existing = byClass.get(className);
      if (!existing) {
        await this.prisma.feeStructure.create({
          data: {
            schoolId,
            campusId,
            academicYearId: input.academicYearId,
            name: className,
            className,
            section: "",
            frequency: "MONTHLY",
            status: "ACTIVE",
            effectiveFrom: new Date(),
            items: { create: heads.map((head, index) => ({ feeHeadId: head.id, amountPkr: head.amountPkr, sortOrder: index })) },
          },
        });
        created += 1;
        continue;
      }
      const have = new Set(existing.items.map((item) => item.feeHeadId));
      const missing = heads.filter((head) => !have.has(head.id));
      if (!missing.length) continue;
      await this.prisma.$transaction([
        this.prisma.feeStructureItem.createMany({
          data: missing.map((head, index) => ({
            feeStructureId: existing.id,
            feeHeadId: head.id,
            amountPkr: head.amountPkr,
            sortOrder: existing.items.length + index,
          })),
        }),
        this.prisma.feeStructure.update({ where: { id: existing.id }, data: { status: "ACTIVE" } }),
      ]);
      updated += 1;
    }
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fee_catalog_applied",
      entity: "fee_structure",
      entityId: input.academicYearId,
      summary: `${created} created, ${updated} updated`,
    });
    return { created, updated };
  }

  private async assertYear(schoolId: string, academicYearId: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { id: academicYearId, schoolId } });
    if (!year) throw new BadRequestException("Academic year not found");
  }
}
