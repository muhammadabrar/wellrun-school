import type { ReportColumn, ReportResult, ReportRow } from "@wellrun/shared";
import { formatCell } from "@/lib/report-format";

/** A bar for each row of one column. Meant for a few dozen rows at most: classes, months, age groups. */
export function BarList({ result }: { result: ReportResult }) {
  const chart = result.chart;
  if (!chart || !result.rows.length) return null;
  const values = result.rows.map((r) => (typeof r[chart.valueKey] === "number" ? (r[chart.valueKey] as number) : 0));
  const max = chart.format === "pct" ? 100 : Math.max(1, ...values);
  const column = result.columns.find((c) => c.key === chart.valueKey);
  return (
    <ul className="flex flex-col gap-2.5" aria-label={column?.label}>
      {result.rows.map((row, i) => {
        const value = values[i]!;
        return (
          <li key={i} className="grid grid-cols-[minmax(7rem,12rem)_1fr_6.5rem] items-center gap-3 text-sm" title={`${row[chart.labelKey]}: ${formatCell(row[chart.valueKey], chart.format)}`}>
            <span className="truncate">{String(row[chart.labelKey] ?? "")}</span>
            <div className="h-3 rounded-full bg-paper">
              <div className="h-full rounded-full bg-indigo" style={{ width: `${Math.max(value > 0 ? 1.5 : 0, Math.min(100, (value / max) * 100))}%` }} />
            </div>
            <span className="text-right tabular-nums text-muted-foreground">{formatCell(row[chart.valueKey], chart.format)}</span>
          </li>
        );
      })}
    </ul>
  );
}

const align = (column: ReportColumn) => (column.align === "end" ? "text-right tabular-nums" : "text-left");

export function ReportTable({ columns, rows, totals, caption }: { columns: ReportColumn[]; rows: ReportRow[]; totals: ReportRow | null; caption: string }) {
  return (
    <div className="overflow-x-auto rounded-3xl bg-surface">
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-muted-foreground">
            {columns.map((column) => (
              <th key={column.key} scope="col" className={`px-4 py-3 font-medium ${align(column)}`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-2.5 ${align(column)}`}>
                  {formatCell(row[column.key], column.format)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {totals ? (
          <tfoot>
            <tr className="border-t-2 border-line bg-paper font-semibold">
              {columns.map((column) => (
                <td key={column.key} className={`px-4 py-3 ${align(column)}`}>
                  {totals[column.key] === undefined ? "" : formatCell(totals[column.key], column.format)}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
