import { Module } from "@nestjs/common";
import { AcademicYearsController } from "./academic-years.controller";
import { AcademicYearsService } from "./academic-years.service";
import { RolloverService } from "./rollover.service";

@Module({
  controllers: [AcademicYearsController],
  providers: [AcademicYearsService, RolloverService],
  exports: [AcademicYearsService],
})
export class AcademicYearsModule {}
