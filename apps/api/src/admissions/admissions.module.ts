import { Module } from "@nestjs/common";
import { FeesModule } from "../fees/fees.module";
import { AdmissionsController } from "./admissions.controller";
import { AdmissionsService } from "./admissions.service";

@Module({
  imports: [FeesModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
