import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";

export async function assertWritableSchool(prisma: PrismaService, schoolId: string) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school || school.deletedAt) throw new ForbiddenException("School is not available");
  if (!school.l2Active) throw new ForbiddenException("Workspace is not active yet");
  return school;
}

export async function teacherClassIds(
  prisma: PrismaService,
  user: { role: string; email: string; schoolId: string | null },
) {
  if (user.role !== "TEACHER") return null;
  const staff = await prisma.staff.findFirst({
    where: { schoolId: user.schoolId ?? undefined, email: user.email },
  });
  if (!staff) return [];
  const rows = await prisma.teacherAssignment.findMany({ where: { staffId: staff.id } });
  return [...new Set(rows.map((row) => row.classId))];
}
