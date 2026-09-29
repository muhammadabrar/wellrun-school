import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { payrollGenerateSchema, payslipPaySchema, payslipUpdateSchema } from "@wellrun/shared";
import { audit } from "../common/audit";
import { dateOnly } from "../common/date";
import { assertWritableSchool, schoolLetterhead } from "../common/school";
import { nextSchoolNumber } from "../common/sequence";
import { PrismaService } from "../prisma/prisma.service";
import { currentContract, payLines } from "../staff/staff.service";

type PayLine = { label: string; amountPkr: number };

const DAY = 24 * 60 * 60 * 1000;
const sum = (lines: PayLine[]) => lines.reduce((total, line) => total + line.amountPkr, 0);

function monthBounds(period: string) {
  const [year, month] = period.split("-").map(Number);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { year, month, start, end, days: end.getUTCDate() };
}

export function periodLabel(period: string) {
  const { start } = monthBounds(period);
  return start.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

function totals(basicPkr: number, allowances: PayLine[], deductions: PayLine[]) {
  const grossPkr = basicPkr + sum(allowances);
  const deductionPkr = sum(deductions);
  return { grossPkr, deductionPkr, netPkr: Math.max(0, grossPkr - deductionPkr) };
}

const listSelect = {
  id: true,
  period: true,
  payslipNo: true,
  basicPkr: true,
  grossPkr: true,
  deductionPkr: true,
  netPkr: true,
  status: true,
  paidOn: true,
  staff: { select: { id: true, employeeNo: true, name: true, title: true, department: true } },
} satisfies Prisma.PayslipSelect;

@Injectable()
export class PayrollService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async month(schoolId: string, period: string) {
    payrollGenerateSchema.parse({ period });
    const { start, end } = monthBounds(period);
    const [payslips, eligible] = await Promise.all([
      this.prisma.payslip.findMany({ where: { schoolId, period }, select: listSelect, orderBy: { staff: { name: "asc" } } }),
      this.prisma.staff.findMany({
        where: {
          schoolId,
          status: { in: ["ACTIVE", "ON_LEAVE"] },
          contracts: { some: { startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] } },
        },
        select: { id: true },
      }),
    ]);
    const active = payslips.filter((row) => row.status !== "CANCELLED");
    const have = new Set(active.map((row) => row.staff.id));
    return {
      period,
      label: periodLabel(period),
      payslips,
      summary: {
        staff: active.length,
        grossPkr: active.reduce((total, row) => total + row.grossPkr, 0),
        deductionPkr: active.reduce((total, row) => total + row.deductionPkr, 0),
        netPkr: active.reduce((total, row) => total + row.netPkr, 0),
        paidPkr: active.filter((row) => row.status === "PAID").reduce((total, row) => total + row.netPkr, 0),
        drafts: active.filter((row) => row.status === "DRAFT").length,
        finalized: active.filter((row) => row.status === "FINALIZED").length,
        paid: active.filter((row) => row.status === "PAID").length,
        missing: eligible.filter((row) => !have.has(row.id)).length,
      },
    };
  }

  /** Draft payslips for everyone employed in the month who doesn't have one yet. */
  async generate(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const { period } = payrollGenerateSchema.parse(body);
    const { year, month, start, end, days } = monthBounds(period);
    const [staff, withoutContract] = await Promise.all([
      this.prisma.staff.findMany({
        where: {
          schoolId,
          status: { in: ["ACTIVE", "ON_LEAVE"] },
          payslips: { none: { period, status: { not: "CANCELLED" } } },
          contracts: { some: { startDate: { lte: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] } },
        },
        select: {
          id: true,
          joinDate: true,
          contracts: { select: { startDate: true, endDate: true, basicSalaryPkr: true, allowances: true } },
        },
      }),
      this.prisma.staff.findMany({
        where: { schoolId, status: { in: ["ACTIVE", "ON_LEAVE"] }, contracts: { none: {} } },
        select: { name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    let created = 0;
    for (const person of staff) {
      const inMonth = person.contracts.filter((row) => row.startDate <= end && (!row.endDate || row.endDate >= start));
      const contract = currentContract(inMonth, end);
      if (!contract) continue;
      // Pro-rate when the job or contract starts or ends part-way through the month.
      const from = new Date(Math.max(start.getTime(), contract.startDate.getTime(), person.joinDate?.getTime() ?? 0));
      const to = new Date(Math.min(end.getTime(), contract.endDate?.getTime() ?? end.getTime()));
      const worked = Math.max(0, Math.round((to.getTime() - from.getTime()) / DAY) + 1);
      if (!worked) continue;
      const ratio = worked >= days ? 1 : worked / days;
      const basicPkr = Math.round(contract.basicSalaryPkr * ratio);
      const allowances = payLines(contract.allowances).map((line) => ({ ...line, amountPkr: Math.round(line.amountPkr * ratio) }));
      await this.prisma.$transaction(async (tx) => {
        const payslipNo = await nextSchoolNumber(tx, schoolId, "PSL", year, month);
        const data = {
          payslipNo,
          basicPkr,
          allowances,
          deductions: [],
          status: "DRAFT" as const,
          paidOn: null,
          method: "",
          reference: "",
          notes: ratio < 1 ? `Pro-rated for ${worked} of ${days} days.` : "",
          ...totals(basicPkr, allowances, []),
        };
        // A cancelled payslip for the month is reused so the staff member keeps one row per month.
        await tx.payslip.upsert({
          where: { staffId_period: { staffId: person.id, period } },
          create: { schoolId, staffId: person.id, period, ...data },
          update: data,
        });
      });
      created += 1;
    }
    await audit(this.prisma, { schoolId, actorId, action: "payroll_generated", entity: "payslip", entityId: period, summary: `${created} payslips` });
    return { created, withoutContract: withoutContract.map((row) => row.name) };
  }

  async payslip(schoolId: string, id: string, staffId?: string) {
    const row = await this.prisma.payslip.findFirst({
      where: { id, schoolId, staffId, status: staffId ? { in: ["FINALIZED", "PAID"] } : undefined },
      include: {
        staff: {
          select: {
            id: true,
            employeeNo: true,
            name: true,
            cnic: true,
            title: true,
            department: true,
            joinDate: true,
            bankName: true,
            bankAccountTitle: true,
            bankAccountNo: true,
            campus: { select: { name: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException("Payslip not found");
    return {
      ...row,
      label: periodLabel(row.period),
      allowances: payLines(row.allowances),
      deductions: payLines(row.deductions),
      school: await schoolLetterhead(this.prisma, schoolId),
    };
  }

  async update(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const existing = await this.draft(schoolId, id);
    const data = payslipUpdateSchema.parse(body);
    const basicPkr = data.basicPkr ?? existing.basicPkr;
    const allowances = data.allowances ?? payLines(existing.allowances);
    const deductions = data.deductions ?? payLines(existing.deductions);
    const net = totals(basicPkr, allowances, deductions);
    if (sum(deductions) > basicPkr + sum(allowances)) throw new BadRequestException("Deductions can't be more than the gross pay.");
    await this.prisma.payslip.update({
      where: { id },
      data: { basicPkr, allowances, deductions, notes: data.notes ?? existing.notes, ...net },
    });
    await audit(this.prisma, { schoolId, actorId, action: "payslip_updated", entity: "payslip", entityId: id });
    return this.payslip(schoolId, id);
  }

  async finalize(schoolId: string, actorId: string, id: string) {
    await assertWritableSchool(this.prisma, schoolId);
    await this.draft(schoolId, id);
    await this.prisma.payslip.update({ where: { id }, data: { status: "FINALIZED" } });
    await audit(this.prisma, { schoolId, actorId, action: "payslip_finalized", entity: "payslip", entityId: id });
    return this.payslip(schoolId, id);
  }

  async finalizeAll(schoolId: string, actorId: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const { period } = payrollGenerateSchema.parse(body);
    const result = await this.prisma.payslip.updateMany({ where: { schoolId, period, status: "DRAFT" }, data: { status: "FINALIZED" } });
    await audit(this.prisma, { schoolId, actorId, action: "payroll_finalized", entity: "payslip", entityId: period, summary: `${result.count} payslips` });
    return { finalized: result.count };
  }

  async pay(schoolId: string, actorId: string, id: string, body: unknown) {
    await assertWritableSchool(this.prisma, schoolId);
    const existing = await this.prisma.payslip.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Payslip not found");
    if (existing.status !== "FINALIZED") throw new BadRequestException("Finalize the payslip before marking it paid.");
    const data = payslipPaySchema.parse(body);
    await this.prisma.payslip.update({
      where: { id },
      data: { status: "PAID", paidOn: dateOnly(data.paidOn), method: data.method, reference: data.reference ?? "" },
    });
    await audit(this.prisma, { schoolId, actorId, action: "payslip_paid", entity: "payslip", entityId: id, summary: `${existing.netPkr}` });
    return this.payslip(schoolId, id);
  }

  async cancel(schoolId: string, actorId: string, id: string) {
    await assertWritableSchool(this.prisma, schoolId);
    const existing = await this.prisma.payslip.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Payslip not found");
    if (existing.status === "PAID") throw new BadRequestException("A paid payslip can't be cancelled.");
    await this.prisma.payslip.update({ where: { id }, data: { status: "CANCELLED" } });
    await audit(this.prisma, { schoolId, actorId, action: "payslip_cancelled", entity: "payslip", entityId: id });
    return this.payslip(schoolId, id);
  }

  /** Payslips a staff member can see: finalized or paid only. */
  forStaff(schoolId: string, staffId: string) {
    return this.prisma.payslip.findMany({
      where: { schoolId, staffId, status: { in: ["FINALIZED", "PAID"] } },
      select: { id: true, period: true, payslipNo: true, grossPkr: true, deductionPkr: true, netPkr: true, status: true, paidOn: true },
      orderBy: { period: "desc" },
      take: 24,
    });
  }

  private async draft(schoolId: string, id: string) {
    const existing = await this.prisma.payslip.findFirst({ where: { id, schoolId } });
    if (!existing) throw new NotFoundException("Payslip not found");
    if (existing.status !== "DRAFT") throw new BadRequestException("Only draft payslips can be changed.");
    return existing;
  }
}
