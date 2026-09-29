import { ForbiddenException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";

export async function assertWritableSchool(prisma: PrismaService, schoolId: string) {
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school || school.deletedAt) throw new ForbiddenException("School is not available");
  if (!school.l2Active) throw new ForbiddenException("Workspace is not active yet");
  return school;
}

/** The staff record behind a teacher login: linked account first, then the older email match. */
export async function staffForUser(prisma: PrismaService, user: { id?: string; email: string; schoolId: string | null }) {
  if (!user.schoolId) return null;
  if (user.id) {
    const linked = await prisma.staff.findFirst({ where: { schoolId: user.schoolId, userId: user.id } });
    if (linked) return linked;
  }
  return prisma.staff.findFirst({ where: { schoolId: user.schoolId, email: { equals: user.email, mode: "insensitive" } } });
}

export async function teacherClassIds(
  prisma: PrismaService,
  user: { id?: string; role: string; email: string; schoolId: string | null },
) {
  if (user.role !== "TEACHER") return null;
  const staff = await staffForUser(prisma, user);
  if (!staff) return [];
  const [assigned, taught] = await Promise.all([
    prisma.teacherAssignment.findMany({ where: { staffId: staff.id }, select: { classId: true } }),
    prisma.timetableLesson.findMany({ where: { staffId: staff.id }, select: { classId: true }, distinct: ["classId"] }),
  ]);
  return [...new Set([...assigned, ...taught].map((row) => row.classId))];
}

/** First teaching period of the school day (breaks skipped). */
export function firstTeachingPeriod(prisma: PrismaService, schoolId: string) {
  return prisma.timetablePeriod.findFirst({
    where: { schoolId, isBreak: false },
    orderBy: { sortOrder: "asc" },
    select: { id: true, label: true, startTime: true, endTime: true },
  });
}

/** Classes this teacher teaches in the first period on the given weekday (1 = Monday). They take that class's attendance. */
export async function firstPeriodClassIds(prisma: PrismaService, schoolId: string, staffId: string, weekday: number) {
  const period = await firstTeachingPeriod(prisma, schoolId);
  if (!period) return [];
  const rows = await prisma.timetableLesson.findMany({
    where: { schoolId, staffId, weekday, periodId: period.id },
    select: { classId: true },
  });
  return rows.map((row) => row.classId);
}

/** School name, contact and logo as printed at the top of receipts and payslips. */
export async function schoolLetterhead(prisma: PrismaService, schoolId: string) {
  const school = await prisma.school.findUniqueOrThrow({
    where: { id: schoolId },
    select: {
      name: true,
      address: true,
      city: true,
      phone: true,
      email: true,
      website: true,
      registrationNo: true,
      primaryColor: true,
      media: { where: { kind: "LOGO" }, select: { url: true }, take: 1 },
    },
  });
  return {
    name: school.name,
    address: school.city && !school.address.toLowerCase().includes(school.city.toLowerCase()) ? [school.address, school.city].filter(Boolean).join(", ") : school.address,
    phone: school.phone,
    email: school.email,
    website: school.website,
    registrationNo: school.registrationNo,
    primaryColor: school.primaryColor,
    logoUrl: school.media[0]?.url ?? "",
  };
}
