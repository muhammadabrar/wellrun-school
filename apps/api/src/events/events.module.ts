import { Module } from "@nestjs/common";
import { ExamsModule } from "../exams/exams.module";
import { CalendarController, EventsController } from "./events.controller";
import { EventsService } from "./events.service";

@Module({
  imports: [ExamsModule],
  controllers: [CalendarController, EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
