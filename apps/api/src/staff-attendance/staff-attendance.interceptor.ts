import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor } from "@nestjs/common";
import type { Observable } from "rxjs";
import { StaffAttendanceService } from "./staff-attendance.service";

/**
 * Runs after the sign-in guard on every request. The first request a staff member makes each day is their
 * check-in; it happens in the background so the request is never slowed down or failed by it.
 */
@Injectable()
export class StaffCheckInInterceptor implements NestInterceptor {
  constructor(@Inject(StaffAttendanceService) private readonly attendance: StaffAttendanceService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const user = context.switchToHttp().getRequest<{ user?: { id: string; email: string; schoolId: string | null; role: string } }>().user;
    if (user?.schoolId) void this.attendance.touch(user).catch(() => undefined);
    return next.handle();
  }
}
