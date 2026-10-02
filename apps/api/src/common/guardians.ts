import { BadRequestException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { audit } from "./audit";
import { normalizeCnic, normalizePhone } from "./phone";
import type { PrismaService } from "../prisma/prisma.service";

export type GuardianInput = {
  name: string;
  phone: string;
  relation: string;
  cnic?: string | null;
  email?: string | null;
  occupation?: string | null;
  extra?: Record<string, unknown>;
};

type Db = PrismaService;

function contact(data: GuardianInput) {
  const phoneNorm = normalizePhone(data.phone);
  if (!phoneNorm) throw new BadRequestException("Enter a valid guardian phone number");
  return { phoneNorm, cnic: normalizeCnic(data.cnic) };
}

const label = (row: { name: string; relation: string }) => `${row.name} (${row.relation})`;

/** One guardian per phone and per CNIC within a school: parents sign in with the phone and see every child linked to it. */
export async function findGuardian(db: Db, schoolId: string, data: GuardianInput) {
  const { phoneNorm, cnic } = contact(data);
  const byPhone = await db.guardian.findUnique({ where: { schoolId_phoneNorm: { schoolId, phoneNorm } } });
  if (byPhone) return byPhone;
  return cnic ? db.guardian.findUnique({ where: { schoolId_cnic: { schoolId, cnic } } }) : null;
}

/** Guardian rows for "New guardian" must be new: an existing phone or CNIC means the admin should pick that guardian instead. */
export async function createGuardian(db: Db, schoolId: string, actorId: string, data: GuardianInput) {
  const { phoneNorm, cnic } = contact(data);
  const clash = await findGuardian(db, schoolId, data);
  if (clash) {
    throw new BadRequestException(
      `${label(clash)} already has this ${clash.phoneNorm === phoneNorm ? "phone number" : "CNIC"}. Choose them from the list instead of adding a new guardian.`,
    );
  }
  const guardian = await db.guardian.create({
    data: {
      schoolId,
      name: data.name,
      phone: data.phone.trim(),
      phoneNorm,
      cnic,
      email: data.email || null,
      relation: data.relation,
      occupation: data.occupation ?? "",
      extra: (data.extra ?? {}) as Prisma.InputJsonValue,
    },
  });
  await audit(db, { schoolId, actorId, action: "guardian_created", entity: "guardian", entityId: guardian.id });
  return guardian;
}

/** Reuses the guardian that already owns this phone or CNIC (siblings share one), otherwise creates one. */
export async function findOrCreateGuardian(db: Db, schoolId: string, actorId: string, data: GuardianInput) {
  const existing = await findGuardian(db, schoolId, data);
  if (!existing) return createGuardian(db, schoolId, actorId, data);
  const { cnic } = contact(data);
  if (cnic && cnic !== existing.cnic) {
    const owner = await db.guardian.findUnique({ where: { schoolId_cnic: { schoolId, cnic } } });
    if (owner && owner.id !== existing.id) {
      throw new BadRequestException(`This CNIC already belongs to ${label(owner)}. Check the CNIC and phone number.`);
    }
  }
  return db.guardian.update({
    where: { id: existing.id },
    data: {
      name: data.name || existing.name,
      relation: data.relation || existing.relation,
      cnic: cnic ?? existing.cnic,
      email: data.email || existing.email,
      extra: (data.extra ?? existing.extra ?? {}) as Prisma.InputJsonValue,
    },
  });
}
