import { Module } from "@nestjs/common";
import { ExamAnalyticsService } from "./analytics.service";
import { ExamAnalyticsController, ExamMarksController, ExamResultsController, ExamSettingsController, ExamsController } from "./exams.controller";
import { ExamsService } from "./exams.service";
import { MarksService } from "./marks.service";
import { ReportCardService } from "./report-card.service";
import { ResultsService } from "./results.service";
import { ExamSettingsService } from "./settings.service";

@Module({
  controllers: [ExamsController, ExamMarksController, ExamResultsController, ExamAnalyticsController, ExamSettingsController],
  providers: [ExamsService, MarksService, ResultsService, ReportCardService, ExamAnalyticsService, ExamSettingsService],
  exports: [ResultsService, ExamAnalyticsService, ReportCardService],
})
export class ExamsModule {}
