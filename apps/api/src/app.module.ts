import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { join } from "path";
import { AdminModule } from "./admin/admin.module";
import { AiModule } from "./ai/ai.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { AuthModule } from "./auth/auth.module";
import { ClaimsModule } from "./claims/claims.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { FeesModule } from "./fees/fees.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SchoolsModule } from "./schools/schools.module";
import { SetupModule } from "./setup/setup.module";
import { StaffModule } from "./staff/staff.module";
import { StudentsModule } from "./students/students.module";
import { TimetableModule } from "./timetable/timetable.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, "../.env"), join(__dirname, "../../../.env")],
    }),
    PrismaModule,
    AuthModule,
    SchoolsModule,
    StudentsModule,
    AttendanceModule,
    FeesModule,
    DashboardModule,
    SetupModule,
    StaffModule,
    ClaimsModule,
    AdminModule,
    TimetableModule,
    AiModule,
  ],
})
export class AppModule {}
