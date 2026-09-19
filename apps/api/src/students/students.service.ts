import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  admitStudentSchema,
  classSortIndex,
  communicationCreateSchema,
  documentUploadSchema,
  examCreateSchema,
  examResultWriteSchema,
  guardianSchema,
  studentBulkSchema,
  studentDeactivateSchema,
  studentListQuerySchema,
  studentMoveSchema,
  studentSchema,
} from "@wellrun/shared";
import { Prisma } from "@prisma/client";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import type { SchoolScope } from "../common/school-scope";
import { nextSchoolNumber } from "../common/sequence";
import { saveDataUrl } from "../common/uploads";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StudentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(
    schoolId: string,
    query: Record<string, string | undefined>,
    classIds: string[] | null = null,
    scope: SchoolScope = {},
  ) {
    const filters = studentListQuerySchema.parse(query);
    const classId = filters.classId === "all" || !filters.classId ? undefined : filters.classId;

    if (classIds && classIds.length === 0) {
      return {
        items: [],
        total: 0,
        page: filters.page,
        pageSize: filters.pageSize,
        canMutate: false,
      };
    }

    const where: Prisma.StudentWhereInput = { schoolId };
    const campusId = filters.campusId || scope.campusId;
    if (campusId) where.campusId = campusId;
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
    if (filters.status && filters.status !== "all") where.status = filters.status;
    const enrollmentFilter: Prisma.EnrollmentWhereInput = { active: true };
    if (classId) enrollmentFilter.classId = classId;
    if (classIds) enrollmentFilter.classId = classId ? classId : { in: classIds };
    if (classId || classIds) where.enrollments = { some: enrollmentFilter };

    const students = await this.prisma.student.findMany({
      where,
      include: {
        campus: true,
        enrollments: { where: { active: true }, include: { class: true } },
        guardians: { include: { guardian: true } },
        invoices: { include: { payments: true } },
        attendance: {
          where: { date: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
        },
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
      canMutate: classIds === null,
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

  async byId(schoolId: string, id: string, classIds: string[] | null = null) {
    const student = await this.prisma.student.findFirst({
      where: { id, schoolId },
      include: {
        campus: true,
        enrollments: { include: { class: { include: { year: true, campus: true } } }, orderBy: { createdAt: "desc" } },
        guardians: { include: { guardian: true } },
        invoices: { include: { payments: true } },
        attendance: true,
        examResults: { include: { exam: true }, orderBy: { exam: { heldOn: "desc" } } },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    const enrolledClassIds = student.enrollments.map((row) => row.classId);
    if (classIds && !enrolledClassIds.some((classId) => classIds.includes(classId))) {
      throw new ForbiddenException("This student is not in your assigned class");
    }
    const extra = this.extraRecord(student.extra);
    const current = student.enrollments.find((row) => row.active) ?? student.enrollments[0] ?? null;
    const presentLike = student.attendance.filter((row) => row.status === "PRESENT" || row.status === "LATE").length;
    const marked = student.attendance.length;
    let feesDue = 0;
    for (const invoice of student.invoices) {
      if (invoice.status === "VOID" || invoice.status === "DRAFT") continue;
      feesDue += Math.max(invoice.amountPkr - invoice.payments.reduce((sum, payment) => sum + payment.amountPkr, 0), 0);
    }
    const latest = student.examResults[0];
    const enrollmentYears = new Set(student.enrollments.map((row) => row.class.yearId)).size;
    return {
      id: student.id,
      admissionNo: student.admissionNo,
      rollNo: current?.rollNo || student.rollNo || student.admissionNo,
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
      class: current
        ? { id: current.class.id, name: current.class.name, section: current.class.section, yearId: current.class.yearId }
        : null,
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
      details: [
        { label: "Class", value: current ? `${current.class.name} ${current.class.section}` : "" },
        { label: "Campus", value: student.campus?.name ?? "" },
        { label: "Gender", value: student.gender && student.gender !== "unspecified" ? student.gender : "" },
        { label: "Date of birth", value: student.dateOfBirth ? student.dateOfBirth.toISOString().slice(0, 10) : "" },
        { label: "Phone", value: extra.phone || student.guardians[0]?.guardian.phone || "" },
        { label: "Address", value: extra.address || "" },
        { label: "Admission no.", value: student.admissionNo },
        { label: "Admission date", value: student.admissionDate.toISOString().slice(0, 10) },
      ].filter((row) => row.value),
      metrics: {
        attendancePct: marked ? Math.round((presentLike / marked) * 100) : null,
        attendanceMarked: marked > 0,
        feesDue,
        latestExamPct: latest && latest.totalMarks ? Math.round((latest.obtainedMarks / latest.totalMarks) * 100) : null,
        enrollmentYears,
      },
      canMutate: classIds === null,
    };
  }

  async admit(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = admitStudentSchema.parse(body);
    if (data.studentId) {
      const cls = await this.resolveClass(schoolId, data.classId, data.className, data.section);
      await this.moveEnrollment(schoolId, data.studentId, cls.id, "returning");
      if (data.guardianId) {
        await this.prisma.studentGuardian.upsert({
          where: { studentId_guardianId: { studentId: data.studentId, guardianId: data.guardianId } },
          update: {},
          create: { studentId: data.studentId, guardianId: data.guardianId },
        });
      }
      await audit(this.prisma, {
        schoolId,
        actorId,
        action: "student_readmitted",
        entity: "student",
        entityId: data.studentId,
      });
      return this.byId(schoolId, data.studentId);
    }
    const cls = await this.resolveClass(schoolId, data.classId, data.className, data.section);
    const now = new Date();
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

    const student = await this.prisma.$transaction(async (tx) => {
      const admissionNo = await nextSchoolNumber(tx, schoolId, "ADM");
      const rollNo = await this.nextRollNoTx(tx, schoolId, cls.id);
      const created = await tx.student.create({
        data: {
          schoolId,
          campusId: cls.campusId,
          firstName: data.firstName!,
          lastName: data.lastName!,
          admissionNo,
          rollNo,
          gender: data.gender || "unspecified",
          dateOfBirth: new Date(data.dateOfBirth!),
          status: "active",
          admissionDate: now,
          firstAdmissionDate,
          extra: extra as Prisma.InputJsonValue,
        },
      });
      await tx.enrollment.create({
        data: {
          schoolId,
          studentId: created.id,
          classId: cls.id,
          active: true,
          rollNo,
          status: "active",
          studentType: "new",
        },
      });
      return created;
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
    const admissionNo = data.admissionNo || (await this.prisma.$transaction((tx) => nextSchoolNumber(tx, schoolId, "ADM")));
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
        rollNo: cls ? await this.prisma.$transaction((tx) => this.nextRollNoTx(tx, schoolId, cls.id)) : admissionNo,
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
        data: {
          schoolId,
          studentId: student.id,
          classId: cls.id,
          active: true,
          rollNo: student.rollNo,
          status: "active",
          studentType: "new",
        },
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
    const url = saveDataUrl(schoolId, `student-${id}`, dataUrl);
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
        extra: extra as Prisma.InputJsonValue,
      },
    });
    if (data.classId) {
      const cls = await this.prisma.class.findFirst({ where: { id: data.classId, schoolId } });
      if (!cls) throw new BadRequestException("Class not found");
      await this.moveEnrollment(schoolId, id, cls.id, "active");
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
          extra: (data.extra ?? existing.extra ?? {}) as Prisma.InputJsonValue,
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
        extra: (data.extra ?? {}) as Prisma.InputJsonValue,
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

  private async nextRollNoTx(tx: Prisma.TransactionClient, schoolId: string, classId: string) {
    const enrolled = await tx.enrollment.findMany({
      where: { schoolId, classId, active: true },
      select: { rollNo: true },
    });
    const used = enrolled.map((row) => Number.parseInt(row.rollNo, 10)).filter((value) => Number.isFinite(value));
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
    campus?: { id: string; name: string } | null;
    enrollments: { rollNo?: string; class: { id: string; name: string; section: string } }[];
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
      rollNo: student.enrollments[0]?.rollNo || student.rollNo || student.admissionNo,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      status: student.status,
      photo: this.extraText(student.extra, "photo"),
      guardianName: student.guardians[0]?.guardian.name ?? "",
      phone: this.extraText(student.extra, "phone") || student.guardians[0]?.guardian.phone || "",
      address: this.extraText(student.extra, "address"),
      campus: student.campus ?? null,
      class: student.enrollments[0]?.class ?? null,
      attendancePct: marked ? Math.round((presentLike / marked) * 100) : 0,
      attendanceMarked: marked > 0,
      pendingFees: {
        status: pending > 0 ? "pending" : student.invoices.length ? "paid" : "none",
        amountPkr: pending,
      },
    };
  }

  async enrollments(schoolId: string, id: string, classIds: string[] | null = null) {
    await this.byId(schoolId, id, classIds);
    const rows = await this.prisma.enrollment.findMany({
      where: { schoolId, studentId: id },
      include: { class: { include: { year: true, campus: true } } },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      active: row.active,
      rollNo: row.rollNo,
      status: row.status,
      studentType: row.studentType,
      endedAt: row.endedAt,
      createdAt: row.createdAt,
      class: {
        id: row.class.id,
        name: row.class.name,
        section: row.class.section,
        yearName: row.class.year.name,
        campusName: row.class.campus?.name ?? "",
      },
    }));
  }

  async attendanceTab(schoolId: string, id: string, classIds: string[] | null = null) {
    await this.byId(schoolId, id, classIds);
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { schoolId, studentId: id },
      include: { class: true },
      orderBy: { date: "desc" },
    });
    return rows.map((row) => ({
      id: row.id,
      date: row.date,
      status: row.status,
      className: `${row.class.name} ${row.class.section}`,
    }));
  }

  async feesTab(schoolId: string, id: string, classIds: string[] | null = null) {
    await this.byId(schoolId, id, classIds);
    const invoices = await this.prisma.invoice.findMany({
      where: { schoolId, studentId: id },
      include: { payments: true, feePlan: { include: { year: true } } },
      orderBy: { dueOn: "desc" },
    });
    return invoices.map((invoice) => {
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
    });
  }

  async resultsTab(schoolId: string, id: string, classIds: string[] | null = null) {
    await this.byId(schoolId, id, classIds);
    const rows = await this.prisma.examResult.findMany({
      where: { studentId: id },
      include: { exam: { include: { year: true } } },
      orderBy: { exam: { heldOn: "desc" } },
    });
    return rows.map((row) => ({
      id: row.id,
      examId: row.examId,
      name: row.exam.name,
      subject: row.subject,
      heldOn: row.exam.heldOn,
      yearId: row.exam.yearId || row.exam.year?.id || "",
      totalMarks: row.totalMarks,
      obtainedMarks: row.obtainedMarks,
      pct: row.totalMarks > 0 ? Math.round((row.obtainedMarks / row.totalMarks) * 100) : 0,
    }));
  }

  async documentsTab(schoolId: string, id: string, classIds: string[] | null = null) {
    await this.byId(schoolId, id, classIds);
    return this.prisma.schoolDocument.findMany({
      where: { schoolId, ownerType: "student", ownerId: id },
      orderBy: { createdAt: "asc" },
    });
  }

  async familyTab(schoolId: string, id: string, classIds: string[] | null = null) {
    await this.byId(schoolId, id, classIds);
    const student = await this.prisma.student.findFirst({
      where: { id, schoolId },
      include: {
        guardians: {
          include: {
            guardian: {
              include: {
                students: {
                  include: {
                    student: { include: { enrollments: { where: { active: true }, include: { class: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
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
    return {
      guardians: student.guardians.map((link) => ({
        id: link.guardian.id,
        name: link.guardian.name,
        phone: link.guardian.phone,
        cnic: link.guardian.cnic,
        email: link.guardian.email,
        relation: link.guardian.relation,
        occupation: link.guardian.occupation,
      })),
      siblings: [...siblings.values()],
    };
  }

  async activityTab(schoolId: string, id: string, classIds: string[] | null = null) {
    await this.byId(schoolId, id, classIds);
    return this.prisma.auditLog.findMany({
      where: { schoolId, entity: { in: ["student", "admission"] }, entityId: id },
      include: { actor: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async communicationsTab(schoolId: string, id: string, classIds: string[] | null = null) {
    await this.byId(schoolId, id, classIds);
    return this.prisma.communicationLog.findMany({
      where: { schoolId, studentId: id },
      include: { sentBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async addCommunication(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    await this.byId(schoolId, id);
    const data = communicationCreateSchema.parse(body);
    return this.prisma.communicationLog.create({
      data: {
        schoolId,
        studentId: id,
        type: data.type,
        subject: data.subject ?? "",
        body: data.body,
        recipient: data.recipient ?? "",
        sentById: actorId,
        status: "logged",
      },
    });
  }

  async uploadStudentDocument(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    await this.byId(schoolId, id);
    const data = documentUploadSchema.parse(body);
    const url = saveDataUrl(schoolId, `student-doc-${id}-${data.kind}`, data.dataUrl);
    return this.prisma.schoolDocument.create({
      data: {
        schoolId,
        ownerType: "student",
        ownerId: id,
        kind: data.kind,
        label: data.label,
        required: data.required ?? false,
        url,
        uploadedBy: actorId,
      },
    });
  }

  async promote(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = studentMoveSchema.parse(body);
    await this.byId(schoolId, id);
    await this.moveEnrollment(schoolId, id, data.classId, "completed");
    await audit(this.prisma, { schoolId, actorId, action: "student_promoted", entity: "student", entityId: id });
    return this.byId(schoolId, id);
  }

  async transfer(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = studentMoveSchema.parse(body);
    await this.byId(schoolId, id);
    await this.moveEnrollment(schoolId, id, data.classId, "transferred");
    await audit(this.prisma, { schoolId, actorId, action: "student_transferred", entity: "student", entityId: id });
    return this.byId(schoolId, id);
  }

  async deactivate(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    studentDeactivateSchema.parse(body ?? {});
    await this.byId(schoolId, id);
    await this.prisma.enrollment.updateMany({
      where: { studentId: id, active: true },
      data: { active: false, status: "completed", endedAt: new Date() },
    });
    await this.prisma.student.update({ where: { id }, data: { status: "inactive" } });
    await audit(this.prisma, { schoolId, actorId, action: "student_deactivated", entity: "student", entityId: id });
    return this.byId(schoolId, id);
  }

  async bulk(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = studentBulkSchema.parse(body);
    if (data.action === "export") return { ids: data.ids, action: "export" };
    for (const id of data.ids) {
      if (data.action === "deactivate") await this.deactivate(schoolId, actorId, id, {});
      else if (data.action === "assign_class" || data.action === "promote" || data.action === "transfer") {
        if (!data.classId) throw new BadRequestException("Choose a class");
        if (data.action === "promote") await this.promote(schoolId, actorId, id, { classId: data.classId });
        else if (data.action === "transfer") await this.transfer(schoolId, actorId, id, { classId: data.classId });
        else await this.moveEnrollment(schoolId, id, data.classId, "active");
      }
    }
    return { updated: data.ids.length, action: data.action };
  }

  async createExam(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = examCreateSchema.parse(body);
    const exam = await this.prisma.exam.create({
      data: {
        schoolId,
        name: data.name,
        heldOn: new Date(data.heldOn),
        yearId: data.yearId,
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "exam_created", entity: "exam", entityId: exam.id });
    return exam;
  }

  async writeExamResult(schoolId: string, actorId: string, examId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = examResultWriteSchema.parse(body);
    const exam = await this.prisma.exam.findFirst({ where: { id: examId, schoolId } });
    if (!exam) throw new NotFoundException("Exam not found");
    await this.byId(schoolId, data.studentId);
    const result = await this.prisma.examResult.upsert({
      where: { examId_studentId_subject: { examId, studentId: data.studentId, subject: data.subject || "" } },
      update: { totalMarks: data.totalMarks, obtainedMarks: data.obtainedMarks },
      create: {
        examId,
        studentId: data.studentId,
        subject: data.subject || "",
        totalMarks: data.totalMarks,
        obtainedMarks: data.obtainedMarks,
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "exam_result_saved", entity: "student", entityId: data.studentId });
    return result;
  }

  async exams(schoolId: string) {
    return this.prisma.exam.findMany({
      where: { schoolId },
      orderBy: { heldOn: "desc" },
      include: { _count: { select: { results: true } } },
    });
  }

  private async moveEnrollment(schoolId: string, studentId: string, classId: string, previousStatus: string) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new BadRequestException("Class not found");
    await this.prisma.enrollment.updateMany({
      where: { studentId, active: true },
      data: { active: false, status: previousStatus, endedAt: new Date() },
    });
    const rollNo = await this.prisma.$transaction((tx) => this.nextRollNoTx(tx, schoolId, cls.id));
    await this.prisma.enrollment.create({
      data: {
        schoolId,
        studentId,
        classId: cls.id,
        active: true,
        rollNo,
        status: "active",
        studentType: previousStatus === "transferred" ? "transfer" : "returning",
      },
    });
    await this.prisma.student.update({
      where: { id: studentId },
      data: { rollNo, campusId: cls.campusId, status: "active" },
    });
  }
}
