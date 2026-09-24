import { Module } from "@nestjs/common";
import { FeeAssignmentService } from "./assignment.service";
import { FeeCatalogService } from "./catalog.service";
import { FeeCreditService } from "./credit.service";
import { FbrInvoiceService } from "./fbr.service";
import { FeesController } from "./fees.controller";
import { FeesService } from "./fees.service";
import { FeeGenerationService } from "./generation.service";
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
    FeePaymentService,
    FeeCreditService,
    FeeReceiptService,
    FeeReportService,
    FeeSettingsService,
    FbrInvoiceService,
  ],
  exports: [FeesService, FeeGenerationService, FeeAssignmentService, FeeCatalogService],
})
export class FeesModule {}
