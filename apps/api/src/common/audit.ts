import type { PrismaService } from "../prisma/prisma.service";

export function audit(
  prisma: PrismaService,
  input: { schoolId?: string | null; actorId?: string | null; action: string; entity: string; entityId: string; summary?: string },
) {
  return prisma.auditLog.create({
    data: {
      schoolId: input.schoolId ?? undefined,
      actorId: input.actorId ?? undefined,
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      summary: input.summary ?? "",
    },
  });
}
