import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type CertificateType } from "@prisma/client";
import type { Response } from "express";
import {
  CERTIFICATE_TYPES,
  DEFAULT_CERTIFICATES,
  certificateIssueSchema,
  certificateProblem,
  certificateRevokeSchema,
  certificateTemplateSchema,
  genderWords,
  isoOf,
  pageParams,
  renderTemplate,
  unknownPlaceholders,
  type CertificateList,
  type CertificatePreview,
  type CertificateTemplateView,
  type CertificateView,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import { dateOnly, karachiToday } from "../common/date";
import { hasUnprintable } from "../common/pdf-text";
import { schoolLetterhead } from "../common/school";
import { nextSchoolNumber } from "../common/sequence";
import { logoFilePath } from "../fees/pdf";
import { PrismaService } from "../prisma/prisma.service";
import { renderCertificate } from "./certificate.pdf";

export type CertificateListQuery = { type?: string; status?: string; q?: string; studentId?: string; page?: string; pageSize?: string };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const longDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
};

const studentSelect = {
  id: true,
  firstName: true,
  lastName: true,
  gender: true,
  dateOfBirth: true,
  admissionNo: true,
  guardians: { take: 1, orderBy: { guardianId: "asc" }, select: { guardian: { select: { name: true } } } },
  enrollments: { orderBy: [{ active: "desc" }, { createdAt: "desc" }], take: 1, select: { class: { select: { name: true, section: true, year: { select: { name: true } } } } } },
} satisfies Prisma.StudentSelect;

const viewSelect = {
  id: true,
  serial: true,
  type: true,
  title: true,
  studentId: true,
  issuedOn: true,
  status: true,
  revokedAt: true,
  revokeReason: true,
  issuedById: true,
  data: true,
  student: { select: { firstName: true, lastName: true, admissionNo: true } },
} satisfies Prisma.IssuedCertificateSelect;

type Row = Prisma.IssuedCertificateGetPayload<{ select: typeof viewSelect }>;

@Injectable()
export class CertificatesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Wording ---------------------------------------------------------------------------------------------------

  async templates(schoolId: string): Promise<CertificateTemplateView[]> {
    const saved = await this.prisma.certificateTemplate.findMany({ where: { schoolId } });
    const byType = new Map(saved.map((t) => [t.type, t]));
    return CERTIFICATE_TYPES.map((type) => {
      const custom = byType.get(type);
      return { type, title: custom?.title ?? DEFAULT_CERTIFICATES[type].title, body: custom?.body ?? DEFAULT_CERTIFICATES[type].body, custom: Boolean(custom), defaultTitle: DEFAULT_CERTIFICATES[type].title, defaultBody: DEFAULT_CERTIFICATES[type].body };
    });
  }

  async saveTemplate(schoolId: string, actorId: string, type: string, body: unknown) {
    const kind = this.kind(type);
    const data = certificateTemplateSchema.parse(body);
    const unknown = unknownPlaceholders(kind, data.body);
    if (unknown.length) throw new BadRequestException(`These words in braces aren't recognised for this certificate: ${unknown.map((u) => `{{${u}}}`).join(", ")}`);
    await this.prisma.certificateTemplate.upsert({ where: { schoolId_type: { schoolId, type: kind } }, create: { schoolId, type: kind, title: data.title, body: data.body, updatedById: actorId }, update: { title: data.title, body: data.body, updatedById: actorId } });
    await audit(this.prisma, { schoolId, actorId, action: "certificate_template_saved", entity: "certificate_template", entityId: kind });
    return (await this.templates(schoolId)).find((t) => t.type === kind)!;
  }

  async resetTemplate(schoolId: string, actorId: string, type: string) {
    const kind = this.kind(type);
    await this.prisma.certificateTemplate.deleteMany({ where: { schoolId, type: kind } });
    await audit(this.prisma, { schoolId, actorId, action: "certificate_template_reset", entity: "certificate_template", entityId: kind });
    return (await this.templates(schoolId)).find((t) => t.type === kind)!;
  }

  private kind(type: string): CertificateType {
    const found = CERTIFICATE_TYPES.find((t) => t === type);
    if (!found) throw new NotFoundException("Unknown kind of certificate");
    return found;
  }

  // Writing one -----------------------------------------------------------------------------------------------

  /** Everything the wording can mention, taken from the student record as it is right now. */
  private async context(schoolId: string, studentId: string, schoolName: string) {
    const student = await this.prisma.student.findFirst({ where: { id: studentId, schoolId }, select: studentSelect });
    if (!student) throw new NotFoundException("Student not found");
    const guardian = student.guardians[0]?.guardian.name;
    if (!guardian) throw new BadRequestException("This student has no guardian on record. Add one on the student's page first, so the certificate can name them.");
    const cls = student.enrollments[0]?.class;
    return {
      student,
      vars: {
        student: `${student.firstName} ${student.lastName}`.trim(),
        guardian,
        admissionNo: student.admissionNo,
        class: cls ? `${cls.name} ${cls.section}`.trim() : "",
        year: cls?.year.name ?? "",
        dob: student.dateOfBirth ? longDate(isoOf(student.dateOfBirth)) : "",
        school: schoolName,
        ...genderWords(student.gender),
      } as Record<string, string>,
    };
  }

  private async write(schoolId: string, body: unknown) {
    const data = certificateIssueSchema.parse(body);
    const today = karachiToday();
    const problem = certificateProblem(data.type, data.fields, today);
    if (problem) throw new BadRequestException(problem);
    const [letterhead, templates] = await Promise.all([schoolLetterhead(this.prisma, schoolId), this.templates(schoolId)]);
    const { student, vars } = await this.context(schoolId, data.studentId, letterhead.name);
    const fields = data.fields;
    const allVars: Record<string, string> = {
      ...vars,
      date: longDate(today),
      purposeLine: fields.purpose?.trim() ? ` This certificate is issued ${fields.purpose.trim().replace(/\.$/, "")}.` : "",
      conduct: fields.conduct ?? "",
      leavingDate: fields.leavingDate ? longDate(fields.leavingDate) : "",
      reason: fields.reason?.trim() ?? "",
      achievement: fields.achievement?.trim() ?? "",
    };
    const template = templates.find((t) => t.type === data.type)!;
    const title = renderTemplate(template.title, allVars);
    const text = renderTemplate(template.body, allVars);
    const warnings = hasUnprintable(`${title} ${text}`) ? ["This certificate contains Urdu or other non-Latin letters, which can't be printed on a certificate yet. They will appear as question marks. Write names in English letters on the student's record to fix it."] : [];
    return { data, student, vars: allVars, title, text, warnings, today };
  }

  async preview(schoolId: string, body: unknown): Promise<CertificatePreview & { warnings: string[] }> {
    const { title, text, warnings } = await this.write(schoolId, body);
    return { title, text, warnings };
  }

  private async view(rows: Row[]): Promise<CertificateView[]> {
    const ids = [...new Set(rows.flatMap((r) => (r.issuedById ? [r.issuedById] : [])))];
    const people = ids.length ? await this.prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const names = new Map(people.map((p) => [p.id, p.name]));
    return rows.map((r) => ({
      id: r.id,
      serial: r.serial,
      type: r.type,
      title: r.title,
      studentId: r.studentId,
      studentName: `${r.student.firstName} ${r.student.lastName}`.trim(),
      admissionNo: r.student.admissionNo,
      className: String((r.data as { class?: string } | null)?.class ?? ""),
      issuedOn: isoOf(r.issuedOn),
      status: r.status,
      revokedAt: r.revokedAt?.toISOString() ?? null,
      revokeReason: r.revokeReason,
      issuedBy: r.issuedById ? (names.get(r.issuedById) ?? null) : null,
    }));
  }

  async issue(schoolId: string, user: CurrentUser, body: unknown): Promise<CertificateView & { warnings: string[] }> {
    const { data, vars, title, text, warnings, today } = await this.write(schoolId, body);
    const row = await this.prisma.$transaction(async (tx) => {
      const serial = await nextSchoolNumber(tx, schoolId, "CERT", Number(today.slice(0, 4)));
      return tx.issuedCertificate.create({
        data: { schoolId, studentId: data.studentId, type: data.type, serial, issuedOn: dateOnly(today), title, text, data: { class: vars.class, year: vars.year, fields: data.fields } as Prisma.InputJsonValue, issuedById: user.id },
        select: viewSelect,
      });
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "certificate_issued", entity: "certificate", entityId: row.id, summary: `${row.serial} ${data.type}` });
    return { ...(await this.view([row]))[0]!, warnings };
  }

  // Looking after them ----------------------------------------------------------------------------------------

  async list(schoolId: string, query: CertificateListQuery): Promise<CertificateList> {
    const { page, pageSize, skip, take } = pageParams(query, 25);
    const q = query.q?.trim();
    const where: Prisma.IssuedCertificateWhereInput = {
      schoolId,
      ...(CERTIFICATE_TYPES.some((t) => t === query.type) ? { type: query.type as CertificateType } : {}),
      ...(query.status === "ISSUED" || query.status === "REVOKED" ? { status: query.status } : {}),
      ...(query.studentId ? { studentId: query.studentId } : {}),
      ...(q ? { OR: [{ serial: { contains: q, mode: "insensitive" } }, { student: { firstName: { contains: q, mode: "insensitive" } } }, { student: { lastName: { contains: q, mode: "insensitive" } } }, { student: { admissionNo: { contains: q, mode: "insensitive" } } }] } : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.issuedCertificate.findMany({ where, select: viewSelect, orderBy: [{ issuedOn: "desc" }, { createdAt: "desc" }, { id: "asc" }], skip, take }),
      this.prisma.issuedCertificate.count({ where }),
    ]);
    return { items: await this.view(rows), total, page, pageSize };
  }

  async revoke(schoolId: string, user: CurrentUser, id: string, body: unknown): Promise<CertificateView> {
    const { reason } = certificateRevokeSchema.parse(body);
    const row = await this.prisma.issuedCertificate.findFirst({ where: { id, schoolId }, select: { id: true, status: true, serial: true } });
    if (!row) throw new NotFoundException("Certificate not found");
    if (row.status === "REVOKED") throw new BadRequestException("This certificate has already been withdrawn");
    const updated = await this.prisma.issuedCertificate.update({ where: { id }, data: { status: "REVOKED", revokedAt: new Date(), revokedById: user.id, revokeReason: reason }, select: viewSelect });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "certificate_revoked", entity: "certificate", entityId: id, summary: `${row.serial}: ${reason}` });
    return (await this.view([updated]))[0]!;
  }

  /** The PDF is built from the wording saved at issue, so a reprint is identical to the original. */
  async pdf(schoolId: string, id: string, res: Response) {
    const row = await this.prisma.issuedCertificate.findFirst({ where: { id, schoolId }, select: { serial: true, title: true, text: true, issuedOn: true, status: true } });
    if (!row) throw new NotFoundException("Certificate not found");
    const [letterhead, profile] = await Promise.all([schoolLetterhead(this.prisma, schoolId), this.prisma.schoolProfile.findUnique({ where: { schoolId }, select: { principal: true } })]);
    const bytes = await renderCertificate({
      school: { ...letterhead, logoPath: logoFilePath(letterhead.logoUrl) },
      principal: profile?.principal ?? "",
      title: row.title,
      text: row.text,
      serial: row.serial,
      issuedOn: longDate(isoOf(row.issuedOn)),
      revoked: row.status === "REVOKED",
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${row.serial}.pdf"`);
    res.send(bytes);
  }
}
