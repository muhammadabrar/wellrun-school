import { Module } from "@nestjs/common";
import { ExamsModule } from "../exams/exams.module";
import { FeesModule } from "../fees/fees.module";
import { ParentAuthService } from "./parent-auth.service";
import { ParentAuthController, ParentController } from "./parent.controller";
import { ParentGuard } from "./parent.guard";
import { ParentService } from "./parent.service";
import { ConsoleSmsSender, SMS_SENDER } from "./sms";

@Module({
  imports: [FeesModule, ExamsModule],
  controllers: [ParentAuthController, ParentController],
  providers: [ParentAuthService, ParentService, ParentGuard, { provide: SMS_SENDER, useClass: ConsoleSmsSender }],
})
export class ParentModule {}
