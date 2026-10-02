import type { ReportCell, ReportColumn, ReportResult } from "@wellrun/shared";
import type { Cell } from "./export";
import { pkr } from "./format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** 2026-10-05 as 5 Oct 2026, without a time zone shifting it a day. */
export function formatReportDate(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return match ? `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]} ${match[1]}` : iso;
}

/** A cell as the screen shows it. Empty is a dash, never "null" or "NaN". */
export function formatCell(value: ReportCell | undefined, format: ReportColumn["format"]) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return format === "date" ? formatReportDate(value) : value;
  switch (format) {
    case "pkr":
      return pkr(value);
    case "pct":
      return `${value}%`;
    case "decimal":
      return value.toLocaleString("en-PK", { maximumFractionDigits: 1 });
    case "int":
      return value.toLocaleString("en-PK");
    default:
      return String(value);
  }
}

/** The header, rows and totals as a grid for Excel or CSV. Numbers stay numbers so they can be summed. */
export function reportMatrix(result: ReportResult, withTitle: boolean): Cell[][] {
  const header = result.columns.map((c) => (c.format === "pkr" ? `${c.label} (Rs.)` : c.format === "pct" ? `${c.label} (%)` : c.label));
  const row = (r: Record<string, ReportCell>) => result.columns.map((c) => r[c.key] ?? "");
  const lines: Cell[][] = [header, ...result.rows.map(row)];
  if (result.totals) lines.push(row(result.totals));
  return withTitle ? [[result.title], [result.subtitle], [], ...lines] : lines;
}

export function reportFileName(result: ReportResult) {
  return `${result.title} - ${result.subtitle}`.slice(0, 80);
}
