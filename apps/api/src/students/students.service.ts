import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  admitStudentSchema,
  classSortIndex,
  guardianSchema,
  studentListQuerySchema,
  studentSchema,
} from "@wellrun/shared";
import { Prisma } from "@prisma/client";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StudentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(schoolId: string, query: Record<string, string | undefined>) {
    const filters = studentListQuerySchema.parse(query);
    const [year, campuses, classes] = await Promise.all([
      this.prisma.academicYear.findFirst({ where: { schoolId, current: true } }),
      this.prisma.campus.findMany({ where: { schoolId }, orderBy: { createdAt: "asc" } }),
      this.prisma.class.findMany({ where: { schoolId }, include: { campus: true }, orderBy: [{ name: "asc" }, { section: "asc" }] }),
    ]);
    const campus = campuses.find((row) => row.isMain) ?? campuses[0] ?? null;
    const campusClasses = classes
      .filter((row) => !campus || row.campusId === campus.id || !row.campusId)
      .sort((a, b) => classSortIndex(a.name) - classSortIndex(b.name) || a.section.localeCompare(b.section));
    const defaultClassId = campusClasses[0]?.id ?? "";
    const classId = filters.classId === "all" ? undefined : filters.classId || defaultClassId || undefined;

    const where: Prisma.StudentWhereInput = { schoolId };
    const studentQuery = filters.q?.trim();
    if (studentQuery) {
      where.OR = [
        { firstName: { contains: studentQuery, mode: "insensitive" } },
        { lastName: { contains: studentQuery, mode: "insensitive" } },
        { rollNo: { contains: studentQuery, mode: "insensitive" } },
        { admissionNo: { contains: studentQuery, mode: "insensitive" } },
      ];
    }
    const guardianQuery = filters.guardian?.trim();
    if (guardianQuery) {
      where.guardians = {
        some: {
          guardian: {
            OR: [
              { phone: { contains: guardianQuery, mode: "insensitive" } },
              { cnic: { contains: guardianQuery, mode: "insensitive" } },
              { name: { contains: guardianQuery, mode: "insensitive" } },
            ],
          },
        },
      };
    }
    if (filters.dateOfBirth) {
      const day = new Date(`${filters.dateOfBirth}T00:00:00.000Z`);
      const next = new Date(day);
      next.setUTCDate(next.getUTCDate() + 1);
      where.dateOfBirth = { gte: day, lt: next };
    }
    if (classId) {
      where.enrollments = { some: { active: true, classId } };
    }

    const students = await this.prisma.student.findMany({
      where,
      include: {
        enrollments: { where: { active: true }, include: { class: true } },
        guardians: { include: { guardian: true } },
        invoices: { include: { payments: true } },
        attendance: year
          ? { where: { date: { gte: year.startsOn, lte: year.endsOn } } }
          : true,
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    let rows = students.map((student) => this.toListRow(student));
    const addressQuery = filters.address?.trim().toLowerCase();
    if (addressQuery) {
      rows = rows.filter((row) => row.address.toLowerCase().includes(addressQuery));
    }
    if (filters.perfectAttendance === "true") {
      rows = rows.filter((row) => row.attendancePct === 100 && row.attendanceMarked);
    }
    if (filters.topScorer === "true") {
      const topIds = await this.topScorerIds(schoolId);
      rows = rows.filter((row) => topIds.has(row.id));
    }

    const total = rows.length;
    const start = (filters.page - 1) * filters.pageSize;
    return {
      items: rows.slice(start, start + filters.pageSize),
      total,
      page: filters.page,
      pageSize: filters.pageSize,
      defaultClassId,
      campus: campus ? { id: campus.id, name: campus.name } : null,
      classes: campusClasses.map((row) => ({ id: row.id, name: row.name, section: row.section, campusId: row.campusId })),
    };
  }

  async guardians(schoolId: string, q?: string) {
    const query = q?.trim();
    return this.prisma.guardian.findMany({
      where: query
        ? {
            schoolId,
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { phone: { contains: query, mode: "insensitive" } },
              { cnic: { contains: query, mode: "insensitive" } },
            ],
          }
        : { schoolId },
      include: { _count: { select: { students: true } } },
      orderBy: { name: "asc" },
      take: 40,
    });
  }

  async byId(schoolId: string, id: string) {
    const [student, years, classes, form] = await Promise.all([
      this.prisma.student.findFirst({
        where: { id, schoolId },
        include: {
          campus: true,
          enrollments: { include: { class: { include: { year: true } } }, orderBy: { createdAt: "desc" } },
          guardians: {
            include: {
              guardian: {
                include: {
                  students: {
                    include: {
                      student: {
                        include: { enrollments: { where: { active: true }, include: { class: true } } },
                      },
                    },
                  },
                },
              },
            },
          },
          invoices: { include: { payments: true, feePlan: { include: { year: true } } }, orderBy: { dueOn: "desc" } },
          attendance: { include: { class: true }, orderBy: { date: "desc" } },
          examResults: { include: { exam: { include: { year: true } } }, orderBy: { exam: { heldOn: "desc" } } },
        },
      }),
      this.prisma.academicYear.findMany({ where: { schoolId }, orderBy: { startsOn: "desc" } }),
      this.prisma.class.findMany({
        where: { schoolId },
        include: { year: true },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
      this.prisma.admissionForm.findFirst({ where: { schoolId, isDefault: true } }),
    ]);
    if (!student) throw new NotFoundException("Student not found");
    return this.toProfile(student, years, classes, form?.fields);
  }

  async admit(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = admitStudentSchema.parse(body);
    const cls = await this.resolveClass(schoolId, data.classId, data.className, data.section);
    const now = new Date();
    const admissionNo = await this.nextAdmissionNo(schoolId);
    const rollNo = await this.nextRollNo(schoolId, cls.id);
    const firstAdmissionDate = now;
    const extra = { ...(data.extra ?? {}) };
    delete extra.firstName;
    delete extra.lastName;
    delete extra.dateOfBirth;
    delete extra.className;
    delete extra.section;
    delete extra.classId;
    delete extra.gender;
    if (data.phone) extra.phone = data.phone;
    if (data.address) extra.address = data.address;

    const student = await this.prisma.student.create({
      data: {
        schoolId,
        campusId: cls.campusId,
        firstName: data.firstName,
        lastName: data.lastName,
        admissionNo,
        rollNo,
        gender: data.gender || "unspecified",
        dateOfBirth: new Date(data.dateOfBirth),
        status: "active",
        admissionDate: now,
        firstAdmissionDate,
        extra,
      },
    });
    await this.prisma.enrollment.create({
      data: { schoolId, studentId: student.id, classId: cls.id, active: true },
    });
    const guardianId = data.guardianId
      ? data.guardianId
      : await this.findOrCreateGuardian(schoolId, actorId, {
          ...data.guardian!,
          extra: data.guardianExtra ?? data.guardian?.extra,
        });
    const guardian = await this.prisma.guardian.findFirst({ where: { id: guardianId, schoolId } });
    if (!guardian) throw new BadRequestException("Guardian not found");
    await this.prisma.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id } });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "student_admitted",
      entity: "student",
      entityId: student.id,
      summary: `${student.firstName} ${student.lastName}`,
    });
    return this.byId(schoolId, student.id);
  }

  async create(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = studentSchema.parse(body);
    const admissionNo = data.admissionNo || (await this.nextAdmissionNo(schoolId));
    const existing = await this.prisma.student.findFirst({ where: { schoolId, admissionNo } });
    if (existing) throw new BadRequestException("Admission number already exists");
    const cls = data.classId ? await this.prisma.class.findFirst({ where: { id: data.classId, schoolId } }) : null;
    const student = await this.prisma.student.create({
      data: {
        schoolId,
        campusId: cls?.campusId,
        firstName: data.firstName,
        lastName: data.lastName,
        admissionNo,
        rollNo: cls ? await this.nextRollNo(schoolId, cls.id) : admissionNo,
        gender: data.gender || "unspecified",
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        status: data.status,
        extra: {
          ...(data.extra ?? {}),
          ...(data.phone ? { phone: data.phone } : {}),
          ...(data.address ? { address: data.address } : {}),
        },
      },
    });
    if (cls) {
      await this.prisma.enrollment.create({
        data: { schoolId, studentId: student.id, classId: cls.id, active: true },
      });
    }
    for (const guardian of data.guardians ?? []) {
      await this.linkGuardian(schoolId, actorId, student.id, guardian);
    }
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "student_created",
      entity: "student",
      entityId: student.id,
    });
    return this.byId(schoolId, student.id);
  }

  async linkGuardian(schoolId: string, actorId: string, studentId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    await this.byId(schoolId, studentId);
    const data = guardianSchema.parse(body);
    const guardianId = await this.findOrCreateGuardian(schoolId, actorId, data);
    await this.prisma.studentGuardian.upsert({
      where: { studentId_guardianId: { studentId, guardianId } },
      update: {},
      create: { studentId, guardianId },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "guardian_linked",
      entity: "guardian",
      entityId: guardianId,
    });
    return this.byId(schoolId, studentId);
  }

  async savePhoto(schoolId: string, actorId: string, id: string, dataUrl: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const student = await this.prisma.student.findFirst({ where: { id, schoolId } });
    if (!student) throw new NotFoundException("Student not found");
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) throw new BadRequestException("Upload a PNG or JPG image");
    const ext = match[1].includes("png") ? "png" : match[1].includes("webp") ? "webp" : "jpg";
    const dir = join(process.cwd(), "uploads");
    mkdirSync(dir, { recursive: true });
    const name = `${schoolId}-student-${id}-${Date.now()}.${ext}`;
    writeFileSync(join(dir, name), Buffer.from(match[2], "base64"));
    const url = `http://localhost:3000/uploads/${name}`;
    await this.prisma.student.update({
      where: { id },
      data: { extra: { ...this.extraRecord(student.extra), photo: url } },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "student_photo_saved",
      entity: "student",
      entityId: id,
    });
    return this.byId(schoolId, id);
  }

  async update(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const current = await this.prisma.student.findFirst({ where: { id, schoolId } });
    if (!current) throw new NotFoundException("Student not found");
    const data = studentSchema.partial().parse(body);
    const extra = { ...this.extraRecord(current.extra), ...(data.extra ?? {}) };
    if (data.phone !== undefined) extra.phone = data.phone;
    if (data.address !== undefined) extra.address = data.address;
    await this.prisma.student.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        admissionNo: data.admissionNo,
        gender: data.gender,
        status: data.status,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        extra,
      },
    });
    if (data.classId) {
      await this.prisma.enrollment.updateMany({ where: { studentId: id, active: true }, data: { active: false } });
      const cls = await this.prisma.class.findFirst({ where: { id: data.classId, schoolId } });
      await this.prisma.enrollment.create({
        data: { schoolId, studentId: id, classId: data.classId, active: true },
      });
      if (cls?.campusId) {
        await this.prisma.student.update({ where: { id }, data: { campusId: cls.campusId } });
      }
    }
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "student_updated",
      entity: "student",
      entityId: id,
    });
    return this.byId(schoolId, id);
  }

  private async findOrCreateGuardian(
    schoolId: string,
    actorId: string,
    data: { name: string; phone: string; relation: string; cnic?: string; email?: string; extra?: Record<string, unknown> },
  ) {
    const cnic = data.cnic?.trim() || "";
    const existing = await this.prisma.guardian.findFirst({
      where: {
        schoolId,
        OR: [{ phone: data.phone }, ...(cnic ? [{ cnic }] : [])],
      },
    });
    if (existing) {
      await this.prisma.guardian.update({
        where: { id: existing.id },
        data: {
          name: data.name || existing.name,
          relation: data.relation || existing.relation,
          cnic: cnic || existing.cnic,
          email: data.email || existing.email,
          extra: data.extra ?? existing.extra ?? {},
        },
      });
      return existing.id;
    }
    const guardian = await this.prisma.guardian.create({
      data: {
        schoolId,
        name: data.name,
        phone: data.phone,
        cnic,
        email: data.email || null,
        relation: data.relation,
        extra: data.extra ?? {},
      },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "guardian_created",
      entity: "guardian",
      entityId: guardian.id,
    });
    return guardian.id;
  }

  private async resolveClass(schoolId: string, classId: string | undefined, className: string, section: string) {
    if (classId) {
      const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
      if (!cls) throw new BadRequestException("Class not found");
      return cls;
    }
    const cls = await this.prisma.class.findFirst({
      where: { schoolId, name: className, section },
    });
    if (!cls) throw new BadRequestException("That class and section are not set up yet.");
    return cls;
  }

  private async nextAdmissionNo(schoolId: string) {
    const year = new Date().getFullYear();
    const count = await this.prisma.student.count({ where: { schoolId } });
    let attempt = count + 1;
    while (attempt < count + 1000) {
      const admissionNo = `ADM-${year}-${String(attempt).padStart(4, "0")}`;
      const exists = await this.prisma.student.findFirst({ where: { schoolId, admissionNo } });
      if (!exists) return admissionNo;
      attempt += 1;
    }
    return `ADM-${year}-${Date.now()}`;
  }

  private async nextRollNo(schoolId: string, classId: string) {
    const enrolled = await this.prisma.enrollment.findMany({
      where: { schoolId, classId, active: true },
      include: { student: { select: { rollNo: true } } },
    });
    const used = enrolled.map((row) => Number.parseInt(row.student.rollNo, 10)).filter((value) => Number.isFinite(value));
    return String((used.length ? Math.max(...used) : 0) + 1);
  }

  private async topScorerIds(schoolId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { schoolId },
      orderBy: { heldOn: "desc" },
      include: { results: true },
    });
    if (!exam) return new Set<string>();
    return new Set(
      exam.results
        .filter((row) => row.totalMarks > 0 && row.obtainedMarks / row.totalMarks >= 0.8)
        .map((row) => row.studentId),
    );
  }

  private extraRecord(extra: unknown): Record<string, string> {
    if (!extra || typeof extra !== "object" || Array.isArray(extra)) return {};
    return Object.fromEntries(
      Object.entries(extra as Record<string, unknown>).map(([key, value]) => [key, value == null ? "" : String(value)]),
    );
  }

  private extraText(extra: unknown, key: string) {
    return this.extraRecord(extra)[key] ?? "";
  }

  private toProfile(
    student: {
      id: string;
      admissionNo: string;
      rollNo: string;
      firstName: string;
      lastName: string;
      gender: string;
      status: string;
      dateOfBirth: Date | null;
      admissionDate: Date;
      firstAdmissionDate: Date;
      extra: unknown;
      campus: { id: string; name: string } | null;
      enrollments: {
        active: boolean;
        class: { id: string; name: string; section: string; yearId: string; year: { id: string; name: string } };
      }[];
      guardians: {
        guardian: {
          id: string;
          name: string;
          phone: string;
          cnic: string;
          email: string | null;
          relation: string;
          students: {
            student: {
              id: string;
              firstName: string;
              lastName: string;
              rollNo: string;
              extra: unknown;
              enrollments: { class: { name: string; section: string } }[];
            };
          }[];
        };
      }[];
      invoices: {
        id: string;
        amountPkr: number;
        status: string;
        dueOn: Date;
        feePlan: { name: string; yearId: string; year: { id: string; name: string } };
        payments: { id: string; amountPkr: number }[];
      }[];
      attendance: { id: string; date: Date; status: string; class: { name: string; section: string } }[];
      examResults: {
        id: string;
        totalMarks: number;
        obtainedMarks: number;
        exam: { id: string; name: string; heldOn: Date; yearId: string | null; year: { id: string; name: string } | null };
      }[];
    },
    years: { id: string; name: string; startsOn: Date; endsOn: Date; current: boolean }[],
    classes: { id: string; name: string; section: string; yearId: string; year: { name: string } }[],
    formFields: unknown,
  ) {
    const extra = this.extraRecord(student.extra);
    const labels = this.fieldLabels(formFields);
    const currentClass = student.enrollments.find((row) => row.active)?.class ?? student.enrollments[0]?.class ?? null;
    const siblings = new Map<
      string,
      { id: string; firstName: string; lastName: string; rollNo: string; photo: string; class: { name: string; section: string } | null }
    >();
    for (const link of student.guardians) {
      for (const other of link.guardian.students) {
        if (other.student.id === student.id || siblings.has(other.student.id)) continue;
        siblings.set(other.student.id, {
          id: other.student.id,
          firstName: other.student.firstName,
          lastName: other.student.lastName,
          rollNo: other.student.rollNo,
          photo: this.extraText(other.student.extra, "photo"),
          class: other.student.enrollments[0]?.class ?? null,
        });
      }
    }
    const hiddenExtra = new Set(["photo", "phone", "address"]);
    return {
      id: student.id,
      admissionNo: student.admissionNo,
      rollNo: student.rollNo || student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      gender: student.gender,
      status: student.status,
      dateOfBirth: student.dateOfBirth,
      admissionDate: student.admissionDate,
      firstAdmissionDate: student.firstAdmissionDate,
      extra,
      photo: extra.photo || "",
      phone: extra.phone || student.guardians[0]?.guardian.phone || "",
      address: extra.address || "",
      campus: student.campus,
      class: currentClass ? { id: currentClass.id, name: currentClass.name, section: currentClass.section, yearId: currentClass.yearId } : null,
      guardians: student.guardians.map((link) => ({
        guardian: {
          id: link.guardian.id,
          name: link.guardian.name,
          phone: link.guardian.phone,
          cnic: link.guardian.cnic,
          email: link.guardian.email,
          relation: link.guardian.relation,
        },
      })),
      siblings: [...siblings.values()],
      details: [
        { label: "Class", value: currentClass ? `${currentClass.name} ${currentClass.section}` : "" },
        { label: "Campus", value: student.campus?.name ?? "" },
        { label: "Gender", value: student.gender && student.gender !== "unspecified" ? student.gender : "" },
        { label: "Date of birth", value: student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : "" },
        { label: "Phone", value: extra.phone || student.guardians[0]?.guardian.phone || "" },
        { label: "Address", value: extra.address || "" },
        { label: "Admission no.", value: student.admissionNo },
        { label: "Admission date", value: student.admissionDate.toISOString().slice(0, 10) },
        { label: "First admission", value: student.firstAdmissionDate.toISOString().slice(0, 10) },
        ...Object.entries(extra)
          .filter(([key, value]) => value && !hiddenExtra.has(key))
          .map(([key, value]) => ({ label: labels[key] || key, value })),
      ].filter((row) => row.value),
      years: years.map((year) => ({
        id: year.id,
        name: year.name,
        current: year.current,
        startsOn: year.startsOn,
        endsOn: year.endsOn,
      })),
      classes: classes
        .sort((a, b) => classSortIndex(a.name) - classSortIndex(b.name) || a.section.localeCompare(b.section))
        .map((cls) => ({ id: cls.id, name: cls.name, section: cls.section, yearId: cls.yearId, yearName: cls.year.name })),
      exams: student.examResults.map((row) => ({
        id: row.id,
        name: row.exam.name,
        heldOn: row.exam.heldOn,
        yearId: row.exam.yearId || row.exam.year?.id || "",
        totalMarks: row.totalMarks,
        obtainedMarks: row.obtainedMarks,
        pct: row.totalMarks > 0 ? Math.round((row.obtainedMarks / row.totalMarks) * 100) : 0,
      })),
      attendance: student.attendance.map((row) => ({
        id: row.id,
        date: row.date,
        status: row.status,
        className: `${row.class.name} ${row.class.section}`,
      })),
      invoices: student.invoices.map((invoice) => {
        const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPkr, 0);
        return {
          id: invoice.id,
          name: invoice.feePlan.name,
          amountPkr: invoice.amountPkr,
          paidPkr: paid,
          status: invoice.status,
          dueOn: invoice.dueOn,
          yearId: invoice.feePlan.yearId,
          receiptId: invoice.payments[0]?.id ?? null,
        };
      }),
      enrollments: student.enrollments.map((row) => ({
        class: { id: row.class.id, name: row.class.name, section: row.class.section },
      })),
    };
  }

  private fieldLabels(fields: unknown) {
    if (!Array.isArray(fields)) return {} as Record<string, string>;
    return Object.fromEntries(
      fields
        .filter((field): field is { key: string; label: string } => Boolean(field && typeof field === "object" && "key" in field && "label" in field))
        .map((field) => [String(field.key), String(field.label)]),
    );
  }

  private toListRow(student: {
    id: string;
    rollNo: string;
    admissionNo: string;
    firstName: string;
    lastName: string;
    status: string;
    extra?: unknown;
    enrollments: { class: { id: string; name: string; section: string } }[];
    guardians: { guardian: { name: string; phone?: string } }[];
    invoices: { status: string; amountPkr: number; payments: { amountPkr: number }[] }[];
    attendance: { status: string }[];
  }) {
    const presentLike = student.attendance.filter((row) => row.status === "PRESENT" || row.status === "LATE").length;
    const marked = student.attendance.length;
    let pending = 0;
    for (const invoice of student.invoices) {
      if (invoice.status === "VOID" || invoice.status === "DRAFT") continue;
      const paid = invoice.payments.reduce((sum, payment) => sum + payment.amountPkr, 0);
      pending += Math.max(invoice.amountPkr - paid, 0);
    }
    return {
      id: student.id,
      rollNo: student.rollNo || student.admissionNo,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      status: student.status,
      guardianName: student.guardians[0]?.guardian.name ?? "",
      phone: this.extraText(student.extra, "phone") || student.guardians[0]?.guardian.phone || "",
      address: this.extraText(student.extra, "address"),
      class: student.enrollments[0]?.class ?? null,
      attendancePct: marked ? Math.round((presentLike / marked) * 100) : 0,
      attendanceMarked: marked > 0,
      pendingFees: {
        status: pending > 0 ? "pending" : student.invoices.length ? "paid" : "none",
        amountPkr: pending,
      },
    };
  }
}
