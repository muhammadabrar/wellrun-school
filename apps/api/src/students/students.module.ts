import { Module } from "@nestjs/common";
import { FeesModule } from "../fees/fees.module";
import { StudentsController } from "./students.controller";
import { StudentsService } from "./students.service";

@Module({
  imports: [FeesModule],
  controllers: [StudentsController],
  providers: [StudentsService],
})
export class StudentsModule {}
