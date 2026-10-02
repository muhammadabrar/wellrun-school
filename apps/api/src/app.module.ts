import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { join } from "path";
import { AcademicYearsModule } from "./academic-years/academic-years.module";
import { AdminModule } from "./admin/admin.module";
import { AiModule } from "./ai/ai.module";
import { AdmissionsModule } from "./admissions/admissions.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { AuthModule } from "./auth/auth.module";
import { ClaimsModule } from "./claims/claims.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { DiaryModule } from "./diary/diary.module";
import { ExamsModule } from "./exams/exams.module";
import { FeesModule } from "./fees/fees.module";
import { HealthController } from "./health.controller";
import { NoticesModule } from "./notices/notices.module";
import { ParentModule } from "./parent/parent.module";
import { PayrollModule } from "./payroll/payroll.module";
import { QuestionPapersModule } from "./question-papers/question-papers.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SchoolsModule } from "./schools/schools.module";
import { SessionModule } from "./session/session.module";
import { SetupModule } from "./setup/setup.module";
import { StaffModule } from "./staff/staff.module";
import { StudentsModule } from "./students/students.module";
import { SyllabusModule } from "./syllabus/syllabus.module";
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
    ScheduleModule.forRoot(),
    PrismaModule,
    SessionModule,
    AuthModule,
    SchoolsModule,
    StudentsModule,
    AdmissionsModule,
    AttendanceModule,
    AcademicYearsModule,
    FeesModule,
    DashboardModule,
    SetupModule,
    StaffModule,
    ExamsModule,
    SyllabusModule,
    QuestionPapersModule,
    DiaryModule,
    NoticesModule,
    ParentModule,
    PayrollModule,
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
