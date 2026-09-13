import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  DEFAULT_ADMISSION_FIELDS,
  FEE_TEMPLATE,
  SUBJECT_TEMPLATES,
  admissionFieldKey,
  admissionFormSchema,
  applyClassesSchema,
  applySubjectsSchema,
  campusRoleSchema,
  campusSchema,
  classSchema,
  feeItemsSchema,
  importStudentsSchema,
  orgProfileSchema,
  subjectSchema,
  yearSchema,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SetupService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async overview(schoolId: string) {
    const [school, campuses, years, classes, subjects, forms, feeItems, memberships] = await Promise.all([
      this.prisma.school.findUnique({
        where: { id: schoolId },
        include: { profile: true, media: true },
      }),
      this.prisma.campus.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } }),
      this.prisma.academicYear.findMany({ where: { schoolId }, orderBy: { startsOn: "desc" } }),
      this.prisma.class.findMany({
        where: { schoolId },
        include: { year: true, campus: true, subjects: { include: { subject: true } } },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
      this.prisma.subject.findMany({
        where: { schoolId },
        include: { classes: { include: { class: true } } },
        orderBy: { name: "asc" },
      }),
      this.prisma.admissionForm.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } }),
      this.prisma.feeItem.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } }),
      this.prisma.campusMembership.findMany({
        where: { schoolId },
        include: { user: { select: { id: true, name: true, email: true } }, campus: true },
      }),
    ]);
    const campus = campuses.find((c) => c.isMain) ?? campuses[0] ?? null;
    return {
      school,
      campus,
      campuses,
      years,
      classes,
      subjects,
      admissionForms: forms,
      feeItems,
      memberships,
      templates: {
        admissionFields: DEFAULT_ADMISSION_FIELDS,
        feeItems: FEE_TEMPLATE,
        subjectLibrary: SUBJECT_TEMPLATES.pakistan_school,
        subjectTemplates: SUBJECT_TEMPLATES,
      },
    };
  }

  private async writable(schoolId: string) {
    return assertWritableSchool(this.prisma, schoolId);
  }

  async saveOrg(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = orgProfileSchema.parse(body);
    const school = await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        name: data.name,
        type: data.type,
        educationLevel: data.educationLevel ?? "",
        registrationNo: data.registrationNo ?? "",
        phone: data.phone ?? "",
        email: data.email ?? "",
        website: data.website ?? "",
        address: data.address ?? "",
        city: data.city,
        province: data.province ?? "",
        country: data.country ?? "Pakistan",
        setupStep: 2,
      },
    });
    if (data.logoUrl) await this.upsertMedia(schoolId, "LOGO", data.logoUrl);
    if (data.coverUrl) await this.upsertMedia(schoolId, "COVER", data.coverUrl);
    await this.prisma.schoolProfile.upsert({
      where: { schoolId },
      update: { location: data.address ?? "", principal: "" },
      create: {
        schoolId,
        about: "",
        location: data.address ?? "",
        principal: "",
        establishedYear: new Date().getFullYear(),
        studentCount: 0,
        teacherCount: 0,
        facilities: [],
        labs: [],
        sports: [],
        activities: [],
        programs: [],
        feeMinPkr: 0,
        feeMaxPkr: 0,
        feeNotes: "",
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "org_saved", entity: "school", entityId: schoolId });
    return school;
  }

  async saveCampus(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = campusSchema.parse(body);
    const existing = await this.prisma.campus.findFirst({
      where: { schoolId, isMain: data.isMain === false ? undefined : true },
    });
    const payload = {
      name: data.name,
      address: data.address ?? "",
      phone: data.phone ?? "",
      notes: data.notes ?? "",
      principal: data.principal ?? "",
      code: (data.code ?? "MAIN").toUpperCase(),
      isMain: data.isMain ?? true,
    };
    const campus = existing
      ? await this.prisma.campus.update({ where: { id: existing.id }, data: payload })
      : await this.prisma.campus.create({ data: { schoolId, ...payload } });
    await this.prisma.school.update({ where: { id: schoolId }, data: { setupStep: 3 } });
    await this.prisma.campusMembership.upsert({
      where: { campusId_userId: { campusId: campus.id, userId: actorId } },
      update: { role: "SUPER_ADMIN" },
      create: { schoolId, campusId: campus.id, userId: actorId, role: "SUPER_ADMIN" },
    });
    await audit(this.prisma, { schoolId, actorId, action: "campus_saved", entity: "campus", entityId: campus.id });
    return campus;
  }

  async updateCampus(schoolId: string, actorId: string, id: string, body: unknown) {
    await this.writable(schoolId);
    const existing = await this.prisma.campus.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Campus not found");
    const data = campusSchema.parse(body);
    const campus = await this.prisma.campus.update({
      where: { id },
      data: {
        name: data.name,
        address: data.address ?? existing.address,
        phone: data.phone ?? existing.phone,
        principal: data.principal ?? existing.principal,
        code: (data.code ?? existing.code).toUpperCase(),
        notes: data.notes ?? existing.notes,
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "campus_updated", entity: "campus", entityId: campus.id });
    return campus;
  }

  async addCampus(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = campusSchema.parse(body);
    const campus = await this.prisma.campus.create({
      data: {
        schoolId,
        name: data.name,
        address: data.address ?? "",
        phone: data.phone ?? "",
        principal: data.principal ?? "",
        code: (data.code ?? data.name.slice(0, 6).toUpperCase()).replace(/\s+/g, ""),
        isMain: false,
        notes: data.notes ?? "",
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "campus_created", entity: "campus", entityId: campus.id });
    return campus;
  }

  async createYear(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = yearSchema.parse(body);
    if (data.current) {
      await this.prisma.academicYear.updateMany({ where: { schoolId }, data: { current: false } });
    }
    const existing = await this.prisma.academicYear.findFirst({ where: { schoolId, name: data.name } });
    const year = existing
      ? await this.prisma.academicYear.update({
          where: { id: existing.id },
          data: {
            startsOn: new Date(data.startsOn),
            endsOn: new Date(data.endsOn),
            current: data.current ?? true,
          },
        })
      : await this.prisma.academicYear.create({
          data: {
            schoolId,
            name: data.name,
            startsOn: new Date(data.startsOn),
            endsOn: new Date(data.endsOn),
            current: data.current ?? true,
          },
        });
    await this.prisma.school.update({ where: { id: schoolId }, data: { setupStep: 4 } });
    await audit(this.prisma, { schoolId, actorId, action: "year_created", entity: "academic_year", entityId: year.id });
    return year;
  }

  async updateYear(schoolId: string, actorId: string, id: string, body: unknown) {
    await this.writable(schoolId);
    const existing = await this.prisma.academicYear.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Year not found");
    const data = yearSchema.partial().parse(body);
    if (data.current) {
      await this.prisma.academicYear.updateMany({ where: { schoolId }, data: { current: false } });
    }
    const year = await this.prisma.academicYear.update({
      where: { id },
      data: {
        name: data.name,
        startsOn: data.startsOn ? new Date(data.startsOn) : undefined,
        endsOn: data.endsOn ? new Date(data.endsOn) : undefined,
        current: data.current,
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "year_updated", entity: "academic_year", entityId: year.id });
    return year;
  }

  async createClass(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = classSchema.parse(body);
    const yearId = data.yearId ?? (await this.prisma.academicYear.findFirst({ where: { schoolId, current: true } }))?.id;
    if (!yearId) throw new BadRequestException("Create an academic year first");
    const main = await this.prisma.campus.findFirst({ where: { schoolId, isMain: true } });
    const cls = await this.prisma.class.create({
      data: {
        schoolId,
        name: data.name,
        section: data.section,
        yearId,
        campusId: main?.id,
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "class_created", entity: "class", entityId: cls.id });
    return cls;
  }

  async updateClass(schoolId: string, actorId: string, id: string, body: unknown) {
    await this.writable(schoolId);
    const existing = await this.prisma.class.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Class not found");
    const data = classSchema.partial().parse(body);
    const cls = await this.prisma.class.update({
      where: { id },
      data: { name: data.name, section: data.section, yearId: data.yearId },
    });
    await audit(this.prisma, { schoolId, actorId, action: "class_updated", entity: "class", entityId: cls.id });
    return cls;
  }

  async applyClasses(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = applyClassesSchema.parse(body);
    const campus =
      (data.campusId
        ? await this.prisma.campus.findFirst({ where: { id: data.campusId, schoolId } })
        : await this.prisma.campus.findFirst({ where: { schoolId, isMain: true } })) ??
      (await this.prisma.campus.findFirst({ where: { schoolId } }));
    const created = [];
    for (const grade of data.grades.filter((g) => g.selected)) {
      const sections = grade.sections.length ? grade.sections : ["A"];
      for (const section of sections) {
        const existing = await this.prisma.class.findFirst({
          where: {
            schoolId,
            yearId: data.yearId,
            campusId: campus?.id ?? undefined,
            name: grade.name,
            section,
          },
        });
        const cls =
          existing ??
          (await this.prisma.class.create({
            data: {
              schoolId,
              yearId: data.yearId,
              campusId: campus?.id,
              name: grade.name,
              section,
            },
          }));
        created.push(cls);
      }
    }
    await this.prisma.school.update({ where: { id: schoolId }, data: { setupStep: 5 } });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "classes_templated",
      entity: "class",
      entityId: data.yearId,
      summary: `${created.length} classes`,
    });
    return created;
  }

  async saveSubject(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = subjectSchema.parse(body);
    if (data.id) {
      const existing = await this.prisma.subject.findFirst({ where: { id: data.id, schoolId } });
      if (!existing) throw new NotFoundException("Subject not found");
    }
    const subject = data.id
      ? await this.prisma.subject.update({
          where: { id: data.id },
          data: { name: data.name, enabled: data.enabled ?? true, code: data.code ?? undefined },
        })
      : await this.prisma.subject.upsert({
          where: { schoolId_name: { schoolId, name: data.name } },
          update: { enabled: data.enabled ?? true, code: data.code ?? "" },
          create: { schoolId, name: data.name, code: data.code ?? "", enabled: data.enabled ?? true },
        });
    if (data.classIds) {
      await this.prisma.classSubject.deleteMany({ where: { subjectId: subject.id } });
      for (const classId of data.classIds) {
        await this.prisma.classSubject.create({ data: { schoolId, classId, subjectId: subject.id } });
      }
    }
    await audit(this.prisma, { schoolId, actorId, action: "subject_saved", entity: "subject", entityId: subject.id });
    return subject;
  }

  async applySubjectTemplate(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const { template } = applySubjectsSchema.parse(body);
    const names = SUBJECT_TEMPLATES[template];
    for (const name of names) {
      await this.prisma.subject.upsert({
        where: { schoolId_name: { schoolId, name } },
        update: { enabled: true },
        create: { schoolId, name, enabled: true },
      });
    }
    await this.prisma.school.update({ where: { id: schoolId }, data: { setupStep: 7 } });
    await audit(this.prisma, { schoolId, actorId, action: "subjects_templated", entity: "subject", entityId: schoolId });
    return this.prisma.subject.findMany({
      where: { schoolId, enabled: true },
      include: { classes: { include: { class: true } } },
      orderBy: { name: "asc" },
    });
  }

  async seedSubjects(schoolId: string, actorId: string) {
    return this.applySubjectTemplate(schoolId, actorId, { template: "pakistan_school" });
  }

  async saveAdmissionForm(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = admissionFormSchema.parse(body);
    const fields = data.fields.map((field) => ({
      ...field,
      key: field.key?.trim() || admissionFieldKey(field.label),
    }));
    const existing = await this.prisma.admissionForm.findFirst({ where: { schoolId, isDefault: true } });
    const form = existing
      ? await this.prisma.admissionForm.update({
          where: { id: existing.id },
          data: { name: data.name ?? existing.name, fields },
        })
      : await this.prisma.admissionForm.create({
          data: { schoolId, name: data.name ?? "Default admission form", fields, isDefault: true },
        });
    await this.prisma.school.update({ where: { id: schoolId }, data: { setupStep: 8 } });
    await audit(this.prisma, { schoolId, actorId, action: "admission_form_saved", entity: "admission_form", entityId: form.id });
    return form;
  }

  async seedAdmissionForm(schoolId: string) {
    const existing = await this.prisma.admissionForm.findFirst({ where: { schoolId, isDefault: true } });
    if (existing) return existing;
    return this.prisma.admissionForm.create({
      data: { schoolId, name: "Default admission form", fields: [...DEFAULT_ADMISSION_FIELDS], isDefault: true },
    });
  }

  async importStudents(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = importStudentsSchema.parse(body);
    const classes = await this.prisma.class.findMany({ where: { schoolId } });
    const created = [];
    for (const row of data.rows) {
      const get = (key: string) => {
        const source = data.mapping[key];
        if (!source) return "";
        return String(row[source] ?? "").trim();
      };
      const firstName = get("firstName");
      const lastName = get("lastName");
      const admissionNo = get("admissionNo") || `IMP-${Date.now()}-${created.length + 1}`;
      if (!firstName || !lastName) continue;
      const exists = await this.prisma.student.findFirst({ where: { schoolId, admissionNo } });
      if (exists) continue;
      const className = get("className");
      const section = get("section") || "A";
      const cls = classes.find(
        (c) => c.name.toLowerCase() === className.toLowerCase() && c.section.toLowerCase() === section.toLowerCase(),
      );
      const student = await this.prisma.student.create({
        data: {
          schoolId,
          firstName,
          lastName,
          admissionNo,
          gender: get("gender") || "unspecified",
          dateOfBirth: get("dateOfBirth") ? new Date(get("dateOfBirth")) : undefined,
        },
      });
      if (cls) {
        await this.prisma.enrollment.create({
          data: { schoolId, studentId: student.id, classId: cls.id, active: true },
        });
      }
      if (get("guardianName") && get("guardianPhone")) {
        const guardian = await this.prisma.guardian.create({
          data: {
            schoolId,
            name: get("guardianName"),
            phone: get("guardianPhone"),
            relation: get("guardianRelation") || "Parent",
          },
        });
        await this.prisma.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id } });
      }
      created.push(student);
    }
    await this.prisma.school.update({ where: { id: schoolId }, data: { setupStep: 9 } });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "students_imported",
      entity: "student",
      entityId: schoolId,
      summary: `${created.length} students`,
    });
    return { count: created.length };
  }

  async saveFees(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = feeItemsSchema.parse(body);
    await this.prisma.feeItem.deleteMany({ where: { schoolId } });
    const items = await Promise.all(
      data.items.map((item, index) =>
        this.prisma.feeItem.create({
          data: {
            schoolId,
            name: item.name,
            amountPkr: item.amountPkr,
            enabled: item.enabled ?? true,
            sortOrder: item.sortOrder ?? index,
          },
        }),
      ),
    );
    await audit(this.prisma, { schoolId, actorId, action: "fee_structure_saved", entity: "fee_item", entityId: schoolId });
    return items;
  }

  async seedFees(schoolId: string) {
    const existing = await this.prisma.feeItem.count({ where: { schoolId } });
    if (existing) return this.prisma.feeItem.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } });
    return Promise.all(
      FEE_TEMPLATE.map((name, index) =>
        this.prisma.feeItem.create({ data: { schoolId, name, amountPkr: 0, enabled: true, sortOrder: index } }),
      ),
    );
  }

  async addRole(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = campusRoleSchema.parse(body);
    const campus = await this.prisma.campus.findFirst({ where: { id: data.campusId, schoolId } });
    if (!campus) throw new NotFoundException("Campus not found");
    let user = await this.prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user) {
      throw new BadRequestException("Ask this person to create an account first, or invite them from Teachers.");
    }
    const row = await this.prisma.campusMembership.upsert({
      where: { campusId_userId: { campusId: campus.id, userId: user.id } },
      update: { role: data.role },
      create: { schoolId, campusId: campus.id, userId: user.id, role: data.role },
    });
    await audit(this.prisma, { schoolId, actorId, action: "campus_role_saved", entity: "campus_role", entityId: row.id });
    return row;
  }

  async complete(schoolId: string, actorId: string) {
    await this.writable(schoolId);
    await this.seedAdmissionForm(schoolId);
    await this.seedFees(schoolId);
    const school = await this.prisma.school.update({
      where: { id: schoolId },
      data: { setupCompleted: true, setupStep: 10, l2Active: true },
    });
    await audit(this.prisma, { schoolId, actorId, action: "setup_completed", entity: "school", entityId: schoolId });
    return school;
  }

  async skipTo(schoolId: string, step: number) {
    await this.writable(schoolId);
    return this.prisma.school.update({ where: { id: schoolId }, data: { setupStep: step } });
  }

  async saveMedia(schoolId: string, kind: "LOGO" | "COVER", filename: string, dataUrl: string) {
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) throw new BadRequestException("Upload a PNG or JPG image");
    const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
    const dir = join(process.cwd(), "uploads");
    mkdirSync(dir, { recursive: true });
    const name = `${schoolId}-${kind.toLowerCase()}-${Date.now()}.${ext}`;
    writeFileSync(join(dir, name), Buffer.from(match[2], "base64"));
    const url = `http://localhost:3000/uploads/${name}`;
    await this.upsertMedia(schoolId, kind, url);
    return { url, filename: filename || name };
  }

  private upsertMedia(schoolId: string, kind: "LOGO" | "COVER", url: string) {
    return this.prisma.schoolMedia.upsert({
      where: { id: `${schoolId}-${kind}` },
      update: { url },
      create: { id: `${schoolId}-${kind}`, schoolId, kind, url, sortOrder: kind === "LOGO" ? 0 : 1 },
    }).catch(async () => {
      const existing = await this.prisma.schoolMedia.findFirst({ where: { schoolId, kind } });
      if (existing) return this.prisma.schoolMedia.update({ where: { id: existing.id }, data: { url } });
      return this.prisma.schoolMedia.create({ data: { schoolId, kind, url, sortOrder: kind === "LOGO" ? 0 : 1 } });
    });
  }
}
