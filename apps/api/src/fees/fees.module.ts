import { Module } from "@nestjs/common";
import { FeeAssignmentService } from "./assignment.service";
import { FeeCatalogService } from "./catalog.service";
import { ChallanService } from "./challan.service";
import { FeeCreditService } from "./credit.service";
import { FbrInvoiceService } from "./fbr.service";
import { FeesController } from "./fees.controller";
import { FeesService } from "./fees.service";
import { FeeGenerationCronService } from "./generation.cron";
import { FeeGenerationService } from "./generation.service";
import { OverdueInvoiceCron } from "./overdue.cron";
import { FeePaymentService } from "./payment.service";
import { FeeReceiptService } from "./receipt.service";
import { FeeReportService } from "./report.service";
import { FeeSettingsService } from "./settings.service";

@Module({
  controllers: [FeesController],
  providers: [
    FeesService,
    FeeCatalogService,
    FeeAssignmentService,
    FeeGenerationService,
    FeeGenerationCronService,
    OverdueInvoiceCron,
    FeePaymentService,
    FeeCreditService,
    FeeReceiptService,
    ChallanService,
    FeeReportService,
    FeeSettingsService,
    FbrInvoiceService,
  ],
  exports: [FeesService, FeeGenerationService, FeeAssignmentService, FeeCatalogService, FeeReportService, ChallanService, FeeReceiptService],
})
export class FeesModule {}
