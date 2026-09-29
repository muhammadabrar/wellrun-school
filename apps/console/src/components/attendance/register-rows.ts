import type { MonthRegister } from "@wellrun/shared";
import type { Cell } from "@/lib/export";
import { markCode } from "./attendance-ui";

/** Header + one row per student + a daily-present footer: shared by Excel, CSV and the Reports page. */
export function registerRows(reg: Pick<MonthRegister, "days" | "students" | "marks" | "dailyPresent">): Cell[][] {
  const header: Cell[] = ["Roll", "Adm. no", "Student", ...reg.days.map((d) => Number(d.date.slice(8))), "P", "A", "L", "Lv", "E", "%"];
  const rows = reg.students.map((s) => [
    s.rollNo ?? "",
    s.admissionNo,
    s.name,
    ...reg.days.map((d) => (d.holiday ? "H" : !d.working && !reg.marks[s.id]?.[d.date] ? "-" : markCode(reg.marks[s.id]?.[d.date]))),
    s.counts.PRESENT,
    s.counts.ABSENT,
    s.counts.LATE,
    s.counts.LEAVE,
    s.counts.EXCUSED,
    s.pct ?? "",
  ]);
  const footer: Cell[] = ["", "", "Present", ...reg.days.map((d) => (d.working ? (reg.dailyPresent[d.date] ?? 0) : "")), "", "", "", "", "", ""];
  return [header, ...rows, footer];
}
