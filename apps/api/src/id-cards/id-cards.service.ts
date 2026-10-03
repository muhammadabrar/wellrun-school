import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { Response } from "express";
import { MAX_CARDS_PER_PRINT, isoOf, type IdCardKind, type IdCardList, type IdCardPerson } from "@wellrun/shared";
import { schoolLetterhead } from "../common/school";
import { logoFilePath } from "../fees/pdf";
import { PrismaService } from "../prisma/prisma.service";
import type { Card } from "./id-cards.pdf";
import { renderIdCards } from "./id-cards.pdf";

export type IdCardQuery = { kind?: string; classId?: string; ids?: string; sides?: string };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
};

const photoOf = (extra: unknown) => {
  const value = extra && typeof extra === "object" ? (extra as Record<string, unknown>).photo : "";
  return typeof value === "string" ? value : "";
};

const byRoll = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

@Injectable()
export class IdCardsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private kind(value?: string): IdCardKind {
    if (value !== "student" && value !== "staff") throw new BadRequestException("Choose students or staff");
    return value;
  }

  private classWhere(schoolId: string, yearId: string, campusId?: string): Prisma.ClassWhereInput {
    return { schoolId, yearId, ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}) };
  }

  /** People to make cards for, with what each card will show. Students are those enrolled this year; staff are those still working. */
  private async load(schoolId: string, yearId: string, campusId: string | undefined, query: IdCardQuery) {
    const kind = this.kind(query.kind);
    const ids = query.ids ? query.ids.split(",").map((s) => s.trim()).filter(Boolean) : null;
    if (kind === "staff") {
      const staff = await this.prisma.staff.findMany({
        where: { schoolId, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...(campusId ? { OR: [{ campusId }, { campusId: null }] } : {}), ...(ids ? { id: { in: ids } } : {}) },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        take: MAX_CARDS_PER_PRINT + 1,
        select: { id: true, name: true, title: true, department: true, employeeNo: true, photoUrl: true, phone: true },
      });
      return { kind, label: "Staff", staff, students: [] as never[] };
    }
    const cls = query.classId ? await this.prisma.class.findFirst({ where: { id: query.classId, ...this.classWhere(schoolId, yearId, campusId) }, select: { id: true, name: true, section: true } }) : null;
    if (query.classId && !cls) throw new BadRequestException("Class not found in this academic year");
    const enrollments = await this.prisma.enrollment.findMany({
      where: { schoolId, active: true, class: { ...this.classWhere(schoolId, yearId, campusId), ...(cls ? { id: cls.id } : {}) }, student: { status: "active", ...(ids ? { id: { in: ids } } : {}) } },
      take: MAX_CARDS_PER_PRINT + 1,
      select: {
        rollNo: true,
        class: { select: { name: true, section: true } },
        student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, extra: true, guardians: { take: 1, select: { guardian: { select: { name: true, phone: true } } } } } },
      },
    });
    const students = enrollments
      .map((e) => ({ ...e.student, rollNo: e.rollNo, className: `${e.class.name} ${e.class.section}`.trim() }))
      .sort((a, b) => byRoll(a.className, b.className) || byRoll(a.rollNo, b.rollNo) || a.firstName.localeCompare(b.firstName));
    return { kind, label: cls ? `${cls.name} ${cls.section}`.trim() : "All classes", staff: [] as never[], students };
  }

  async list(schoolId: string, yearId: string, campusId: string | undefined, query: IdCardQuery): Promise<IdCardList> {
    const loaded = await this.load(schoolId, yearId, campusId, query);
    const year = await this.prisma.academicYear.findFirst({ where: { id: yearId, schoolId }, select: { endsOn: true } });
    const people: IdCardPerson[] =
      loaded.kind === "staff"
        ? loaded.staff.map((s) => ({ id: s.id, name: s.name, subtitle: [s.title, s.department].filter(Boolean).join(" · "), number: s.employeeNo, hasPhoto: Boolean(s.photoUrl) }))
        : loaded.students.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), subtitle: `${s.className}${s.rollNo ? ` · Roll ${s.rollNo}` : ""}`, number: s.admissionNo, hasPhoto: Boolean(photoOf(s.extra)) }));
    return { kind: loaded.kind, label: loaded.label, people: people.slice(0, MAX_CARDS_PER_PRINT), withoutPhoto: people.filter((p) => !p.hasPhoto).length, validUntil: loaded.kind === "student" && year ? isoOf(year.endsOn) : null };
  }

  async pdf(schoolId: string, yearId: string, campusId: string | undefined, query: IdCardQuery, res: Response) {
    const loaded = await this.load(schoolId, yearId, campusId, query);
    const count = loaded.kind === "staff" ? loaded.staff.length : loaded.students.length;
    if (!count) throw new BadRequestException("There is nobody to make cards for with those choices");
    if (count > MAX_CARDS_PER_PRINT) throw new BadRequestException(`That is more than ${MAX_CARDS_PER_PRINT} cards at once. Choose a class, or fewer people.`);
    const [letterhead, year] = await Promise.all([schoolLetterhead(this.prisma, schoolId), this.prisma.academicYear.findFirst({ where: { id: yearId, schoolId }, select: { endsOn: true, name: true } })]);
    const validity = year ? `Valid until ${shortDate(isoOf(year.endsOn))}` : "";
    const cards: Card[] =
      loaded.kind === "staff"
        ? loaded.staff.map((s) => ({ kind: "staff" as const, name: s.name, subtitle: s.title || "Staff", numberLabel: "Employee no.", number: s.employeeNo, photoPath: logoFilePath(s.photoUrl), contactLine: s.department, contactPhone: "", validity: "" }))
        : loaded.students.map((s) => ({
            kind: "student" as const,
            name: `${s.firstName} ${s.lastName}`.trim(),
            subtitle: `${s.className}${s.rollNo ? `  ·  Roll ${s.rollNo}` : ""}`,
            numberLabel: "Admission no.",
            number: s.admissionNo,
            photoPath: logoFilePath(photoOf(s.extra)),
            contactLine: s.guardians[0]?.guardian.name ?? "",
            contactPhone: s.guardians[0]?.guardian.phone ?? "",
            validity,
          }));
    const bytes = await renderIdCards({ school: { ...letterhead, logoPath: logoFilePath(letterhead.logoUrl) }, cards, sides: query.sides === "front" ? "front" : "both" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="id-cards-${loaded.kind}.pdf"`);
    res.send(bytes);
  }
}
