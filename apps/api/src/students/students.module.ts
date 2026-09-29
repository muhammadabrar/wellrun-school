import { Module } from "@nestjs/common";
import { AttendanceModule } from "../attendance/attendance.module";
import { FeesModule } from "../fees/fees.module";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";

@Module({
  imports: [FeesModule, AttendanceModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
