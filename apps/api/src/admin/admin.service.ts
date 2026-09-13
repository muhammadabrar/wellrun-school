import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { adminSchoolSchema } from "@wellrun/shared";
import { audit } from "../common/audit";
import { taxonomy } from "../common/taxonomy";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AdminService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  taxonomy() {
    return taxonomy();
  }

  schools() {
    return this.prisma.school.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { students: true, claims: true } } },
    });
  }

  async create(actorId: string, body: unknown) {
    const data = adminSchoolSchema.parse(body);
    const school = await this.prisma.school.create({
      data: {
        name: data.name,
        slug: data.slug,
        city: data.city,
        area: data.area ?? "",
        type: data.type ?? "private",
        feeBand: data.feeBand ?? "not_published",
        whatsapp: data.whatsapp ?? "",
        published: data.published ?? false,
        claimStatus: "UNCLAIMED",
        l2Active: false,
      },
    });
    await audit(this.prisma, {
      schoolId: school.id,
      actorId,
      action: "school_created",
      entity: "school",
      entityId: school.id,
    });
    return school;
  }

  async update(actorId: string, id: string, body: unknown) {
    const existing = await this.prisma.school.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("School not found");
    const data = adminSchoolSchema.partial().parse(body);
    const school = await this.prisma.school.update({
      where: { id },
      data: {
        name: data.name,
        slug: data.slug,
        city: data.city,
        area: data.area,
        type: data.type,
        feeBand: data.feeBand,
        whatsapp: data.whatsapp,
        published: data.published,
      },
    });
    await audit(this.prisma, {
      schoolId: id,
      actorId,
      action: "school_updated",
      entity: "school",
      entityId: id,
    });
    return school;
  }

  async remove(actorId: string, id: string) {
    const existing = await this.prisma.school.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("School not found");
    const school = await this.prisma.school.update({
      where: { id },
      data: { deletedAt: new Date(), published: false, l2Active: false },
    });
    await audit(this.prisma, {
      schoolId: id,
      actorId,
      action: "school_deleted",
      entity: "school",
      entityId: id,
    });
    return school;
  }
}
