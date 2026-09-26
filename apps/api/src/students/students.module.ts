import { Module } from "@nestjs/common";
import { FeesModule } from "../fees/fees.module";
import { StudentsController, ExamsController } from "./students.controller";
import { StudentsService } from "./students.service";

@Module({
  imports: [FeesModule],
  controllers: [StudentsController, ExamsController],
  providers: [StudentsService],
})
export class StudentsModule {}
