import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import {
  admitStudentSchema,
  classSortIndex,
  communicationCreateSchema,
  documentUploadSchema,
  guardianSchema,
  studentBulkSchema,
  studentDeactivateSchema,
  studentListQuerySchema,
  studentMoveSchema,
  studentSchema,
  type AttendanceSettingsView,
} from "@wellrun/shared";
import { Prisma } from "@prisma/client";
import { audit } from "../common/audit";
import { createGuardian, findOrCreateGuardian, type GuardianInput } from "../common/guardians";
import { titleCaseName } from "../common/text";
import { invoiceLabel } from "../fees/billing";
import { ensureStudentFeeAssignment, FeeAssignmentService } from "../fees/assignment.service";
import { invoiceViewInclude, toInvoiceView } from "../fees/invoice-view";
import { currentBillingPeriod } from "../fees/json";
import { assertWritableSchool } from "../common/school";
import { assertClassWritable, assertYearOpen } from "../common/year-lock";
import type { SchoolScope } from "../common/school-scope";
import { karachiToday } from "../common/date";
import { nextSchoolNumber } from "../common/sequence";
import { saveDataUrl } from "../common/uploads";
import { PrismaService } from "../prisma/prisma.service";
import { AttendanceReportsService } from "../attendance/reports.service";
import { loadSettings, pctOf } from "../attendance/rules";

@Injectable()
export class StudentsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeeAssignmentService) private readonly feeAssignments: FeeAssignmentService,
    @Inject(AttendanceReportsService) private readonly attendanceReports: AttendanceReportsService,
  ) {}

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
    const className = filters.className === "all" || !filters.className ? undefined : filters.className;
    const section = filters.section === "all" || !filters.section ? undefined : filters.section;
    if (classId) enrollmentFilter.classId = classId;
    if (classIds) enrollmentFilter.classId = classId ? classId : { in: classIds };
    if (className || section) {
      enrollmentFilter.class = {
        ...(className ? { name: className } : {}),
        ...(section ? { section } : {}),
      };
    }
    if (classId || classIds || className || section) where.enrollments = { some: enrollmentFilter };

    const students = await this.prisma.student.findMany({
      where,
      include: {
        campus: true,
        enrollments: { where: { active: true }, include: { class: true } },
        guardians: { include: { guardian: true } },
        invoices: { include: { payments: true } },
        attendance: {
          where: { date: { gte: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) } },
          select: { status: true, date: true },
        },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });

    const attendanceSettings = await loadSettings(this.prisma, schoolId);
    let rows = students.map((student) => this.toListRow(student, attendanceSettings));
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
    const query = q?.trim() ?? "";
    if (query && query.length < 3) return [];
    const rows = await this.prisma.guardian.findMany({
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
      select: {
        id: true,
        name: true,
        phone: true,
        cnic: true,
        email: true,
        relation: true,
        occupation: true,
        students: { select: { student: { select: { id: true, firstName: true, lastName: true } } } },
      },
      orderBy: { name: "asc" },
      take: 40,
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      cnic: row.cnic,
      email: row.email,
      relation: row.relation,
      occupation: row.occupation,
      students: row.students.map((link) => link.student),
      _count: { students: row.students.length },
    }));
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
        results: { where: { scope: "EXAM", exam: { kind: "EXAM" } }, orderBy: { computedAt: "desc" }, take: 1, select: { percentage: true, grade: true, rank: true } },
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    const enrolledClassIds = student.enrollments.map((row) => row.classId);
    if (classIds && !enrolledClassIds.some((classId) => classIds.includes(classId))) {
      throw new ForbiddenException("This student is not in your assigned class");
    }
    const extra = this.extraRecord(student.extra);
    const current = student.enrollments.find((row) => row.active) ?? student.enrollments[0] ?? null;
    const attendancePct = pctOf(student.attendance.map((row) => row.status), await loadSettings(this.prisma, schoolId));
    const marked = student.attendance.length;
    const today = karachiToday();
    const todayAttendance =
      student.attendance.find((row) => this.attendanceDay(row.date) === today)?.status ?? null;
    let feesDue = 0;
    for (const invoice of student.invoices) {
      if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") continue;
      const paid = invoice.paidAmountPkr || invoice.payments.filter((payment) => payment.status !== "VOIDED" && payment.status !== "REFUNDED").reduce((sum, payment) => sum + payment.amountPkr, 0);
      feesDue += invoice.balanceAmountPkr || Math.max(invoice.amountPkr - paid, 0);
    }
    const latest = student.results[0];
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
      todayAttendance,
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
        attendancePct: attendancePct === null ? null : Math.round(attendancePct),
        attendanceMarked: marked > 0,
        feesDue,
        latestExamPct: latest ? Math.round(latest.percentage) : null,
        latestGrade: latest?.grade ?? null,
        latestRank: latest?.rank ?? null,
        enrollmentYears,
      },
      canMutate: classIds === null,
    };
  }

  async admit(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = admitStudentSchema.parse(body);
    if (data.firstName) data.firstName = titleCaseName(data.firstName);
    if (data.lastName) data.lastName = titleCaseName(data.lastName);
    if (data.guardian?.name) data.guardian.name = titleCaseName(data.guardian.name);
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
    // No guardianId means the admin chose "New guardian": always a new record, never a phone match.
    const guardianId = data.guardianId
      ? data.guardianId
      : await this.createGuardian(schoolId, actorId, {
          ...data.guardian!,
          extra: data.guardianExtra ?? data.guardian?.extra,
        });
    const guardian = await this.prisma.guardian.findFirst({ where: { id: guardianId, schoolId } });
    if (!guardian) throw new BadRequestException("Guardian not found");
    await this.prisma.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id } });
    await ensureStudentFeeAssignment(this.prisma, {
      schoolId,
      studentId: student.id,
      className: cls.name,
      section: cls.section,
      campusId: cls.campusId,
      academicYearId: cls.yearId,
    });
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
    data.firstName = titleCaseName(data.firstName);
    data.lastName = titleCaseName(data.lastName);
    const admissionNo = data.admissionNo || (await this.prisma.$transaction((tx) => nextSchoolNumber(tx, schoolId, "ADM")));
    const existing = await this.prisma.student.findFirst({ where: { schoolId, admissionNo } });
    if (existing) throw new BadRequestException("Admission number already exists");
    const cls = data.classId ? await this.prisma.class.findFirst({ where: { id: data.classId, schoolId } }) : null;
    if (cls) await assertClassWritable(this.prisma, schoolId, cls.id);
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
    data.name = titleCaseName(data.name);
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
    if (!/^data:image\/(jpeg|jpg|png|webp)/i.test(dataUrl)) {
      throw new BadRequestException("Upload a JPG, PNG, or WebP image");
    }
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
    const raw = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const data = studentSchema.partial().parse(body);
    if (data.firstName) data.firstName = titleCaseName(data.firstName);
    if (data.lastName) data.lastName = titleCaseName(data.lastName);
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
        status: "status" in raw ? data.status : undefined,
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

  private async findOrCreateGuardian(schoolId: string, actorId: string, data: GuardianInput) {
    return (await findOrCreateGuardian(this.prisma, schoolId, actorId, data)).id;
  }

  /** "New guardian" in the admit flow: a phone or CNIC that already exists is an error, not a silent reuse. */
  private async createGuardian(schoolId: string, actorId: string, data: GuardianInput) {
    return (await createGuardian(this.prisma, schoolId, actorId, data)).id;
  }

  private async resolveClass(schoolId: string, classId: string | undefined, className: string, section: string) {
    if (classId) {
      const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, include: { year: { select: { name: true, status: true } } } });
      if (!cls) throw new BadRequestException("Class not found");
      assertYearOpen(cls.year);
      return cls;
    }
    // By name: the current year first, never a closed one.
    const cls = await this.prisma.class.findFirst({
      where: { schoolId, name: className, section, year: { status: { not: "CLOSED" } } },
      orderBy: { year: { current: "desc" } },
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

  /** Students scoring 80%+ in the latest exam that has results. */
  private async topScorerIds(schoolId: string) {
    const exam = await this.prisma.exam.findFirst({
      where: { schoolId, kind: "EXAM", results: { some: {} } },
      orderBy: { startsOn: "desc" },
      select: { results: { where: { scope: "EXAM", percentage: { gte: 80 } }, select: { studentId: true } } },
    });
    return new Set((exam?.results ?? []).map((row) => row.studentId));
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

  private attendanceDay(value: Date | string) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
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
          cnic: string | null;
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
        paidAmountPkr?: number;
        balanceAmountPkr?: number;
        academicYearId?: string | null;
        status: string;
        dueOn: Date;
        feePlan: { name: string; yearId: string; year: { id: string; name: string } } | null;
        items?: { description: string }[];
        payments: { id: string; amountPkr: number; status?: string }[];
      }[];
      attendance: { id: string; date: Date; status: string; class: { name: string; section: string } }[];
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
      attendance: student.attendance.map((row) => ({
        id: row.id,
        date: row.date,
        status: row.status,
        className: `${row.class.name} ${row.class.section}`,
      })),
      invoices: student.invoices.map((invoice) => {
        const paid =
          invoice.paidAmountPkr ||
          invoice.payments
            .filter((payment) => payment.status !== "VOIDED" && payment.status !== "REFUNDED")
            .reduce((sum, payment) => sum + payment.amountPkr, 0);
        return {
          id: invoice.id,
          name: invoiceLabel(invoice),
          amountPkr: invoice.amountPkr,
          paidPkr: paid,
          status: invoice.status,
          dueOn: invoice.dueOn,
          yearId: invoice.feePlan?.yearId ?? invoice.academicYearId ?? "",
          receiptId: invoice.payments.find((payment) => payment.status !== "VOIDED" && payment.status !== "REFUNDED")?.id ?? invoice.payments[0]?.id ?? null,
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
    invoices: { status: string; amountPkr: number; paidAmountPkr?: number; balanceAmountPkr?: number; payments: { amountPkr: number; status?: string }[] }[];
    attendance: { status: string; date: Date }[];
  }, attendanceSettings: AttendanceSettingsView) {
    const attendancePct = pctOf(student.attendance.map((row) => row.status), attendanceSettings);
    const marked = student.attendance.length;
    const today = karachiToday();
    const todayAttendance = student.attendance.find((row) => this.attendanceDay(row.date) === today)?.status ?? null;
    let pending = 0;
    for (const invoice of student.invoices) {
      if (invoice.status === "CANCELLED" || invoice.status === "DRAFT") continue;
      const paid =
        invoice.paidAmountPkr ||
        invoice.payments
          .filter((payment) => payment.status !== "VOIDED" && payment.status !== "REFUNDED")
          .reduce((sum, payment) => sum + payment.amountPkr, 0);
      pending += invoice.balanceAmountPkr || Math.max(invoice.amountPkr - paid, 0);
    }
    return {
      id: student.id,
      rollNo: student.enrollments[0]?.rollNo || student.rollNo || student.admissionNo,
      admissionNo: student.admissionNo,
      firstName: student.firstName,
      lastName: student.lastName,
      status: student.status,
      guardianName: student.guardians[0]?.guardian.name ?? "",
      phone: this.extraText(student.extra, "phone") || student.guardians[0]?.guardian.phone || "",
      address: this.extraText(student.extra, "address"),
      campus: student.campus ?? null,
      class: student.enrollments[0]?.class ?? null,
      attendancePct: attendancePct === null ? 0 : Math.round(attendancePct),
      attendanceMarked: marked > 0,
      todayAttendance,
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

  async attendanceTab(schoolId: string, id: string, classIds: string[] | null = null, scope: SchoolScope = {}) {
    await this.byId(schoolId, id, classIds);
    return this.attendanceReports.student(schoolId, id, scope);
  }

  async feesTab(schoolId: string, id: string, classIds: string[] | null = null) {
    await this.byId(schoolId, id, classIds);
    const [invoices, payments, credits, assignment, currentYear] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { schoolId, studentId: id, status: { not: "DRAFT" } },
        include: invoiceViewInclude,
        orderBy: [{ dueOn: "desc" }, { createdAt: "desc" }],
      }),
      this.prisma.payment.findMany({
        where: { schoolId, studentId: id, method: { not: "credit" } },
        include: { receipt: { select: { id: true, receiptNumber: true } } },
        orderBy: { paidAt: "desc" },
      }),
      this.prisma.studentCredit.findMany({
        where: { schoolId, studentId: id, remainingAmountPkr: { gt: 0 } },
        select: { id: true, amountPkr: true, remainingAmountPkr: true, reason: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      // After a rollover a student has one assignment per year; the newest one is the one that bills.
      this.prisma.studentFeeAssignment.findFirst({
        where: { schoolId, studentId: id, status: "ACTIVE" },
        orderBy: { effectiveFrom: "desc" },
        select: { academicYearId: true, structure: { select: { id: true, name: true } }, _count: { select: { overrides: true } } },
      }),
      this.prisma.academicYear.findFirst({ where: { schoolId, current: true }, select: { startsOn: true } }),
    ]);
    const views = invoices.map(toInvoiceView);
    const open = views.filter((row) => ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(row.status));
    const earlierYearIds = currentYear
      ? new Set(
          (await this.prisma.academicYear.findMany({ where: { schoolId, startsOn: { lt: currentYear.startsOn } }, select: { id: true } })).map((y) => y.id),
        )
      : new Set<string>();
    const fromEarlierYear = new Set(invoices.filter((row) => row.academicYearId && earlierYearIds.has(row.academicYearId)).map((row) => row.id));
    const period = currentBillingPeriod();
    const currentInvoice =
      views.find((row) => row.billingPeriod === period && row.status !== "CANCELLED") ??
      views.find((row) => row.kind === "monthly" && row.status !== "CANCELLED") ??
      null;
    return {
      outstandingPkr: open.reduce((sum, row) => sum + row.balancePkr, 0),
      overduePkr: open.filter((row) => row.status === "OVERDUE").reduce((sum, row) => sum + row.balancePkr, 0),
      /** Part of outstandingPkr carried over from earlier academic years. */
      previousYearsPkr: open.filter((row) => fromEarlierYear.has(row.id)).reduce((sum, row) => sum + row.balancePkr, 0),
      creditPkr: credits.reduce((sum, row) => sum + row.remainingAmountPkr, 0),
      currentInvoice,
      invoices: views,
      payments: payments.map((row) => ({
        id: row.id,
        paymentNumber: row.paymentNumber,
        paymentDate: row.paymentDate,
        amountPkr: row.amountPkr,
        method: row.method,
        referenceNumber: row.referenceNumber,
        status: row.status,
        receiptId: row.receipt?.id ?? null,
        receiptNumber: row.receipt?.receiptNumber ?? null,
      })),
      credits,
      assignment: assignment
        ? { academicYearId: assignment.academicYearId, structureName: assignment.structure.name, hasCustomFees: assignment._count.overrides > 0 }
        : null,
    };
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
    // Has each guardian signed in to the parent portal yet? The school sees this so it knows who to remind.
    const parents = await this.prisma.parentUser.findMany({
      where: { phoneNorm: { in: student.guardians.map((link) => link.guardian.phoneNorm) } },
      select: { phoneNorm: true, lastSeenAt: true },
    });
    const seen = new Map(parents.map((row) => [row.phoneNorm, row.lastSeenAt]));
    return {
      guardians: student.guardians.map((link) => ({
        id: link.guardian.id,
        name: link.guardian.name,
        phone: link.guardian.phone,
        cnic: link.guardian.cnic,
        email: link.guardian.email,
        relation: link.guardian.relation,
        occupation: link.guardian.occupation,
        parentLogin: {
          activated: seen.has(link.guardian.phoneNorm),
          lastSeenAt: seen.get(link.guardian.phoneNorm)?.toISOString() ?? null,
        },
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
    const cls = await this.moveEnrollment(schoolId, id, data.classId, "completed");
    if (data.feeStructureId) await this.updateFeeStructureFor(schoolId, actorId, id, cls.yearId, data.feeStructureId);
    await audit(this.prisma, { schoolId, actorId, action: "student_promoted", entity: "student", entityId: id });
    return this.byId(schoolId, id);
  }

  async transfer(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = studentMoveSchema.parse(body);
    await this.byId(schoolId, id);
    const cls = await this.moveEnrollment(schoolId, id, data.classId, "transferred");
    if (data.feeStructureId) await this.updateFeeStructureFor(schoolId, actorId, id, cls.yearId, data.feeStructureId);
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
        if (data.action === "promote") {
          await this.promote(schoolId, actorId, id, { classId: data.classId, feeStructureId: data.feeStructureId });
        } else if (data.action === "transfer") {
          await this.transfer(schoolId, actorId, id, { classId: data.classId, feeStructureId: data.feeStructureId });
        } else await this.moveEnrollment(schoolId, id, data.classId, "active");
      }
    }
    return { updated: data.ids.length, action: data.action };
  }

  private async moveEnrollment(schoolId: string, studentId: string, classId: string, previousStatus: string) {
    const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId }, include: { year: { select: { name: true, status: true } } } });
    if (!cls) throw new BadRequestException("Class not found");
    // The target year must be open; ending the old enrollment in a closed year is fine (that's how students leave it).
    assertYearOpen(cls.year);
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
    return cls;
  }

  /** Re-points a student's active fee assignment to a new structure, e.g. after a promotion changes their class. Reuses FeeAssignmentService.assign(), which already ends the prior assignment. */
  private async updateFeeStructureFor(schoolId: string, actorId: string, studentId: string, academicYearId: string, feeStructureId: string) {
    await this.feeAssignments.assign(schoolId, actorId, { studentId, academicYearId, feeStructureId });
  }
}
