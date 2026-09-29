export type Cell = string | number | null | undefined;
export type Sheet = { name: string; rows: Cell[][]; widths?: number[] };

const safeName = (name: string) => name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "_");

/** Excel workbook with one tab per sheet. SheetJS is loaded only when someone exports. */
export async function downloadXlsx(filename: string, sheets: Sheet[]) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows.map((row) => row.map((cell) => cell ?? "")));
    if (sheet.widths) ws["!cols"] = sheet.widths.map((wch) => ({ wch }));
    // Sheet names: max 31 chars, no []:*?/\
    XLSX.utils.book_append_sheet(wb, ws, sheet.name.replace(/[[\]:*?/\\]/g, " ").slice(0, 31));
  }
  XLSX.writeFile(wb, `${safeName(filename)}.xlsx`);
}

function csvCell(cell: Cell) {
  const text = cell == null ? "" : String(cell);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** UTF-8 CSV with a BOM so Excel opens Urdu names and symbols correctly. */
export function downloadCsv(filename: string, rows: Cell[][]) {
  const body = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿", body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName(filename)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
