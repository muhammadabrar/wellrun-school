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
    const student = await this.prisma.student.findFirst({
      where: { id, schoolId },
      include: {
        enrollments: { include: { class: true } },
        guardians: { include: { guardian: true } },
        invoices: { include: { payments: true, feePlan: true }, orderBy: { dueOn: "desc" } },
        attendance: { orderBy: { date: "desc" }, take: 20 },
        campus: true,
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    return student;
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

  async update(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    await this.byId(schoolId, id);
    const data = studentSchema.partial().parse(body);
    await this.prisma.student.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        admissionNo: data.admissionNo,
        gender: data.gender,
        status: data.status,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        extra:
          data.extra || data.phone || data.address
            ? {
                ...(data.extra ?? {}),
                ...(data.phone ? { phone: data.phone } : {}),
                ...(data.address ? { address: data.address } : {}),
              }
            : undefined,
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

  private extraText(extra: unknown, key: string) {
    if (!extra || typeof extra !== "object") return "";
    const value = (extra as Record<string, unknown>)[key];
    return typeof value === "string" ? value : "";
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
