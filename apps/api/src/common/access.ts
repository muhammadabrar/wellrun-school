import { ForbiddenException } from "@nestjs/common";
import type { CurrentUser } from "./current-user";
import { requireSchoolId } from "./roles";
import type { PrismaService } from "../prisma/prisma.service";

export async function teacherClassIds(prisma: PrismaService, user: CurrentUser) {
  const schoolId = requireSchoolId(user);
  if (user.role === "SCHOOL_ADMIN") return { schoolId, classIds: null as string[] | null };
  if (user.role !== "TEACHER") throw new ForbiddenException("School staff only");
  const staff = await prisma.staff.findFirst({ where: { schoolId, email: user.email } });
  if (!staff) return { schoolId, classIds: [] as string[] };
  const assignments = await prisma.teacherAssignment.findMany({ where: { schoolId, staffId: staff.id } });
  return { schoolId, classIds: assignments.map((row) => row.classId) };
}

export function assertStudentInScope(classIds: string[] | null, enrolledClassIds: string[]) {
  if (!classIds) return;
  if (!enrolledClassIds.some((id) => classIds.includes(id))) {
    throw new ForbiddenException("This student is not in your assigned class");
  }
}
