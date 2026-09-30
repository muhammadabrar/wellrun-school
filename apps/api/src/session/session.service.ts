import { Inject, Injectable } from "@nestjs/common";
import type { AcademicYearStatus } from "@wellrun/shared";
import { PrismaService } from "../prisma/prisma.service";

type SessionYear = { id: string; name: string; current: boolean; status: AcademicYearStatus; startsOn: string; endsOn: string };

export type SchoolContext = {
  setupCompleted: boolean;
  setupStep: number;
  campuses: { id: string; name: string; isMain: boolean; code: string }[];
  years: SessionYear[];
  currentYear: SessionYear | null;
  classes: { id: string; name: string; section: string; yearId: string; campusId: string | null }[];
};

export const emptySchoolContext = (): SchoolContext => ({
  setupCompleted: true,
  setupStep: 0,
  campuses: [],
  years: [],
  currentYear: null,
  classes: [],
});

@Injectable()
export class SessionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async forSchool(schoolId: string | null): Promise<SchoolContext> {
    if (!schoolId) return emptySchoolContext();
    const [school, campuses, years, classes] = await Promise.all([
      this.prisma.school.findUnique({
        where: { id: schoolId },
        select: { setupCompleted: true, setupStep: true },
      }),
      this.prisma.campus.findMany({
        where: { schoolId },
        select: { id: true, name: true, isMain: true, code: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.academicYear.findMany({
        where: { schoolId },
        select: { id: true, name: true, current: true, status: true, startsOn: true, endsOn: true },
        orderBy: { startsOn: "desc" },
      }),
      this.prisma.class.findMany({
        where: { schoolId },
        select: { id: true, name: true, section: true, yearId: true, campusId: true },
        orderBy: [{ name: "asc" }, { section: "asc" }],
      }),
    ]);
    const mappedYears = years.map((year) => ({
      id: year.id,
      name: year.name,
      current: year.current,
      status: year.status,
      startsOn: year.startsOn.toISOString(),
      endsOn: year.endsOn.toISOString(),
    }));
    return {
      setupCompleted: school?.setupCompleted ?? false,
      setupStep: school?.setupStep ?? 0,
      campuses,
      years: mappedYears,
      currentYear: mappedYears.find((year) => year.current) ?? mappedYears[0] ?? null,
      classes,
    };
  }
}
