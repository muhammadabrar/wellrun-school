import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller";
import { AttendanceService } from "./attendance.service";
import { RegisterService } from "./register.service";
import { AttendanceReportsService } from "./reports.service";
import { AttendanceSettingsService } from "./settings.service";

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceSettingsService, RegisterService, AttendanceReportsService],
  exports: [AttendanceReportsService],
})
export class AttendanceModule {}
