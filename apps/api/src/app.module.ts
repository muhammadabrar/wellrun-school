import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { join } from "path";
import { AdminModule } from "./admin/admin.module";
import { AiModule } from "./ai/ai.module";
import { AdmissionsModule } from "./admissions/admissions.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { AuthModule } from "./auth/auth.module";
import { ClaimsModule } from "./claims/claims.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { FeesModule } from "./fees/fees.module";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./prisma/prisma.module";
import { SchoolsModule } from "./schools/schools.module";
import { SessionModule } from "./session/session.module";
import { SetupModule } from "./setup/setup.module";
import { StaffModule } from "./staff/staff.module";
import { StudentsModule } from "./students/students.module";
import { TimetableModule } from "./timetable/timetable.module";
import { ScopeMiddleware } from "./common/scope.middleware";
import { TraceController } from "./trace/trace.controller";
import { TraceInterceptor } from "./trace/trace.interceptor";
import { TraceMiddleware } from "./trace/trace.middleware";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, "../.env"), join(__dirname, "../../../.env")],
    }),
    PrismaModule,
    SessionModule,
    AuthModule,
    SchoolsModule,
    StudentsModule,
    AdmissionsModule,
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
  controllers: [HealthController, TraceController],
  providers: [{ provide: APP_INTERCEPTOR, useClass: TraceInterceptor }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TraceMiddleware, ScopeMiddleware).forRoutes("*");
  }
}
