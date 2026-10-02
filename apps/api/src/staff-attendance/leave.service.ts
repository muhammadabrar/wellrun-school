import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  isoOf,
  leaveDecisionSchema,
  leaveRequestProblem,
  leaveRequestSchema,
  leaveWorkingDays,
  pageParams,
  rangesOverlap,
  type LeaveList,
  type LeaveStatus,
  type LeaveView,
} from "@wellrun/shared";
import { loadHolidays, loadSettings } from "../attendance/rules";
import { audit } from "../common/audit";
import type { CurrentUser } from "../common/current-user";
import { dateOnly, karachiToday } from "../common/date";
import { staffForUser } from "../common/school";
import { PrismaService } from "../prisma/prisma.service";

export type LeaveListQuery = { status?: string; page?: string; pageSize?: string };

const select = {
  id: true,
  staffId: true,
  type: true,
  fromOn: true,
  toOn: true,
  workingDays: true,
  reason: true,
  status: true,
  decidedAt: true,
  decisionNote: true,
  createdAt: true,
  staff: { select: { name: true, employeeNo: true, department: true } },
} satisfies Prisma.StaffLeaveSelect;

type Row = Prisma.StaffLeaveGetPayload<{ select: typeof select }>;

const STATUSES: LeaveStatus[] = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"];

@Injectable()
export class LeaveService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private async deciders(ids: (string | null)[]) {
    const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!wanted.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: wanted } }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private view(row: Row & { decidedById?: string | null }, today: string, names: Map<string, string>): LeaveView {
    const fromOn = isoOf(row.fromOn);
    return {
      id: row.id,
      staffId: row.staffId,
      staffName: row.staff.name,
      employeeNo: row.staff.employeeNo,
      department: row.staff.department,
      type: row.type,
      fromOn,
      toOn: isoOf(row.toOn),
      workingDays: row.workingDays,
      reason: row.reason,
      status: row.status,
      decidedBy: row.decidedById ? (names.get(row.decidedById) ?? null) : null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionNote: row.decisionNote,
      createdAt: row.createdAt.toISOString(),
      canCancel: row.status === "PENDING" || (row.status === "APPROVED" && fromOn > today),
    };
  }

  private async load(where: Prisma.StaffLeaveWhereInput, orderBy: Prisma.StaffLeaveOrderByWithRelationInput[], skip: number, take: number) {
    const rows = await this.prisma.staffLeave.findMany({ where, select: { ...select, decidedById: true }, orderBy, skip, take });
    const names = await this.deciders(rows.map((r) => r.decidedById));
    const today = karachiToday();
    return rows.map((row) => this.view(row, today, names));
  }

  /** A staff member files a request. It waits for an admin; nothing changes in attendance until it is approved. */
  async request(user: CurrentUser, body: unknown): Promise<LeaveView> {
    const schoolId = user.schoolId;
    if (!schoolId) throw new ForbiddenException("No school on this session");
    const data = leaveRequestSchema.parse(body);
    const staff = await staffForUser(this.prisma, { id: user.id, email: user.email, schoolId });
    if (!staff) throw new ForbiddenException("Your login isn't linked to a staff record. Ask your school admin to link it.");
    const today = karachiToday();
    const [settings, holidays] = await Promise.all([loadSettings(this.prisma, schoolId), loadHolidays(this.prisma, schoolId, data.fromOn, data.toOn, staff.campusId)]);
    const workingDays = leaveWorkingDays(data.fromOn, data.toOn, settings, holidays);
    const problem = leaveRequestProblem(data, today, workingDays);
    if (problem) throw new BadRequestException(problem);

    const others = await this.prisma.staffLeave.findMany({
      where: { staffId: staff.id, status: { in: ["PENDING", "APPROVED"] }, fromOn: { lte: dateOnly(data.toOn) }, toOn: { gte: dateOnly(data.fromOn) } },
      select: { fromOn: true, toOn: true },
    });
    if (others.some((o) => rangesOverlap(data.fromOn, data.toOn, isoOf(o.fromOn), isoOf(o.toOn)))) {
      throw new BadRequestException("You already have leave on some of those days");
    }
    const row = await this.prisma.staffLeave.create({
      data: { schoolId, staffId: staff.id, type: data.type, fromOn: dateOnly(data.fromOn), toOn: dateOnly(data.toOn), workingDays, reason: data.reason },
      select: { ...select, decidedById: true },
    });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "leave_requested", entity: "leave", entityId: row.id, summary: `${data.fromOn} to ${data.toOn}` });
    return this.view(row, today, new Map());
  }

  async mine(user: CurrentUser): Promise<LeaveView[]> {
    const schoolId = user.schoolId;
    if (!schoolId) throw new ForbiddenException("No school on this session");
    const staff = await staffForUser(this.prisma, { id: user.id, email: user.email, schoolId });
    if (!staff) return [];
    return this.load({ staffId: staff.id }, [{ fromOn: "desc" }, { id: "asc" }], 0, 30);
  }

  async cancel(user: CurrentUser, id: string): Promise<LeaveView> {
    const schoolId = user.schoolId;
    if (!schoolId) throw new ForbiddenException("No school on this session");
    const staff = await staffForUser(this.prisma, { id: user.id, email: user.email, schoolId });
    const leave = await this.prisma.staffLeave.findFirst({ where: { id, schoolId }, select: { id: true, staffId: true, status: true, fromOn: true } });
    if (!leave || !staff || leave.staffId !== staff.id) throw new NotFoundException("Leave request not found");
    const today = karachiToday();
    const started = isoOf(leave.fromOn) <= today;
    if (leave.status === "APPROVED" && started) throw new BadRequestException("This leave has already started, so it can't be withdrawn. Ask your admin.");
    if (leave.status !== "PENDING" && leave.status !== "APPROVED") throw new BadRequestException("This request is already closed");
    await this.prisma.staffLeave.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(this.prisma, { schoolId, actorId: user.id, action: "leave_cancelled", entity: "leave", entityId: id });
    return (await this.load({ id }, [{ id: "asc" }], 0, 1))[0]!;
  }

  // Admin ---------------------------------------------------------------------------------------------------

  async list(schoolId: string, campusId: string | undefined, query: LeaveListQuery): Promise<LeaveList> {
    const { page, pageSize, skip, take } = pageParams(query, 20);
    const status = STATUSES.find((s) => s === query.status);
    const base: Prisma.StaffLeaveWhereInput = { schoolId, ...(campusId ? { staff: { OR: [{ campusId }, { campusId: null }] } } : {}) };
    const where: Prisma.StaffLeaveWhereInput = { ...base, ...(status ? { status } : {}) };
    // The queue is worked soonest first; history is read newest first.
    const orderBy: Prisma.StaffLeaveOrderByWithRelationInput[] = status === "PENDING" ? [{ fromOn: "asc" }, { id: "asc" }] : [{ fromOn: "desc" }, { id: "asc" }];
    const [items, total, pending] = await Promise.all([
      this.load(where, orderBy, skip, take),
      this.prisma.staffLeave.count({ where }),
      this.prisma.staffLeave.count({ where: { ...base, status: "PENDING" } }),
    ]);
    return { items, total, page, pageSize, pending };
  }

  async decide(schoolId: string, admin: CurrentUser, id: string, body: unknown): Promise<LeaveView> {
    const { decision, note } = leaveDecisionSchema.parse(body);
    const leave = await this.prisma.staffLeave.findFirst({ where: { id, schoolId }, select: { id: true, staffId: true, status: true, fromOn: true, toOn: true } });
    if (!leave) throw new NotFoundException("Leave request not found");
    if (leave.status !== "PENDING") throw new BadRequestException("This request has already been decided");
    const approved = decision === "APPROVE";
    await this.prisma.$transaction(async (tx) => {
      await tx.staffLeave.update({ where: { id }, data: { status: approved ? "APPROVED" : "REJECTED", decidedById: admin.id, decidedAt: new Date(), decisionNote: note } });
      // Days already saved as absent while the request was waiting become leave.
      if (approved) {
        await tx.staffAttendance.updateMany({
          where: { staffId: leave.staffId, status: "ABSENT", date: { gte: leave.fromOn, lte: leave.toOn } },
          data: { status: "ON_LEAVE", source: "LEAVE" },
        });
      }
    });
    await audit(this.prisma, { schoolId, actorId: admin.id, action: approved ? "leave_approved" : "leave_rejected", entity: "leave", entityId: id, summary: note });
    return (await this.load({ id }, [{ id: "asc" }], 0, 1))[0]!;
  }
}
