import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { SaveAttendanceInput } from "@wellrun/shared";
import { audit } from "../common/audit";
import { dateOnly, karachiToday } from "../common/date";
import { assertWritableSchool, teacherClassIds } from "../common/school";
import type { CurrentUser } from "../common/current-user";
import type { SchoolScope } from "../common/school-scope";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AttendanceService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async day(schoolId: string, classId: string, date: string) {
    const [records, enrollments] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: { schoolId, classId, date: dateOnly(date) },
      }),
      this.prisma.enrollment.findMany({
        where: { schoolId, classId, active: true },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
        orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
      }),
    ]);
    return {
      records,
      students: enrollments.map((row) => row.student),
    };
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
    return this.day(schoolId, input.classId, input.date);
  }

  async absent(user: CurrentUser, date = karachiToday(), scope: SchoolScope = {}) {
    const schoolId = user.schoolId!;
    const allowed = await teacherClassIds(this.prisma, user);
    return this.prisma.attendanceRecord.findMany({
      where: {
        schoolId,
        date: dateOnly(date),
        status: { in: ["ABSENT", "LEAVE"] },
        classId: allowed ? { in: allowed } : undefined,
        class: scope.campusId ? { campusId: scope.campusId } : undefined,
      },
      include: {
        student: true,
        class: true,
      },
      orderBy: [{ class: { name: "asc" } }, { student: { lastName: "asc" } }],
    });
  }
}
