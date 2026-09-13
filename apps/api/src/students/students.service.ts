import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { guardianSchema, studentSchema } from "@wellrun/shared";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StudentsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(schoolId: string, status = "active") {
    return this.prisma.student.findMany({
      where: { schoolId, status: status === "all" ? undefined : status },
      include: {
        enrollments: { where: { active: true }, include: { class: true } },
        guardians: { include: { guardian: true } },
        invoices: { include: { payments: true, feePlan: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
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
      },
    });
    if (!student) throw new NotFoundException("Student not found");
    return student;
  }

  async create(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = studentSchema.parse(body);
    const existing = await this.prisma.student.findFirst({
      where: { schoolId, admissionNo: data.admissionNo },
    });
    if (existing) throw new BadRequestException("Admission number already exists");
    const student = await this.prisma.student.create({
      data: {
        schoolId,
        firstName: data.firstName,
        lastName: data.lastName,
        admissionNo: data.admissionNo,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth ? new Date(data.dateOfBirth) : undefined,
        status: data.status,
      },
    });
    if (data.classId) {
      await this.prisma.enrollment.create({
        data: { schoolId, studentId: student.id, classId: data.classId, active: true },
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
    const guardian = await this.prisma.guardian.create({
      data: {
        schoolId,
        name: data.name,
        phone: data.phone,
        email: data.email || null,
        relation: data.relation,
      },
    });
    await this.prisma.studentGuardian.create({
      data: { studentId, guardianId: guardian.id },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "guardian_linked",
      entity: "guardian",
      entityId: guardian.id,
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
      },
    });
    if (data.classId) {
      await this.prisma.enrollment.updateMany({ where: { studentId: id, active: true }, data: { active: false } });
      await this.prisma.enrollment.create({
        data: { schoolId, studentId: id, classId: data.classId, active: true },
      });
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
}
