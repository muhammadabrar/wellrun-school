import { Module } from "@nestjs/common";
import { QuestionPapersController } from "./question-papers.controller";
import { QuestionPapersService } from "./question-papers.service";

@Module({
  controllers: [QuestionPapersController],
  providers: [QuestionPapersService],
})
export class QuestionPapersModule {}
