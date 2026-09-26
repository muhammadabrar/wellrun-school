import type { Prisma } from "@prisma/client";

type Kind = "ADM" | "APP" | "INV" | "PAY" | "REC";

async function numberTaken(tx: Prisma.TransactionClient, schoolId: string, kind: Kind, value: string) {
  if (kind === "REC") return Boolean(await tx.payment.findFirst({ where: { schoolId, receiptNo: value }, select: { id: true } }));
  if (kind === "PAY") return Boolean(await tx.payment.findFirst({ where: { schoolId, paymentNumber: value }, select: { id: true } }));
  if (kind === "INV") return Boolean(await tx.invoice.findFirst({ where: { schoolId, invoiceNumber: value }, select: { id: true } }));
  return false;
}

export async function nextSchoolNumber(
  tx: Prisma.TransactionClient,
  schoolId: string,
  kind: Kind,
  year = new Date().getFullYear(),
  month?: number,
) {
  const pad = kind === "APP" || kind === "INV" || kind === "PAY" || kind === "REC" ? 6 : 4;
  const monthPart = month ? `-${String(month).padStart(2, "0")}` : "";
  // Imported or legacy records can already hold a number the counter hasn't reached yet — skip past them.
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const row = await tx.schoolSequence.upsert({
      where: { schoolId_kind_year: { schoolId, kind, year } },
      create: { schoolId, kind, year, value: 1 },
      update: { value: { increment: 1 } },
    });
    const candidate = `${kind}-${year}${monthPart}-${String(row.value).padStart(pad, "0")}`;
    if (!(await numberTaken(tx, schoolId, kind, candidate))) return candidate;
  }
  throw new Error(`Could not allocate a free ${kind} number`);
}
