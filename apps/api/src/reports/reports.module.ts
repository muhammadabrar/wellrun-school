import { Module } from "@nestjs/common";
import { ExamsModule } from "../exams/exams.module";
import { StaffAttendanceModule } from "../staff-attendance/staff-attendance.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";

@Module({
  imports: [ExamsModule, StaffAttendanceModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
