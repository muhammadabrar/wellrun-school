import { Module } from "@nestjs/common";
import { StudentsController, ExamsController } from "./students.controller";
import { StudentsService } from "./students.service";

@Module({
  controllers: [StudentsController, ExamsController],
  providers: [StudentsService],
})
export class StudentsModule {}
