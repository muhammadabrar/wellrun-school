import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import {
  DEFAULT_ADMISSION_FIELDS,
  FEE_TEMPLATE,
  SUBJECT_TEMPLATES,
  admissionFieldKey,
  admissionFormSchema,
  normalizeAdmissionFields,
  applyClassesSchema,
  applySubjectsSchema,
  campusRoleSchema,
  campusSchema,
  classSchema,
  classSubjectsSchema,
  feeItemsSchema,
  importStudentsSchema,
  orgProfileSchema,
  subjectSchema,
  yearSchema,
} from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import { assertClassWritable, assertClassesWritable, assertYearOpen, assertYearWritable } from "../common/year-lock";
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
    if (!school) throw new NotFoundException("School not found. Sign in again after seeding.");
    const campus = campuses.find((c) => c.isMain) ?? campuses[0] ?? null;
    return {
      school,
      campus,
      campuses,
      years,
      classes,
      subjects,
      admissionForms: forms.map((form) => ({
        ...form,
        fields: this.formFields(form.fields),
      })),
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

  async status(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: { setupCompleted: true, setupStep: true },
    });
    if (!school) throw new NotFoundException("School not found. Sign in again after seeding.");
    return {
      setupCompleted: school.setupCompleted,
      setupStep: school.setupStep,
    };
  }

  async admissionForm(schoolId: string) {
    const form = await this.prisma.admissionForm.findFirst({
      where: { schoolId },
      orderBy: { createdAt: "asc" },
      select: { fields: true },
    });
    return { fields: this.formFields(form?.fields) };
  }

  async admission(schoolId: string) {
    const [form, classes] = await Promise.all([
      this.prisma.admissionForm.findFirst({
        where: { schoolId },
        orderBy: { createdAt: "asc" },
        select: { fields: true },
      }),
      this.prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, section: true },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
    ]);
    return { fields: this.formFields(form?.fields), classes };
  }

  async campusesOverview(schoolId: string) {
    const campuses = await this.prisma.campus.findMany({
      where: { schoolId },
      select: { id: true, name: true, address: true, phone: true, principal: true, code: true, isMain: true },
      orderBy: { createdAt: "asc" },
    });
    return { campuses };
  }

  async academics(schoolId: string) {
    const [years, classes, subjects] = await Promise.all([
      this.prisma.academicYear.findMany({
        where: { schoolId },
        select: { id: true, name: true, startsOn: true, endsOn: true, current: true },
        orderBy: { startsOn: "desc" },
      }),
      this.prisma.class.findMany({
        where: { schoolId },
        select: {
          id: true,
          name: true,
          section: true,
          yearId: true,
          campusId: true,
          _count: { select: { enrollments: { where: { active: true } }, lessons: true } },
          subjects: { select: { subjectId: true } },
          assignments: { select: { staff: { select: { id: true, name: true } } } },
          lessons: {
            distinct: ["subject", "staffId"],
            select: { subject: true, staff: { select: { id: true, name: true } } },
          },
        },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
      this.prisma.subject.findMany({
        where: { schoolId },
        select: { id: true, name: true, enabled: true, _count: { select: { classes: true } } },
        orderBy: { name: "asc" },
      }),
    ]);
    return {
      years,
      classes: classes.map((cls) => {
        const teachers = new Map<string, string>();
        for (const row of [...cls.assignments, ...cls.lessons]) if (row.staff) teachers.set(row.staff.id, row.staff.name);
        return {
          id: cls.id,
          name: cls.name,
          section: cls.section,
          yearId: cls.yearId,
          campusId: cls.campusId,
          students: cls._count.enrollments,
          lessons: cls._count.lessons,
          subjectIds: cls.subjects.map((row) => row.subjectId),
          timetableSubjects: [...new Set(cls.lessons.map((row) => row.subject))].sort((a, b) => a.localeCompare(b)),
          teachers: [...teachers].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
        };
      }),
      subjects: subjects.map((subject) => ({
        id: subject.id,
        name: subject.name,
        enabled: subject.enabled,
        classes: subject._count.classes,
      })),
    };
  }

  async feeStructure(schoolId: string) {
    const feeItems = await this.prisma.feeItem.findMany({
      where: { schoolId },
      select: { id: true, name: true, amountPkr: true, enabled: true },
      orderBy: { sortOrder: "asc" },
    });
    return { feeItems, templates: { feeItems: FEE_TEMPLATE } };
  }

  async profile(schoolId: string) {
    const school = await this.prisma.school.findUnique({
      where: { id: schoolId },
      select: {
        name: true,
        address: true,
        area: true,
        whatsapp: true,
        phone: true,
        website: true,
        feeBand: true,
        profile: true,
      },
    });
    return { school };
  }

  private formFields(fields: unknown) {
    return normalizeAdmissionFields(
      (Array.isArray(fields) && fields.length ? fields : DEFAULT_ADMISSION_FIELDS) as Array<{
        key?: string;
        label: string;
        type?: string;
        required?: boolean;
        group?: string;
      }>,
    );
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
    const existing = await this.prisma.academicYear.findFirst({ where: { schoolId, name: data.name } });
    assertYearOpen(existing);
    const current = data.current ?? true;
    if (current) await this.clearCurrentYear(schoolId, existing?.id);
    const year = existing
      ? await this.prisma.academicYear.update({
          where: { id: existing.id },
          data: {
            startsOn: new Date(data.startsOn),
            endsOn: new Date(data.endsOn),
            current,
            ...(current ? { status: "ACTIVE" as const } : {}),
          },
        })
      : await this.prisma.academicYear.create({
          data: {
            schoolId,
            name: data.name,
            startsOn: new Date(data.startsOn),
            endsOn: new Date(data.endsOn),
            current,
            ...(current ? { status: "ACTIVE" as const } : {}),
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
    assertYearOpen(existing);
    const data = yearSchema.partial().parse(body);
    if (data.current) await this.clearCurrentYear(schoolId, id);
    const year = await this.prisma.academicYear.update({
      where: { id },
      data: {
        name: data.name,
        startsOn: data.startsOn ? new Date(data.startsOn) : undefined,
        endsOn: data.endsOn ? new Date(data.endsOn) : undefined,
        current: data.current,
        ...(data.current ? { status: "ACTIVE" as const } : {}),
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "year_updated", entity: "academic_year", entityId: year.id });
    return year;
  }

  /** Only one current year per school: the one being replaced is closed if it has ended, otherwise goes back to upcoming. */
  private async clearCurrentYear(schoolId: string, exceptId?: string) {
    const where = { schoolId, current: true, ...(exceptId ? { id: { not: exceptId } } : {}) };
    await this.prisma.academicYear.updateMany({ where: { ...where, endsOn: { lt: new Date() } }, data: { current: false, status: "CLOSED", closedAt: new Date() } });
    await this.prisma.academicYear.updateMany({ where, data: { current: false, status: "PLANNING" } });
  }

  async createClass(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = classSchema.parse(body);
    const yearId = data.yearId ?? (await this.prisma.academicYear.findFirst({ where: { schoolId, current: true } }))?.id;
    if (!yearId) throw new BadRequestException("Create an academic year first");
    await assertYearWritable(this.prisma, schoolId, yearId);
    const campus =
      (data.campusId ? await this.prisma.campus.findFirst({ where: { id: data.campusId, schoolId } }) : null) ??
      (await this.prisma.campus.findFirst({ where: { schoolId, isMain: true } }));
    const duplicate = await this.prisma.class.findFirst({
      where: { schoolId, yearId, campusId: campus?.id ?? null, name: data.name, section: data.section },
    });
    if (duplicate) throw new BadRequestException(`${data.name} ${data.section} already exists.`);
    const cls = await this.prisma.class.create({
      data: {
        schoolId,
        name: data.name,
        section: data.section,
        yearId,
        campusId: campus?.id,
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
    await assertYearWritable(this.prisma, schoolId, existing.yearId);
    if (data.yearId && data.yearId !== existing.yearId) await assertYearWritable(this.prisma, schoolId, data.yearId);
    const cls = await this.prisma.class.update({
      where: { id },
      data: { name: data.name, section: data.section, yearId: data.yearId },
    });
    await audit(this.prisma, { schoolId, actorId, action: "class_updated", entity: "class", entityId: cls.id });
    return cls;
  }

  async removeClass(schoolId: string, actorId: string, id: string) {
    await this.writable(schoolId);
    const existing = await this.prisma.class.findFirst({
      where: { id, schoolId },
      select: { id: true, name: true, section: true, _count: { select: { enrollments: { where: { active: true } } } } },
    });
    if (!existing) throw new NotFoundException("Class not found");
    await assertClassWritable(this.prisma, schoolId, id);
    const students = existing._count.enrollments;
    if (students) {
      throw new BadRequestException(
        `${existing.name} ${existing.section} still has ${students} student${students === 1 ? "" : "s"}. Move them to another class first.`,
      );
    }
    await this.prisma.class.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "class_deleted", entity: "class", entityId: id });
    return { ok: true };
  }

  async setClassSubjects(schoolId: string, actorId: string, id: string, body: unknown) {
    await this.writable(schoolId);
    const cls = await this.prisma.class.findFirst({ where: { id, schoolId }, select: { id: true } });
    if (!cls) throw new NotFoundException("Class not found");
    await assertClassWritable(this.prisma, schoolId, id);
    const { subjectIds } = classSubjectsSchema.parse(body);
    const valid = await this.prisma.subject.findMany({ where: { schoolId, id: { in: subjectIds } }, select: { id: true } });
    await this.prisma.$transaction([
      this.prisma.classSubject.deleteMany({ where: { classId: id } }),
      this.prisma.classSubject.createMany({ data: valid.map((row) => ({ schoolId, classId: id, subjectId: row.id })) }),
    ]);
    await audit(this.prisma, { schoolId, actorId, action: "class_subjects_saved", entity: "class", entityId: id });
    return { subjectIds: valid.map((row) => row.id) };
  }

  async removeSubject(schoolId: string, actorId: string, id: string) {
    await this.writable(schoolId);
    const existing = await this.prisma.subject.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Subject not found");
    await this.prisma.subject.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "subject_deleted", entity: "subject", entityId: id });
    return { ok: true };
  }

  async applyClasses(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = applyClassesSchema.parse(body);
    await assertYearWritable(this.prisma, schoolId, data.yearId);
    const campus =
      (data.campusId
        ? await this.prisma.campus.findFirst({ where: { id: data.campusId, schoolId } })
        : await this.prisma.campus.findFirst({ where: { schoolId, isMain: true } })) ??
      (await this.prisma.campus.findFirst({ where: { schoolId } }));
    const created: Array<{ id: string; name: string; section: string }> = [];
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
      await assertClassesWritable(this.prisma, schoolId, data.classIds);
      // Closed years keep their subject list as history.
      await this.prisma.classSubject.deleteMany({ where: { subjectId: subject.id, class: { year: { status: { not: "CLOSED" } } } } });
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
    const fields = normalizeAdmissionFields(
      data.fields.map((field) => ({
        ...field,
        key: field.key?.trim() || admissionFieldKey(field.label),
      })),
    );
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
      data: { schoolId, name: "Default admission form", fields: normalizeAdmissionFields(DEFAULT_ADMISSION_FIELDS), isDefault: true },
    });
  }

  async importStudents(schoolId: string, actorId: string, body: unknown) {
    await this.writable(schoolId);
    const data = importStudentsSchema.parse(body);
    const classes = await this.prisma.class.findMany({ where: { schoolId } });
    const created: { id: string }[] = [];
    for (const row of data.rows) {
      const get = (key: string) => {
        const source = data.mapping[key];
        if (!source) return "";
        return String(row[source] ?? "").trim();
      };
      const firstName = get("firstName");
      const lastName = get("lastName");
      if (!firstName || !lastName) continue;
      const className = get("className");
      const section = get("section") || "A";
      const cls = classes.find(
        (c) => c.name.toLowerCase() === className.toLowerCase() && c.section.toLowerCase() === section.toLowerCase(),
      );
      const count = await this.prisma.student.count({ where: { schoolId } });
      const admissionNo = get("admissionNo") || `ADM-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
      const exists = await this.prisma.student.findFirst({ where: { schoolId, admissionNo } });
      if (exists) continue;
      const now = new Date();
      const classRolls = cls
        ? await this.prisma.enrollment.count({ where: { schoolId, classId: cls.id } })
        : created.length;
      const student = await this.prisma.student.create({
        data: {
          schoolId,
          campusId: cls?.campusId,
          firstName,
          lastName,
          admissionNo,
          rollNo: get("rollNo") || String(classRolls + 1),
          gender: get("gender") || "unspecified",
          dateOfBirth: get("dateOfBirth") ? new Date(get("dateOfBirth")) : undefined,
          admissionDate: now,
          firstAdmissionDate: now,
        },
      });
      if (cls) {
        await this.prisma.enrollment.create({
          data: { schoolId, studentId: student.id, classId: cls.id, active: true, rollNo: student.rollNo, status: "active" },
        });
      }
      if (get("guardianName") && get("guardianPhone")) {
        const guardian = await this.prisma.guardian.create({
          data: {
            schoolId,
            name: get("guardianName"),
            phone: get("guardianPhone"),
            cnic: get("guardianCnic") || "",
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
    const existing = await this.prisma.feeItem.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } });
    const keep: string[] = [];
    const items = [];
    for (const [index, item] of data.items.entries()) {
      const match = existing.find((row) => row.name === item.name && !keep.includes(row.id)) ?? existing.find((row) => !keep.includes(row.id) && existing.indexOf(row) === index);
      const payload = {
        name: item.name,
        amountPkr: item.amountPkr,
        enabled: item.enabled ?? true,
        sortOrder: item.sortOrder ?? index,
      };
      const row = match
        ? await this.prisma.feeItem.update({ where: { id: match.id }, data: payload })
        : await this.prisma.feeItem.create({ data: { schoolId, ...payload } });
      keep.push(row.id);
      items.push(row);
      await this.prisma.feeHead.upsert({
        where: { id: row.id },
        create: {
          id: row.id,
          schoolId,
          name: row.name,
          code: row.name.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase().slice(0, 32),
          amountPkr: row.amountPkr,
          active: row.enabled,
          sortOrder: row.sortOrder,
        },
        update: { name: row.name, amountPkr: row.amountPkr, active: row.enabled, sortOrder: row.sortOrder },
      });
    }
    if (keep.length) {
      await this.prisma.feeItem.updateMany({ where: { schoolId, id: { notIn: keep } }, data: { enabled: false } });
      await this.prisma.feeHead.updateMany({ where: { schoolId, id: { notIn: keep } }, data: { active: false } });
    }
    await audit(this.prisma, { schoolId, actorId, action: "fee_structure_saved", entity: "fee_item", entityId: schoolId });
    return items;
  }

  async seedFees(schoolId: string) {
    const existing = await this.prisma.feeItem.count({ where: { schoolId } });
    if (existing) return this.prisma.feeItem.findMany({ where: { schoolId }, orderBy: { sortOrder: "asc" } });
    const items = [];
    for (const [index, name] of FEE_TEMPLATE.entries()) {
      const row = await this.prisma.feeItem.create({ data: { schoolId, name, amountPkr: 0, enabled: true, sortOrder: index } });
      await this.prisma.feeHead.create({
        data: {
          id: row.id,
          schoolId,
          name,
          code: name.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase().slice(0, 32),
          amountPkr: 0,
          active: true,
          sortOrder: index,
        },
      });
      items.push(row);
    }
    return items;
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
    // Fees aren't seeded with Rs. 0 placeholders any more — the dashboard's "Set up fees" checklist
    // walks the school through adding real fee heads and class fee structures.
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
