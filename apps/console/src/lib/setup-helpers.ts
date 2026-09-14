import { admissionFieldKey } from "@wellrun/shared";
import type { AdmissionField } from "./api";

export function nextSection(sections: string[]) {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  return letters.find((letter) => !sections.includes(letter)) ?? `S${sections.length + 1}`;
}

export function fieldFromLabel(label: string, required = false, group: "guardian" | "student" = "student"): AdmissionField {
  return { key: admissionFieldKey(label), label, type: "text", required, locked: false, group };
}

export async function parseImportFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  if (file.name.endsWith(".json")) {
    const rows = JSON.parse(await file.text()) as Record<string, unknown>[];
    const list = Array.isArray(rows) ? rows : [rows];
    const headers = [...new Set(list.flatMap((row) => Object.keys(row)))];
    return { headers, rows: list.map((row) => Object.fromEntries(headers.map((h) => [h, String(row[h] ?? "")]))) };
  }
  if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = book.Sheets[book.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return { headers, rows: rows.map((row) => Object.fromEntries(headers.map((h) => [h, String(row[h] ?? "")]))) };
  }
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = splitCsv(lines[0] ?? "");
  const rows = lines.slice(1).map((line) => {
    const cols = splitCsv(line);
    return Object.fromEntries(headers.map((header, i) => [header, cols[i] ?? ""]));
  });
  return { headers, rows };
}

function splitCsv(line: string) {
  return line.split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
}

export function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}
