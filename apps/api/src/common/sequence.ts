import type { Prisma } from "@prisma/client";

export async function nextSchoolNumber(
  tx: Prisma.TransactionClient,
  schoolId: string,
  kind: "ADM" | "APP" | "INV" | "PAY" | "REC",
  year = new Date().getFullYear(),
) {
  const pad = kind === "APP" || kind === "INV" || kind === "PAY" || kind === "REC" ? 6 : 4;
  const row = await tx.schoolSequence.upsert({
    where: { schoolId_kind_year: { schoolId, kind, year } },
    create: { schoolId, kind, year, value: 1 },
    update: { value: { increment: 1 } },
  });
  return `${kind}-${year}-${String(row.value).padStart(pad, "0")}`;
}
