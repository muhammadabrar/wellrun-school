import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";
import { FeeGenerationService } from "./generation.service";
import { currentBillingPeriod } from "./json";

/**
 * Opt-in (SchoolFeeSettings.autoGenerateEnabled) daily invoice generation. A daily no-op-most-days
 * check is deliberately simpler and more robust than firing exactly once on a computed date: the
 * generation service's per-row skip-on-conflict + student+period uniqueness (see the
 * `fee_generation_fixes` migration) make every day after the first successful run of a period a
 * clean no-op, so no separate "have I run this month" bookkeeping is needed.
 */
@Injectable()
export class FeeGenerationCronService {
  private readonly logger = new Logger(FeeGenerationCronService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(FeeGenerationService) private readonly generation: FeeGenerationService,
  ) {}

  @Cron("0 3 * * *")
  async run() {
    const settings = await this.prisma.schoolFeeSettings.findMany({
      where: { autoGenerateEnabled: true },
      select: { schoolId: true },
    });
    for (const { schoolId } of settings) {
      try {
        await this.generateForSchool(schoolId);
      } catch (error) {
        this.logger.error(`Auto-generation failed for school ${schoolId}`, error instanceof Error ? error.stack : error);
      }
    }
  }

  private async generateForSchool(schoolId: string) {
    const year = await this.prisma.academicYear.findFirst({ where: { schoolId, current: true } });
    if (!year) return;
    const billingPeriod = currentBillingPeriod();
    const result = await this.generation.generate(schoolId, null, { billingPeriod, academicYearId: year.id, confirm: true }, {}, { auto: true });
    if (result.created > 0) {
      this.logger.log(`Auto-generated ${result.created} invoice(s) for school ${schoolId}, period ${billingPeriod}`);
    }
  }
}
