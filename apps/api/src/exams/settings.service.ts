import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  DEFAULT_GRADE_BANDS,
  examSettingsSchema,
  gradingScaleSchema,
  reportCardOptionsSchema,
  reportCardTemplateSchema,
  termSchema,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";
import { normalizeBands, type Band } from "./results.engine";

const dateOnly = (value: string) => new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

@Injectable()
export class ExamSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Settings row, created with sensible defaults on first read. */
  async rules(schoolId: string) {
    const existing = await this.prisma.examSettings.findUnique({ where: { schoolId } });
    if (existing) return existing;
    return this.prisma.examSettings.upsert({ where: { schoolId }, create: { schoolId }, update: {} });
  }

  async updateRules(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = examSettingsSchema.parse(body);
    const row = await this.prisma.examSettings.upsert({ where: { schoolId }, create: { schoolId, ...data }, update: data });
    await audit(this.prisma, { schoolId, actorId, action: "exam_settings_updated", entity: "exam_settings", entityId: row.id });
    return row;
  }

  // Terms ------------------------------------------------------------------

  terms(schoolId: string, yearId: string) {
    return this.prisma.term.findMany({
      where: { schoolId, yearId },
      orderBy: [{ sortOrder: "asc" }, { startsOn: "asc" }],
      select: { id: true, name: true, startsOn: true, endsOn: true, weight: true, sortOrder: true, _count: { select: { exams: true } } },
    });
  }

  async createTerm(schoolId: string, actorId: string, yearId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = termSchema.parse(body);
    const count = await this.prisma.term.count({ where: { schoolId, yearId } });
    const term = await this.prisma.term.create({
      data: { schoolId, yearId, name: data.name, startsOn: dateOnly(data.startsOn), endsOn: dateOnly(data.endsOn), weight: data.weight, sortOrder: data.sortOrder || count },
    });
    await audit(this.prisma, { schoolId, actorId, action: "term_created", entity: "term", entityId: term.id, summary: term.name });
    return term;
  }

  async updateTerm(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = termSchema.parse(body);
    const found = await this.prisma.term.findFirst({ where: { id, schoolId } });
    if (!found) throw new NotFoundException("Term not found");
    const term = await this.prisma.term.update({
      where: { id },
      data: { name: data.name, startsOn: dateOnly(data.startsOn), endsOn: dateOnly(data.endsOn), weight: data.weight, sortOrder: data.sortOrder },
    });
    await audit(this.prisma, { schoolId, actorId, action: "term_updated", entity: "term", entityId: id });
    return term;
  }

  async deleteTerm(schoolId: string, actorId: string, id: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const found = await this.prisma.term.findFirst({ where: { id, schoolId }, include: { _count: { select: { exams: true } } } });
    if (!found) throw new NotFoundException("Term not found");
    if (found._count.exams) throw new BadRequestException("Move or delete this term's exams first");
    await this.prisma.term.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "term_deleted", entity: "term", entityId: id });
    return { ok: true };
  }

  // Grading scales ----------------------------------------------------------

  async scales(schoolId: string) {
    const rows = await this.prisma.gradingScale.findMany({
      where: { schoolId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isDefault: true, bands: true },
    });
    if (rows.length) return rows;
    const created = await this.prisma.gradingScale.create({
      data: { schoolId, name: "Standard (A+ to F)", isDefault: true, bands: DEFAULT_GRADE_BANDS as unknown as Prisma.InputJsonValue },
      select: { id: true, name: true, isDefault: true, bands: true },
    });
    return [created];
  }

  /** Bands for an exam: its own scale, else the school default. */
  async bandsFor(schoolId: string, gradingScaleId?: string | null): Promise<Band[]> {
    if (gradingScaleId) {
      const scale = await this.prisma.gradingScale.findFirst({ where: { id: gradingScaleId, schoolId }, select: { bands: true } });
      if (scale) return normalizeBands(scale.bands);
    }
    const scales = await this.scales(schoolId);
    return normalizeBands(scales[0]?.bands);
  }

  async saveScale(schoolId: string, actorId: string, id: string | null, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = gradingScaleSchema.parse(body);
    if (id) {
      const found = await this.prisma.gradingScale.findFirst({ where: { id, schoolId } });
      if (!found) throw new NotFoundException("Grading scale not found");
    }
    const scale = await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.gradingScale.updateMany({ where: { schoolId }, data: { isDefault: false } });
      const payload = { name: data.name, isDefault: data.isDefault, bands: data.bands as unknown as Prisma.InputJsonValue };
      return id ? tx.gradingScale.update({ where: { id }, data: payload }) : tx.gradingScale.create({ data: { schoolId, ...payload } });
    });
    await audit(this.prisma, { schoolId, actorId, action: id ? "grading_scale_updated" : "grading_scale_created", entity: "grading_scale", entityId: scale.id });
    return scale;
  }

  async deleteScale(schoolId: string, actorId: string, id: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const found = await this.prisma.gradingScale.findFirst({ where: { id, schoolId } });
    if (!found) throw new NotFoundException("Grading scale not found");
    if (found.isDefault) throw new BadRequestException("Make another scale the default first");
    await this.prisma.gradingScale.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "grading_scale_deleted", entity: "grading_scale", entityId: id });
    return { ok: true };
  }

  // Report card templates -----------------------------------------------------

  async templates(schoolId: string) {
    const rows = await this.prisma.reportCardTemplate.findMany({
      where: { schoolId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, layout: true, isDefault: true, options: true },
    });
    if (rows.length) return rows;
    const created = await this.prisma.reportCardTemplate.create({
      data: { schoolId, name: "Standard report card", layout: "CLASSIC", isDefault: true, options: reportCardOptionsSchema.parse({}) },
      select: { id: true, name: true, layout: true, isDefault: true, options: true },
    });
    return [created];
  }

  async template(schoolId: string, id?: string | null) {
    const rows = await this.templates(schoolId);
    const row = (id && rows.find((t) => t.id === id)) || rows[0];
    return { ...row, options: reportCardOptionsSchema.parse(row.options ?? {}) };
  }

  async saveTemplate(schoolId: string, actorId: string, id: string | null, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = reportCardTemplateSchema.parse(body);
    if (id) {
      const found = await this.prisma.reportCardTemplate.findFirst({ where: { id, schoolId } });
      if (!found) throw new NotFoundException("Template not found");
    }
    const row = await this.prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.reportCardTemplate.updateMany({ where: { schoolId }, data: { isDefault: false } });
      const payload = { name: data.name, layout: data.layout, isDefault: data.isDefault, options: data.options };
      return id ? tx.reportCardTemplate.update({ where: { id }, data: payload }) : tx.reportCardTemplate.create({ data: { schoolId, ...payload } });
    });
    await audit(this.prisma, { schoolId, actorId, action: id ? "report_template_updated" : "report_template_created", entity: "report_template", entityId: row.id });
    return row;
  }

  async deleteTemplate(schoolId: string, actorId: string, id: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const found = await this.prisma.reportCardTemplate.findFirst({ where: { id, schoolId } });
    if (!found) throw new NotFoundException("Template not found");
    if (found.isDefault) throw new BadRequestException("Make another template the default first");
    await this.prisma.reportCardTemplate.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "report_template_deleted", entity: "report_template", entityId: id });
    return { ok: true };
  }
}
