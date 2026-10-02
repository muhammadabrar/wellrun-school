import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { addDays } from "@wellrun/shared";
import { karachiToday } from "../common/date";
import { PrismaService } from "../prisma/prisma.service";
import { StaffAttendanceService } from "./staff-attendance.service";

/** Shortly after midnight Pakistan time, saves an absent or on-leave row for anyone with no activity on the last few school days. */
@Injectable()
export class StaffAttendanceCron {
  private readonly logger = new Logger(StaffAttendanceCron.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StaffAttendanceService) private readonly attendance: StaffAttendanceService,
  ) {}

  @Cron("15 0 * * *", { timeZone: "Asia/Karachi" })
  async run() {
    const today = karachiToday();
    const schools = await this.prisma.school.findMany({ where: { deletedAt: null, l2Active: true }, select: { id: true } });
    for (const school of schools) {
      try {
        let saved = 0;
        // The last three days, so a day missed while the server was down is filled in the next night.
        for (const back of [1, 2, 3]) saved += await this.attendance.closeDay(school.id, addDays(today, -back));
        if (saved) this.logger.log(`School ${school.id}: saved ${saved} staff attendance row(s)`);
      } catch (error) {
        this.logger.warn(`School ${school.id}: ${error instanceof Error ? error.message : error}`);
      }
    }
  }
}
