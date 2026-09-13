import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { SaveAttendanceInput } from "@wellrun/shared";
import { audit } from "../common/audit";
import { dateOnly, karachiToday } from "../common/date";
import { assertWritableSchool, teacherClassIds } from "../common/school";
import type { CurrentUser } from "../common/current-user";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async classes(user: CurrentUser) {
    const schoolId = user.schoolId!;
    const allowed = await teacherClassIds(this.prisma, user);
    return this.prisma.class.findMany({
      where: { schoolId, id: allowed ? { in: allowed } : undefined },
      include: { enrollments: { where: { active: true }, include: { student: true } } },
      orderBy: [{ name: "asc" }, { section: "asc" }],
    });
  }

  records(schoolId: string, classId: string, date: string) {
    return this.prisma.attendanceRecord.findMany({
      where: { schoolId, classId, date: dateOnly(date) },
    });
  }

  async save(user: CurrentUser, input: SaveAttendanceInput) {
    const schoolId = user.schoolId!;
    await assertWritableSchool(this.prisma, schoolId);
    const allowed = await teacherClassIds(this.prisma, user);
    if (allowed && !allowed.includes(input.classId)) {
      throw new ForbiddenException("You can only mark attendance for your classes");
    }
    const date = dateOnly(input.date);
    await this.prisma.$transaction(
      input.records.map((record) =>
        this.prisma.attendanceRecord.upsert({
          where: { studentId_date: { studentId: record.studentId, date } },
          create: {
            schoolId,
            studentId: record.studentId,
            classId: input.classId,
            date,
            status: record.status,
          },
          update: { status: record.status, classId: input.classId },
        }),
      ),
    );
    await audit(this.prisma, {
      schoolId,
      actorId: user.id,
      action: "attendance_saved",
      entity: "attendance",
      entityId: input.classId,
      summary: `${input.date} ${input.records.length} marks`,
    });
    return this.records(schoolId, input.classId, input.date);
  }

  async absent(user: CurrentUser, date = karachiToday()) {
    const schoolId = user.schoolId!;
    const allowed = await teacherClassIds(this.prisma, user);
    return this.prisma.attendanceRecord.findMany({
      where: {
        schoolId,
        date: dateOnly(date),
        status: { in: ["ABSENT", "LEAVE"] },
        classId: allowed ? { in: allowed } : undefined,
      },
      include: {
        student: true,
        class: true,
      },
      orderBy: [{ class: { name: "asc" } }, { student: { lastName: "asc" } }],
    });
  }
}
