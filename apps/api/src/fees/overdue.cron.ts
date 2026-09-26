import { Inject, Injectable, Logger, type OnApplicationBootstrap } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { PrismaService } from "../prisma/prisma.service";

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Flips unpaid invoices past their due date to OVERDUE so dashboards and lists show what needs chasing. */
@Injectable()
export class OverdueInvoiceCron implements OnApplicationBootstrap {
  private readonly logger = new Logger(OverdueInvoiceCron.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  onApplicationBootstrap() {
    void this.run().catch((error) => this.logger.warn(`Overdue sweep failed: ${error instanceof Error ? error.message : error}`));
  }

  @Cron("15 3 * * *")
  async run() {
    const result = await this.prisma.invoice.updateMany({
      where: { status: "ISSUED", dueOn: { lt: startOfToday() }, balanceAmountPkr: { gt: 0 } },
      data: { status: "OVERDUE" },
    });
    if (result.count) this.logger.log(`Marked ${result.count} invoice(s) overdue`);
  }
}
