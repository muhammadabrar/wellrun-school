import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, StaffStatus } from "@prisma/client";
import {
  cnicPattern,
  inviteSchema,
  staffAccountSchema,
  staffContractSchema,
  staffCreateSchema,
  staffStatusSchema,
  staffUpdateSchema,
} from "@wellrun/shared";
import * as bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { audit } from "../common/audit";
import { dateOnly } from "../common/date";
import { assertWritableSchool } from "../common/school";
import { assertClassWritable } from "../common/year-lock";
import { PrismaService } from "../prisma/prisma.service";

/** Statuses that keep a login working. Everyone else is signed out and can't sign in. */
const CAN_SIGN_IN: StaffStatus[] = ["ACTIVE", "ON_LEAVE"];
/** Statuses that end employment: their timetable periods are freed for someone else. */
const LEFT: StaffStatus[] = ["RESIGNED", "TERMINATED"];

type PayLine = { label: string; amountPkr: number };

function optionalDate(value?: string) {
  return value ? dateOnly(value) : null;
}

export function payLines(value: unknown): PayLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row): row is { label: unknown; amountPkr: unknown } => typeof row === "object" && row !== null)
    .map((row) => ({ label: String(row.label ?? ""), amountPkr: Math.max(0, Math.round(Number(row.amountPkr) || 0)) }))
    .filter((row) => row.label);
}

/** The contract in force today, else the most recent one. */
export function currentContract<T extends { startDate: Date; endDate: Date | null }>(contracts: T[], on = new Date()) {
  const sorted = [...contracts].sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  return sorted.find((row) => row.startDate <= on && (!row.endDate || row.endDate >= on)) ?? sorted[0] ?? null;
}

@Injectable()
export class StaffService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(schoolId: string, query: { status?: string; q?: string } = {}) {
    const q = query.q?.trim();
    const rows = await this.prisma.staff.findMany({
      where: {
        schoolId,
        status: query.status && query.status !== "all" ? (query.status as StaffStatus) : undefined,
        OR: q
          ? [
              { name: { contains: q, mode: "insensitive" } },
              { employeeNo: { contains: q, mode: "insensitive" } },
              { cnic: { contains: q } },
              { phone: { contains: q } },
              { email: { contains: q, mode: "insensitive" } },
            ]
          : undefined,
      },
      select: {
        id: true,
        employeeNo: true,
        name: true,
        cnic: true,
        title: true,
        department: true,
        status: true,
        phone: true,
        email: true,
        joinDate: true,
        campus: { select: { id: true, name: true } },
        user: { select: { role: true, disabled: true } },
        contracts: { select: { type: true, startDate: true, endDate: true, basicSalaryPkr: true } },
        assignments: { select: { id: true, subject: true, class: { select: { id: true, name: true, section: true } } } },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });
    return rows.map(({ contracts, user, ...row }) => {
      const contract = currentContract(contracts);
      return {
        ...row,
        login: user ? { role: user.role, disabled: user.disabled } : null,
        contract: contract ? { type: contract.type, basicSalaryPkr: contract.basicSalaryPkr, endDate: contract.endDate } : null,
      };
    });
  }

  async detail(schoolId: string, id: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { id, schoolId },
      include: {
        campus: { select: { id: true, name: true } },
        user: { select: { email: true, role: true, disabled: true } },
        contracts: { orderBy: { startDate: "desc" } },
        statusChanges: { orderBy: { createdAt: "desc" } },
        assignments: { select: { id: true, subject: true, class: { select: { id: true, name: true, section: true } } } },
        payslips: {
          select: { id: true, period: true, payslipNo: true, netPkr: true, status: true, paidOn: true },
          orderBy: { period: "desc" },
          take: 24,
        },
      },
    });
    if (!staff) throw new NotFoundException("Staff member not found");
    const actorIds = [...new Set(staff.statusChanges.map((row) => row.actorId).filter((value): value is string => Boolean(value)))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })
      : [];
    const actorName = new Map(actors.map((row) => [row.id, row.name]));
    const { user, contracts, statusChanges, subjects, ...rest } = staff;
    return {
      ...rest,
      subjects: Array.isArray(subjects) ? subjects.filter((value): value is string => typeof value === "string") : [],
      login: user,
      contracts: contracts.map((row) => ({ ...row, allowances: payLines(row.allowances) })),
      currentContractId: currentContract(contracts)?.id ?? null,
      statusChanges: statusChanges.map((row) => ({ ...row, actorName: row.actorId ? (actorName.get(row.actorId) ?? "") : "" })),
    };
  }

  async create(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const data = staffCreateSchema.parse(body);
    const duplicate = await this.prisma.staff.findFirst({ where: { schoolId, cnic: data.cnic }, select: { name: true, employeeNo: true } });
    if (duplicate) throw new BadRequestException(`CNIC ${data.cnic} already belongs to ${duplicate.name} (${duplicate.employeeNo}).`);
    const campusId = await this.validCampus(schoolId, data.campusId);
    const account = data.account;
    if (account) await this.assertEmailFree(account.email);

    const staff = await this.prisma.$transaction(async (tx) => {
      const employeeNo = await this.nextEmployeeNo(tx, schoolId);
      const user = account
        ? await tx.user.create({
            data: {
              email: account.email.toLowerCase(),
              name: data.name,
              password: await bcrypt.hash(account.password, 10),
              role: account.role,
              schoolId,
            },
          })
        : null;
      const created = await tx.staff.create({
        data: {
          schoolId,
          campusId,
          userId: user?.id,
          employeeNo,
          name: data.name,
          cnic: data.cnic,
          gender: data.gender ?? "",
          dateOfBirth: optionalDate(data.dateOfBirth),
          address: data.address ?? "",
          phone: data.phone ?? "",
          email: (account?.email ?? data.email)?.toLowerCase() || null,
          title: data.title,
          department: data.department ?? "",
          joinDate: dateOnly(data.joinDate),
          bankName: data.bankName ?? "",
          bankAccountTitle: data.bankAccountTitle ?? "",
          bankAccountNo: data.bankAccountNo ?? "",
          subjects: data.subjects ?? (data.subject ? [data.subject] : []),
        },
      });
      if (data.contract) {
        await tx.staffContract.create({
          data: {
            schoolId,
            staffId: created.id,
            type: data.contract.type,
            startDate: dateOnly(data.contract.startDate),
            endDate: optionalDate(data.contract.endDate),
            basicSalaryPkr: data.contract.basicSalaryPkr,
            allowances: data.contract.allowances,
            notes: data.contract.notes ?? "",
          },
        });
      }
      if (data.classId) {
        const cls = await tx.class.findFirst({ where: { id: data.classId, schoolId }, select: { id: true } });
        if (cls) await tx.teacherAssignment.create({ data: { schoolId, staffId: created.id, classId: cls.id, subject: data.subject ?? "" } });
      }
      return created;
    });
    await audit(this.prisma, { schoolId, actorId, action: "staff_created", entity: "staff", entityId: staff.id, summary: staff.employeeNo });
    return this.detail(schoolId, staff.id);
  }

  async update(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const existing = await this.prisma.staff.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Staff member not found");
    const raw = { ...((body ?? {}) as Record<string, unknown>) };
    if ("name" in raw && raw.name !== existing.name) {
      throw new ForbiddenException("A staff member's name can't be changed after they're added.");
    }
    delete raw.name;
    // CNIC is fixed once recorded. Older records saved before CNIC was required may add it once.
    let cnic: string | undefined;
    if ("cnic" in raw) {
      const next = String(raw.cnic ?? "");
      delete raw.cnic;
      if (next !== existing.cnic) {
        if (existing.cnic) throw new ForbiddenException("A staff member's CNIC can't be changed after it's saved.");
        if (!cnicPattern.test(next)) throw new BadRequestException("CNIC must look like 12345-1234567-1");
        const taken = await this.prisma.staff.findFirst({ where: { schoolId, cnic: next, id: { not: id } }, select: { name: true } });
        if (taken) throw new BadRequestException(`CNIC ${next} already belongs to ${taken.name}.`);
        cnic = next;
      }
    }
    const data = staffUpdateSchema.parse(raw);
    const campusId = data.campusId === undefined ? undefined : await this.validCampus(schoolId, data.campusId);
    const staff = await this.prisma.staff.update({
      where: { id },
      data: {
        cnic,
        gender: data.gender,
        dateOfBirth: data.dateOfBirth === undefined ? undefined : optionalDate(data.dateOfBirth),
        address: data.address,
        phone: data.phone,
        // The login email is changed from the account section so the two never drift apart.
        email: existing.userId || data.email === undefined ? undefined : data.email.toLowerCase() || null,
        title: data.title,
        department: data.department,
        joinDate: data.joinDate === undefined ? undefined : optionalDate(data.joinDate),
        campusId,
        bankName: data.bankName,
        bankAccountTitle: data.bankAccountTitle,
        bankAccountNo: data.bankAccountNo,
        subjects: data.subjects,
      },
    });
    await audit(this.prisma, { schoolId, actorId, action: "staff_updated", entity: "staff", entityId: staff.id });
    return this.detail(schoolId, id);
  }

  async changeStatus(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const existing = await this.prisma.staff.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Staff member not found");
    const data = staffStatusSchema.parse(body);
    if (data.status === existing.status) throw new BadRequestException(`${existing.name} is already ${data.status.toLowerCase().replace("_", " ")}.`);
    if (existing.userId === actorId && !CAN_SIGN_IN.includes(data.status)) {
      throw new BadRequestException("You can't suspend or remove your own account.");
    }
    let freedLessons = 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.staff.update({ where: { id }, data: { status: data.status } });
      await tx.staffStatusChange.create({
        data: {
          schoolId,
          staffId: id,
          fromStatus: existing.status,
          toStatus: data.status,
          reason: data.reason ?? "",
          effectiveOn: dateOnly(data.effectiveOn),
          actorId,
        },
      });
      if (existing.userId) {
        await tx.user.update({ where: { id: existing.userId }, data: { disabled: !CAN_SIGN_IN.includes(data.status) } });
      }
      if (LEFT.includes(data.status)) {
        freedLessons = (await tx.timetableLesson.updateMany({ where: { schoolId, staffId: id }, data: { staffId: null } })).count;
      }
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "staff_status_changed",
      entity: "staff",
      entityId: id,
      summary: `${existing.status} → ${data.status}`,
    });
    return { ...(await this.detail(schoolId, id)), freedLessons };
  }

  async addContract(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const staff = await this.prisma.staff.findFirst({ where: { id, schoolId }, select: { id: true } });
    if (!staff) throw new NotFoundException("Staff member not found");
    const data = staffContractSchema.parse(body);
    const startDate = dateOnly(data.startDate);
    const endDate = optionalDate(data.endDate);
    if (endDate && endDate < startDate) throw new BadRequestException("The contract can't end before it starts.");
    await this.prisma.$transaction(async (tx) => {
      // A new contract closes any open-ended one that started before it.
      const dayBefore = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
      await tx.staffContract.updateMany({
        where: { staffId: id, endDate: null, startDate: { lt: startDate } },
        data: { endDate: dayBefore },
      });
      await tx.staffContract.create({
        data: {
          schoolId,
          staffId: id,
          type: data.type,
          startDate,
          endDate,
          basicSalaryPkr: data.basicSalaryPkr,
          allowances: data.allowances,
          notes: data.notes ?? "",
        },
      });
    });
    await audit(this.prisma, { schoolId, actorId, action: "staff_contract_added", entity: "staff", entityId: id });
    return this.detail(schoolId, id);
  }

  /** Create a login for this staff member, or change its email, password or role. */
  async saveAccount(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const staff = await this.prisma.staff.findFirst({ where: { id, schoolId } });
    if (!staff) throw new NotFoundException("Staff member not found");
    const data = staffAccountSchema.parse(body);
    const email = data.email.toLowerCase();
    const password = data.password ? await bcrypt.hash(data.password, 10) : undefined;
    const disabled = !CAN_SIGN_IN.includes(staff.status);

    if (staff.userId) {
      if (staff.userId === actorId && data.role !== "SCHOOL_ADMIN") {
        throw new BadRequestException("You can't remove admin access from your own account.");
      }
      const clash = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (clash && clash.id !== staff.userId) throw new BadRequestException("Another account already uses this email.");
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: staff.userId }, data: { email, role: data.role, password, disabled } }),
        this.prisma.staff.update({ where: { id }, data: { email } }),
      ]);
    } else {
      const existing = await this.prisma.user.findUnique({ where: { email }, include: { staff: { select: { id: true } } } });
      if (existing) {
        if (existing.schoolId !== schoolId || existing.staff) {
          throw new BadRequestException("This email already has an account. Use a different email for this staff member.");
        }
        await this.prisma.$transaction([
          this.prisma.user.update({ where: { id: existing.id }, data: { role: data.role, password, disabled } }),
          this.prisma.staff.update({ where: { id }, data: { userId: existing.id, email } }),
        ]);
      } else {
        if (!password) throw new BadRequestException("Set a password for the new login.");
        await this.prisma.$transaction(async (tx) => {
          const user = await tx.user.create({ data: { email, name: staff.name, password, role: data.role, schoolId, disabled } });
          await tx.staff.update({ where: { id }, data: { userId: user.id, email } });
        });
      }
    }
    await audit(this.prisma, { schoolId, actorId, action: "staff_account_saved", entity: "staff", entityId: id, summary: `${data.role} ${email}` });
    return this.detail(schoolId, id);
  }

  async assign(schoolId: string, actorId: string, staffId: string, classId: string, subject = "") {
    await assertWritableSchool(this.prisma, schoolId);
    const staff = await this.prisma.staff.findFirst({ where: { id: staffId, schoolId } });
    if (!staff) throw new NotFoundException("Teacher not found");
    await assertClassWritable(this.prisma, schoolId, classId);
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

  async unassign(schoolId: string, actorId: string, staffId: string, assignmentId: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const row = await this.prisma.teacherAssignment.findFirst({ where: { id: assignmentId, staffId, schoolId } });
    if (!row) throw new NotFoundException("Assignment not found");
    await assertClassWritable(this.prisma, schoolId, row.classId);
    await this.prisma.teacherAssignment.delete({ where: { id: assignmentId } });
    await audit(this.prisma, { schoolId, actorId, action: "teacher_unassigned", entity: "assignment", entityId: assignmentId });
    return { ok: true };
  }

  /** Weekly lessons for one staff member, for their profile and portal. */
  async weekly(schoolId: string, staffId: string) {
    const [periods, lessons] = await Promise.all([
      this.prisma.timetablePeriod.findMany({
        where: { schoolId },
        select: { id: true, label: true, startTime: true, endTime: true, isBreak: true, sortOrder: true },
        orderBy: { sortOrder: "asc" },
      }),
      this.prisma.timetableLesson.findMany({
        where: { schoolId, staffId },
        select: { id: true, weekday: true, periodId: true, subject: true, class: { select: { id: true, name: true, section: true } } },
      }),
    ]);
    return { periods, lessons };
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

  private async validCampus(schoolId: string, campusId?: string) {
    if (!campusId) return null;
    const campus = await this.prisma.campus.findFirst({ where: { id: campusId, schoolId }, select: { id: true } });
    if (!campus) throw new BadRequestException("Choose a campus from this school.");
    return campus.id;
  }

  private async assertEmailFree(email: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
    if (existing) throw new BadRequestException("This email already has an account. Use a different email, or add the login later.");
  }

  private async nextEmployeeNo(tx: Prisma.TransactionClient, schoolId: string) {
    const count = await tx.staff.count({ where: { schoolId } });
    for (let n = count + 1; n < count + 500; n += 1) {
      const candidate = `EMP-${String(n).padStart(4, "0")}`;
      const taken = await tx.staff.findFirst({ where: { schoolId, employeeNo: candidate }, select: { id: true } });
      if (!taken) return candidate;
    }
    throw new BadRequestException("Could not allocate an employee number");
  }
}
