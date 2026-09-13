import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { profileSchema } from "@wellrun/shared";
import { audit } from "../common/audit";
import { waLink } from "../common/phone";
import { PrismaService } from "../prisma/prisma.service";

const publicInclude = {
  profile: true,
  media: { orderBy: { sortOrder: "asc" as const } },
  reviews: { orderBy: { createdAt: "desc" as const } },
  posts: { orderBy: { createdAt: "desc" as const }, take: 8 },
};

@Injectable()
export class SchoolsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  list(query: { city?: string; q?: string; type?: string; fee?: string; facility?: string; area?: string }) {
    return this.prisma.school.findMany({
      where: {
        published: true,
        deletedAt: null,
        city: query.city ? { equals: query.city, mode: "insensitive" } : undefined,
        area: query.area ? { equals: query.area, mode: "insensitive" } : undefined,
        type: query.type || undefined,
        feeBand: query.fee || undefined,
        OR: query.q
          ? [
              { name: { contains: query.q, mode: "insensitive" } },
              { city: { contains: query.q, mode: "insensitive" } },
              { area: { contains: query.q, mode: "insensitive" } },
            ]
          : undefined,
      },
      include: {
        profile: true,
        media: { where: { kind: { in: ["LOGO", "COVER"] } } },
        reviews: { select: { rating: true } },
      },
      orderBy: { name: "asc" },
    }).then((rows) => {
      const filtered = query.facility
        ? rows.filter((row) => {
            const facilities = (row.profile?.facilities as string[] | null) ?? [];
            return facilities.includes(query.facility!);
          })
        : rows;
      return filtered.map((row) => this.decorate(row));
    });
  }

  cities() {
    return this.prisma.school.findMany({
      where: { published: true, deletedAt: null },
      select: { city: true, area: true },
      distinct: ["city", "area"],
    });
  }

  decorate<T extends { whatsapp: string; name: string; city: string; claimStatus: string }>(school: T) {
    const text = `Assalamualaikum, I found ${school.name} on Wellrun School. I would like information about admissions and fees for ${school.city}.`;
    return {
      ...school,
      waUrl: waLink(school.whatsapp, text),
      waDigits: school.whatsapp,
      claimed: school.claimStatus === "APPROVED",
    };
  }

  async bySlug(slug: string) {
    const school = await this.prisma.school.findFirst({
      where: { slug, published: true, deletedAt: null },
      include: publicInclude,
    });
    if (!school) throw new NotFoundException("School not found");
    return this.decorate(school);
  }

  async compare(slugs: string[]) {
    const unique = [...new Set(slugs)].slice(0, 3);
    const schools = await this.prisma.school.findMany({
      where: { slug: { in: unique }, published: true, deletedAt: null },
      include: publicInclude,
    });
    return unique
      .map((slug) => schools.find((s) => s.slug === slug))
      .filter(Boolean)
      .map((s) => this.decorate(s!));
  }

  async updateProfile(schoolId: string, actorId: string, body: unknown) {
    const data = profileSchema.parse(body);
    const school = await this.prisma.school.findUnique({ where: { id: schoolId } });
    if (!school || !school.l2Active) throw new ForbiddenException("Workspace is not active");
    await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        whatsapp: data.whatsapp ?? school.whatsapp,
        phone: data.phone ?? school.phone,
        website: data.website ?? school.website,
        address: data.address ?? school.address,
        area: data.area ?? school.area,
        type: data.type ?? school.type,
        feeBand: data.feeBand ?? school.feeBand,
      },
    });
    if (school) {
      await this.prisma.schoolProfile.upsert({
        where: { schoolId },
        update: {
          about: data.about,
          location: data.location,
          principal: data.principal,
          establishedYear: data.establishedYear,
          studentCount: data.studentCount,
          teacherCount: data.teacherCount,
          facilities: data.facilities,
          labs: data.labs,
          sports: data.sports,
          activities: data.activities,
          programs: data.programs,
          feeMinPkr: data.feeMinPkr,
          feeMaxPkr: data.feeMaxPkr,
          feeNotes: data.feeNotes,
        },
        create: {
          schoolId,
          about: data.about ?? "",
          location: data.location ?? "",
          principal: data.principal ?? "",
          establishedYear: data.establishedYear ?? new Date().getFullYear(),
          studentCount: data.studentCount ?? 0,
          teacherCount: data.teacherCount ?? 0,
          facilities: data.facilities ?? [],
          labs: data.labs ?? [],
          sports: data.sports ?? [],
          activities: data.activities ?? [],
          programs: data.programs ?? [],
          feeMinPkr: data.feeMinPkr ?? 0,
          feeMaxPkr: data.feeMaxPkr ?? 0,
          feeNotes: data.feeNotes ?? "",
        },
      });
    }
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "profile_updated",
      entity: "school",
      entityId: schoolId,
    });
    return this.prisma.school.findUnique({ where: { id: schoolId }, include: { profile: true } });
  }
}
