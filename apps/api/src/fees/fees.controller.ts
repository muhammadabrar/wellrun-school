import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import {
  applyCreditSchema,
  applyFeeCatalogSchema,
  cancelInvoiceSchema,
  createPaymentSchema,
  discountSchema,
  feeHeadSchema,
  feeSettingsSchema,
  feeStructureSchema,
  generateFeesSchema,
  generateRemainingForStudentSchema,
  studentDiscountSchema,
  studentFeeAssignmentSchema,
} from "@wellrun/shared";
import { AuthGuard } from "../auth/auth.guard";
import type { CurrentUser } from "../common/current-user";
import type { SchoolScope } from "../common/school-scope";
import { assertFeeAccess } from "./access";
import { FeeAssignmentService } from "./assignment.service";
import { FeeCatalogService } from "./catalog.service";
import { ChallanService } from "./challan.service";
import { FeeCreditService } from "./credit.service";
import { FbrInvoiceService } from "./fbr.service";
import { FeeGenerationService } from "./generation.service";
import { currentBillingPeriod } from "./json";
import { FeePaymentService, type InvoiceListQuery } from "./payment.service";
import { FeeReceiptService } from "./receipt.service";
import { FeeReportService } from "./report.service";
import { FeeSettingsService } from "./settings.service";

@Controller("console")
@UseGuards(AuthGuard)
export class FeesController {
  constructor(
    @Inject(FeeCatalogService) private readonly catalog: FeeCatalogService,
    @Inject(FeeAssignmentService) private readonly assignments: FeeAssignmentService,
    @Inject(FeeGenerationService) private readonly generation: FeeGenerationService,
    @Inject(FeePaymentService) private readonly payments: FeePaymentService,
    @Inject(FeeCreditService) private readonly credits: FeeCreditService,
    @Inject(FeeReceiptService) private readonly receipts: FeeReceiptService,
    @Inject(ChallanService) private readonly challans: ChallanService,
    @Inject(FeeReportService) private readonly reports: FeeReportService,
    @Inject(FeeSettingsService) private readonly settings: FeeSettingsService,
    @Inject(FbrInvoiceService) private readonly fbr: FbrInvoiceService,
  ) {}

  @Get("invoices")
  invoices(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }, @Query() query: { status?: string; q?: string }) {
    return this.payments.invoices(assertFeeAccess(req.user, "fees.view"), req.schoolScope, query);
  }

  @Post("payments")
  pay(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.payments.pay(assertFeeAccess(req.user, "fees.collect"), req.user.id, createPaymentSchema.parse(body));
  }

  @Get("payments/:id")
  receipt(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.receipts.byPayment(assertFeeAccess(req.user, "fees.receipt.view"), id);
  }

  @Get("fees/dashboard")
  dashboard(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }) {
    return this.reports.dashboard(assertFeeAccess(req.user, "fees.view"), req.schoolScope);
  }

  @Get("fees/heads")
  heads(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }) {
    return this.catalog.heads(assertFeeAccess(req.user, "fees.view"), req.schoolScope);
  }

  @Post("fees/heads")
  createHead(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.catalog.createHead(assertFeeAccess(req.user, "fees.create"), req.user.id, feeHeadSchema.parse(body));
  }

  @Patch("fees/heads/:id")
  updateHead(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.catalog.updateHead(assertFeeAccess(req.user, "fees.update"), req.user.id, id, feeHeadSchema.partial().parse(body));
  }

  @Delete("fees/heads/:id")
  archiveHead(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.catalog.archiveHead(assertFeeAccess(req.user, "fees.delete"), req.user.id, id);
  }

  @Get("fees/structures")
  structures(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }) {
    return this.catalog.structures(assertFeeAccess(req.user, "fees.view"), req.schoolScope);
  }

  @Post("fees/structures/apply-catalog")
  applyCatalog(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.catalog.applyCatalogToClasses(assertFeeAccess(req.user, "fees.update"), req.user.id, applyFeeCatalogSchema.parse(body));
  }

  @Get("fees/structures/:id")
  structure(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.catalog.structure(assertFeeAccess(req.user, "fees.view"), id);
  }

  @Post("fees/structures")
  createStructure(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.catalog.createStructure(assertFeeAccess(req.user, "fees.create"), req.user.id, feeStructureSchema.parse(body));
  }

  @Patch("fees/structures/:id")
  updateStructure(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.catalog.updateStructure(assertFeeAccess(req.user, "fees.update"), req.user.id, id, feeStructureSchema.partial().parse(body));
  }

  @Get("fees/assignments")
  listAssignments(@Req() req: { user: CurrentUser }, @Query("studentId") studentId?: string) {
    return this.assignments.list(assertFeeAccess(req.user, "fees.view"), studentId);
  }

  @Post("fees/assignments")
  assign(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.assignments.assign(assertFeeAccess(req.user, "fees.update"), req.user.id, studentFeeAssignmentSchema.parse(body));
  }

  @Patch("fees/assignments/:id")
  updateAssignment(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.assignments.updateOverrides(assertFeeAccess(req.user, "fees.update"), req.user.id, id, studentFeeAssignmentSchema.partial().parse(body));
  }

  @Get("fees/discounts")
  discounts(@Req() req: { user: CurrentUser }) {
    return this.assignments.discounts(assertFeeAccess(req.user, "fees.view"));
  }

  @Post("fees/discounts")
  createDiscount(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.assignments.createDiscount(assertFeeAccess(req.user, "fees.update"), req.user.id, discountSchema.parse(body));
  }

  @Patch("fees/discounts/:id")
  updateDiscount(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.assignments.updateDiscount(assertFeeAccess(req.user, "fees.update"), req.user.id, id, discountSchema.partial().parse(body));
  }

  @Get("fees/student-discounts")
  studentDiscounts(@Req() req: { user: CurrentUser }, @Query("studentId") studentId?: string) {
    return this.assignments.studentDiscounts(assertFeeAccess(req.user, "fees.view"), studentId);
  }

  @Post("fees/student-discounts")
  assignDiscount(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.assignments.assignDiscount(assertFeeAccess(req.user, "fees.update"), req.user.id, studentDiscountSchema.parse(body));
  }

  @Post("fees/generate/preview")
  preview(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }, @Body() body: unknown) {
    return this.generation.preview(assertFeeAccess(req.user, "fees.generate"), generateFeesSchema.parse(body), req.schoolScope);
  }

  @Post("fees/generate")
  generate(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }, @Body() body: unknown) {
    return this.generation.generate(assertFeeAccess(req.user, "fees.generate"), req.user.id, generateFeesSchema.parse(body), req.schoolScope);
  }

  @Post("fees/students/:studentId/generate-remaining")
  generateRemainingForStudent(@Req() req: { user: CurrentUser }, @Param("studentId") studentId: string, @Body() body: unknown) {
    const { academicYearId } = generateRemainingForStudentSchema.parse(body);
    return this.generation.generateRemainingForStudent(assertFeeAccess(req.user, "fees.generate"), studentId, academicYearId);
  }

  @Post("fees/students/:studentId/generate-current")
  generateCurrentForStudent(@Req() req: { user: CurrentUser }, @Param("studentId") studentId: string, @Body() body: unknown) {
    const { academicYearId } = generateRemainingForStudentSchema.parse(body);
    const schoolId = assertFeeAccess(req.user, "fees.generate");
    return this.generation.generateForAssignment(schoolId, studentId, academicYearId, currentBillingPeriod());
  }

  @Get("fees/invoices")
  feeInvoices(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }, @Query() query: InvoiceListQuery) {
    return this.payments.invoices(assertFeeAccess(req.user, "fees.view"), req.schoolScope, query);
  }

  @Get("fees/invoices/:id")
  feeInvoice(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.payments.invoice(assertFeeAccess(req.user, "fees.view"), id);
  }

  @Post("fees/invoices/:id/cancel")
  cancelInvoice(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Body() body: unknown) {
    return this.payments.cancelInvoice(assertFeeAccess(req.user, "fees.void"), req.user.id, id, cancelInvoiceSchema.parse(body ?? {}).notes);
  }

  @Get("fees/payments")
  listPayments(@Req() req: { user: CurrentUser; schoolScope?: SchoolScope }, @Query() query: { studentId?: string; q?: string }) {
    return this.payments.payments(assertFeeAccess(req.user, "fees.view"), req.schoolScope, query);
  }

  @Post("fees/payments")
  collect(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.payments.pay(assertFeeAccess(req.user, "fees.collect"), req.user.id, createPaymentSchema.parse(body));
  }

  @Post("fees/payments/:id/void")
  voidPayment(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.payments.voidPayment(assertFeeAccess(req.user, "fees.void"), req.user.id, id, "VOIDED");
  }

  @Post("fees/payments/:id/refund")
  refundPayment(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.payments.voidPayment(assertFeeAccess(req.user, "fees.refund"), req.user.id, id, "REFUNDED");
  }

  @Get("fees/receipts")
  listReceipts(@Req() req: { user: CurrentUser }) {
    return this.receipts.list(assertFeeAccess(req.user, "fees.receipt.view"));
  }

  @Get("fees/receipts/:id")
  receiptDetail(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.receipts.detail(assertFeeAccess(req.user, "fees.receipt.view"), id);
  }

  @Get("fees/receipts/:id/pdf")
  receiptPdf(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Res() res: Response) {
    return this.receipts.pdf(assertFeeAccess(req.user, "fees.receipt.print"), id, res);
  }

  @Get("fees/invoices/:id/challan")
  challanPdf(@Req() req: { user: CurrentUser }, @Param("id") id: string, @Res() res: Response) {
    return this.challans.pdf(assertFeeAccess(req.user, "fees.receipt.print"), id, res);
  }

  @Get("fees/credits")
  listCredits(@Req() req: { user: CurrentUser }, @Query("studentId") studentId?: string) {
    return this.credits.list(assertFeeAccess(req.user, "fees.view"), studentId);
  }

  @Post("fees/credits/apply")
  applyCredit(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.credits.apply(assertFeeAccess(req.user, "fees.collect"), req.user.id, applyCreditSchema.parse(body));
  }

  @Get("fees/outstanding")
  outstanding(
    @Req() req: { user: CurrentUser; schoolScope?: SchoolScope },
    @Query() query: { className?: string; section?: string },
  ) {
    return this.reports.outstanding(assertFeeAccess(req.user, "fees.view"), req.schoolScope, query);
  }

  @Get("fees/reports")
  report(
    @Req() req: { user: CurrentUser; schoolScope?: SchoolScope },
    @Query() query: { from?: string; to?: string; className?: string; section?: string; feeHeadId?: string; method?: string },
  ) {
    return this.reports.reports(assertFeeAccess(req.user, "fees.report.view"), req.schoolScope, query);
  }

  @Get("fees/settings")
  getSettings(@Req() req: { user: CurrentUser }) {
    return this.settings.get(assertFeeAccess(req.user, "fees.settings.manage"));
  }

  @Patch("fees/settings")
  updateSettings(@Req() req: { user: CurrentUser }, @Body() body: unknown) {
    return this.settings.update(assertFeeAccess(req.user, "fees.settings.manage"), req.user.id, feeSettingsSchema.parse(body));
  }

  @Get("fees/students/:id/ledger")
  studentLedger(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.reports.studentLedger(assertFeeAccess(req.user, "fees.view"), id);
  }

  @Post("fees/invoices/:id/fbr/submit")
  fbrSubmit(@Req() req: { user: CurrentUser }, @Param("id") id: string) {
    return this.fbr.submitInvoice(assertFeeAccess(req.user, "fees.settings.manage"), id);
  }
}
