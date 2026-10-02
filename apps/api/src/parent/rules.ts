import { eachDay, holidayOn, monthBounds, weekdayOf, type AttendanceStatus, type HolidayRange, type ParentAttendanceDay } from "@wellrun/shared";

/** One entry per day of the month. A marked day always shows its mark; an unmarked weekend or holiday is "OFF". */
export function monthDays(
  month: string,
  records: { date: string; status: AttendanceStatus }[],
  holidays: HolidayRange[],
  workingWeekdays: number[],
): ParentAttendanceDay[] {
  const { from, to } = monthBounds(month);
  const marked = new Map(records.map((row) => [row.date, row.status]));
  return eachDay(from, to).map((date) => {
    const holiday = holidayOn(date, holidays)?.name ?? null;
    const status = marked.get(date);
    if (status) return { date, status, holiday };
    const working = workingWeekdays.includes(weekdayOf(date)) && !holiday;
    return { date, status: working ? null : "OFF", holiday };
  });
}

const OPEN = new Set(["ISSUED", "PARTIALLY_PAID", "OVERDUE"]);

/** What a family owes right now, from their invoices. Cancelled and draft invoices never count. */
export function duesSummary(invoices: { balancePkr: number; dueOn: string; status: string }[], today: string) {
  const open = invoices.filter((row) => OPEN.has(row.status) && row.balancePkr > 0);
  const dueTotalPkr = open.reduce((sum, row) => sum + row.balancePkr, 0);
  const dates = open.map((row) => row.dueOn).sort();
  return {
    dueTotalPkr,
    openCount: open.length,
    overdueCount: open.filter((row) => row.dueOn < today).length,
    nextDueOn: dates[0] ?? null,
  };
}

/** A month input from the app is YYYY-MM; anything else falls back to the current month. */
export function monthOrCurrent(input: string | undefined, today: string) {
  return input && /^\d{4}-(0[1-9]|1[0-2])$/.test(input) ? input : today.slice(0, 7);
}
