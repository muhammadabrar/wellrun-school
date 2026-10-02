import { Module } from "@nestjs/common";
import { StaffService } from "../staff/staff.service";
import { PayrollController, PortalController } from "./payroll.controller";
import { PayrollService } from "./payroll.service";

@Module({
  controllers: [PayrollController, PortalController],
  providers: [PayrollService, StaffService],
  exports: [PayrollService],
})
export class PayrollModule {}
