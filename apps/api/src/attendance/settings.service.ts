import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { attendanceSettingsSchema, holidaySchema, isoOf, type HolidayView } from "@wellrun/shared";
import { audit } from "../common/audit";
import { dateOnly } from "../common/date";
import { PrismaService } from "../prisma/prisma.service";
import { loadSettings } from "./rules";

@Injectable()
export class AttendanceSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  get(schoolId: string) {
    return loadSettings(this.prisma, schoolId);
  }

  async save(schoolId: string, actorId: string, body: unknown) {
    const input = attendanceSettingsSchema.parse(body);
    const data = { ...input, workingWeekdays: [...new Set(input.workingWeekdays)].sort() };
    await this.prisma.attendanceSettings.upsert({ where: { schoolId }, create: { schoolId, ...data }, update: data });
    await audit(this.prisma, { schoolId, actorId, action: "attendance_settings_saved", entity: "attendance_settings", entityId: schoolId, summary: "Attendance settings updated" });
    return this.get(schoolId);
  }

  async holidays(schoolId: string, year?: string): Promise<HolidayView[]> {
    const rows = await this.prisma.holiday.findMany({
      where: {
        schoolId,
        ...(year && /^\d{4}$/.test(year)
          ? { startsOn: { lte: dateOnly(`${year}-12-31`) }, endsOn: { gte: dateOnly(`${year}-01-01`) } }
          : {}),
      },
      include: { campus: { select: { name: true } } },
      orderBy: { startsOn: "asc" },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      startsOn: isoOf(row.startsOn),
      endsOn: isoOf(row.endsOn),
      campusId: row.campusId,
      campusName: row.campus?.name ?? null,
    }));
  }

  async createHoliday(schoolId: string, actorId: string, body: unknown) {
    const input = holidaySchema.parse(body);
    await this.assertCampus(schoolId, input.campusId);
    const row = await this.prisma.holiday.create({
      data: { schoolId, name: input.name, startsOn: dateOnly(input.startsOn), endsOn: dateOnly(input.endsOn), campusId: input.campusId || null },
    });
    await audit(this.prisma, { schoolId, actorId, action: "holiday_created", entity: "holiday", entityId: row.id, summary: `${input.name} ${input.startsOn}–${input.endsOn}` });
    return row;
  }

  async updateHoliday(schoolId: string, actorId: string, id: string, body: unknown) {
    const input = holidaySchema.parse(body);
    await this.holidayOrThrow(schoolId, id);
    await this.assertCampus(schoolId, input.campusId);
    const row = await this.prisma.holiday.update({
      where: { id },
      data: { name: input.name, startsOn: dateOnly(input.startsOn), endsOn: dateOnly(input.endsOn), campusId: input.campusId || null },
    });
    await audit(this.prisma, { schoolId, actorId, action: "holiday_updated", entity: "holiday", entityId: id, summary: input.name });
    return row;
  }

  async removeHoliday(schoolId: string, actorId: string, id: string) {
    const row = await this.holidayOrThrow(schoolId, id);
    await this.prisma.holiday.delete({ where: { id } });
    await audit(this.prisma, { schoolId, actorId, action: "holiday_deleted", entity: "holiday", entityId: id, summary: row.name });
    return { ok: true };
  }

  private async holidayOrThrow(schoolId: string, id: string) {
    const row = await this.prisma.holiday.findFirst({ where: { id, schoolId } });
    if (!row) throw new NotFoundException("Holiday not found");
    return row;
  }

  private async assertCampus(schoolId: string, campusId?: string | null) {
    if (!campusId) return;
    const campus = await this.prisma.campus.findFirst({ where: { id: campusId, schoolId }, select: { id: true } });
    if (!campus) throw new BadRequestException("Campus not found");
  }
}
