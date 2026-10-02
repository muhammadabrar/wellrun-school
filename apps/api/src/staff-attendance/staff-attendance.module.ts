import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { LeaveService } from "./leave.service";
import { LeaveController, StaffAttendanceController } from "./staff-attendance.controller";
import { StaffAttendanceCron } from "./staff-attendance.cron";
import { StaffCheckInInterceptor } from "./staff-attendance.interceptor";
import { StaffAttendanceService } from "./staff-attendance.service";

@Module({
  controllers: [StaffAttendanceController, LeaveController],
  providers: [StaffAttendanceService, LeaveService, StaffAttendanceCron, { provide: APP_INTERCEPTOR, useClass: StaffCheckInInterceptor }],
  exports: [StaffAttendanceService],
})
export class StaffAttendanceModule {}
