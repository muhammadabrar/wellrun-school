import { Inject, Injectable } from "@nestjs/common";
import type { LateFeeMode } from "@prisma/client";
import type { FeeSettingsInput } from "@wellrun/shared";
import { audit } from "../common/audit";
import { encryptSecret } from "../common/crypto";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class FeeSettingsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async get(schoolId: string) {
    const settings = await this.prisma.schoolFeeSettings.upsert({
      where: { schoolId },
      create: { schoolId },
      update: {},
    });
    const school = await this.prisma.school.findUniqueOrThrow({
      where: { id: schoolId },
      select: { taxNumber: true, ntn: true, strn: true, primaryColor: true, name: true },
    });
    return {
      ...settings,
      taxNumber: school.taxNumber,
      ntn: school.ntn,
      strn: school.strn,
      primaryColor: school.primaryColor,
      fbrCredentialsSet: Boolean(settings.fbrCredentialsEnc),
      fbrCredentialsEnc: undefined,
    };
  }

  async update(schoolId: string, actorId: string, input: FeeSettingsInput) {
    const existing = await this.prisma.schoolFeeSettings.upsert({
      where: { schoolId },
      create: { schoolId },
      update: {},
    });
    const settings = await this.prisma.schoolFeeSettings.update({
      where: { schoolId },
      data: {
        defaultDueDay: input.defaultDueDay ?? existing.defaultDueDay,
        graceDays: input.graceDays ?? existing.graceDays,
        lateFeeMode: (input.lateFeeMode ?? existing.lateFeeMode) as LateFeeMode,
        lateFeeAmountPkr: input.lateFeeAmountPkr ?? existing.lateFeeAmountPkr,
        lateFeePercent: input.lateFeePercent ?? existing.lateFeePercent,
        lateFeeCapPkr: input.lateFeeCapPkr ?? existing.lateFeeCapPkr,
        invoicePrefix: input.invoicePrefix ?? existing.invoicePrefix,
        paymentPrefix: input.paymentPrefix ?? existing.paymentPrefix,
        receiptPrefix: input.receiptPrefix ?? existing.receiptPrefix,
        receiptHeader: input.receiptHeader ?? existing.receiptHeader,
        receiptFooter: input.receiptFooter ?? existing.receiptFooter,
        showTaxOnReceipt: input.showTaxOnReceipt ?? existing.showTaxOnReceipt,
        fbrEnabled: input.fbrEnabled ?? existing.fbrEnabled,
        fbrEnvironment: input.fbrEnvironment ?? existing.fbrEnvironment,
        fbrCredentialsEnc: input.fbrCredentials ? encryptSecret(input.fbrCredentials) : existing.fbrCredentialsEnc,
      },
    });
    await this.prisma.school.update({
      where: { id: schoolId },
      data: {
        taxNumber: input.taxNumber ?? undefined,
        ntn: input.ntn ?? undefined,
        strn: input.strn ?? undefined,
        primaryColor: input.primaryColor ?? undefined,
      },
    });
    await audit(this.prisma, {
      schoolId,
      actorId,
      action: "fee_settings_updated",
      entity: "school_fee_settings",
      entityId: settings.id,
    });
    return this.get(schoolId);
  }
}
