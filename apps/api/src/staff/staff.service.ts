import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { inviteSchema, staffSchema } from "@wellrun/shared";
import { randomBytes } from "crypto";
import { audit } from "../common/audit";
import { assertWritableSchool } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StaffService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(schoolId: string) {
    return this.prisma.staff.findMany({
      where: { schoolId },
      include: { assignments: { include: { class: true } } },
      orderBy: { name: "asc" },
    });
  }

  async create(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = staffSchema.parse(body);
    const staff = await this.prisma.staff.create({
      data: {
        schoolId,
        name: data.name,
        title: data.title,
        email: data.email || null,
        phone: data.phone ?? "",
        subjects: data.subject ? [data.subject] : [],
      },
    });
    if (data.classId) {
      await this.prisma.teacherAssignment.create({
        data: {
          schoolId,
          staffId: staff.id,
          classId: data.classId,
          subject: data.subject ?? "",
        },
      });
    }
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "staff_created",
      entity: "staff",
      entityId: staff.id,
    });
    return this.prisma.staff.findUnique({
      where: { id: staff.id },
      include: { assignments: { include: { class: true } } },
    });
  }

  async assign(schoolId: string, actorId: string, staffId: string, classId: string, subject = "") {
    await assertWritableSchool(this.prisma, schoolId);
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId } });
    if (!staff) throw new NotFoundException("Teacher not found");
    const cls = await this.prisma.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new NotFoundException("Class not found");
    const row = await this.prisma.teacherAssignment.upsert({
      where: { staffId_classId_subject: { staffId, classId, subject } },
      update: {},
      create: { schoolId, staffId, classId, subject },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "teacher_assigned",
      entity: "assignment",
      entityId: row.id,
    });
    return row;
  }

  invites(schoolId: string) {
    return this.prisma.invite.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
    });
  }

  async invite(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = inviteSchema.parse(body);
    const email = data.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing?.role === "PLATFORM_ADMIN") {
      throw new BadRequestException("This email cannot be invited.");
    }
    if (existing?.schoolId && existing.schoolId !== schoolId && existing.role !== "PARENT") {
      throw new BadRequestException("This email already belongs to another school.");
    }
    const token = randomBytes(24).toString("hex");
    const invite = await this.prisma.invite.create({
      data: {
        schoolId,
        email,
        role: data.role,
        token,
        inviterId: actorId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    if (data.role === "TEACHER") {
      const staff = await this.prisma.staff.findFirst({ where: { schoolId, email } });
      if (!staff) {
        await this.prisma.staff.create({
          data: {
            schoolId,
            name: data.name?.trim() || email.split("@")[0],
            title: "Teacher",
            email,
          },
        });
      }
    }
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "invite_created",
      entity: "invite",
      entityId: invite.id,
      summary: `${data.role} ${email}`,
    });
    const acceptPath = `/invite?token=${token}`;
    console.log(`Invite for ${email}: http://localhost:5173${acceptPath}`);
    return { ...invite, acceptUrl: `http://localhost:5173${acceptPath}` };
  }
}
