import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { claimSchema } from "@wellrun/shared";
import { audit } from "../common/audit";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ClaimsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  mine(userId: string) {
    return this.prisma.schoolClaim.findMany({
      where: { userId },
      include: { school: { select: { id: true, name: true, slug: true, city: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async submit(userId: string, body: unknown) {
    const data = claimSchema.parse(body);
    const school = await this.prisma.school.findFirst({
      where: { slug: data.slug, deletedAt: null },
    });
    if (!school) throw new NotFoundException("School not found");
    if (school.claimStatus === "APPROVED") {
      throw new BadRequestException("This school is already claimed.");
    }
    const existing = await this.prisma.schoolClaim.findFirst({
      where: { schoolId: school.id, userId, status: { in: ["PENDING", "APPROVED"] } },
    });
    if (existing?.status === "PENDING") {
      throw new BadRequestException("Your claim is already pending review.");
    }
    if (existing?.status === "APPROVED") {
      throw new BadRequestException("This school is already claimed.");
    }
    const claim = await this.prisma.schoolClaim.create({
      data: {
        schoolId: school.id,
        userId,
        roleAtSchool: data.roleAtSchool,
        whatsapp: data.whatsapp,
        note: data.note ?? "",
        status: "PENDING",
      },
    });
    await this.prisma.school.update({
      where: { id: school.id },
      data: { claimStatus: "PENDING" },
    });
    await audit(this.prisma, {
      schoolId: school.id,
      actorId: userId,
      action: "claim_submitted",
      entity: "claim",
      entityId: claim.id,
    });
    return claim;
  }

  queue() {
    return this.prisma.schoolClaim.findMany({
      include: {
        school: { select: { id: true, name: true, slug: true, city: true, claimStatus: true } },
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async decide(actorId: string, id: string, status: "APPROVED" | "REJECTED", reason?: string) {
    const claim = await this.prisma.schoolClaim.findUnique({
      where: { id },
      include: { school: true, user: true },
    });
    if (!claim) throw new NotFoundException("Claim not found");
    if (claim.status !== "PENDING") throw new BadRequestException("This claim was already reviewed.");
    if (status === "REJECTED" && !reason?.trim()) {
      throw new BadRequestException("A reason is required to reject a claim.");
    }

    if (status === "APPROVED") {
      await this.prisma.$transaction([
        this.prisma.schoolClaim.update({
          where: { id },
          data: { status, rejectReason: null },
        }),
        this.prisma.schoolClaim.updateMany({
          where: { schoolId: claim.schoolId, id: { not: id }, status: "PENDING" },
          data: { status: "REJECTED", rejectReason: "Another claim was approved." },
        }),
        this.prisma.school.update({
          where: { id: claim.schoolId },
          data: { claimStatus: "APPROVED", l2Active: true, whatsapp: claim.whatsapp || undefined },
        }),
        this.prisma.user.update({
          where: { id: claim.userId },
          data: { role: "SCHOOL_ADMIN", schoolId: claim.schoolId },
        }),
        this.prisma.campus.create({
          data: {
            schoolId: claim.schoolId,
            name: "Main campus",
            address: claim.school.address || "",
            code: "MAIN",
            isMain: true,
            principal: claim.user.name,
          },
        }),
      ]);
    } else {
      await this.prisma.schoolClaim.update({
        where: { id },
        data: { status, rejectReason: reason!.trim() },
      });
      const pending = await this.prisma.schoolClaim.count({
        where: { schoolId: claim.schoolId, status: "PENDING" },
      });
      if (!pending) {
        await this.prisma.school.update({
          where: { id: claim.schoolId },
          data: { claimStatus: "UNCLAIMED" },
        });
      }
    }

    await audit(this.prisma, {
      schoolId: claim.schoolId,
      actorId,
      action: status === "APPROVED" ? "claim_approved" : "claim_rejected",
      entity: "claim",
      entityId: claim.id,
      summary: reason ?? "",
    });
    return this.prisma.schoolClaim.findUnique({ where: { id } });
  }
}
