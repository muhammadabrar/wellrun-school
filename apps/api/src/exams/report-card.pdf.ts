import { existsSync } from "node:fs";
import PDFDocument from "pdfkit";
import { BrandColors } from "../fees/pdf-brand";
import type { Band, SubjectLine } from "./results.engine";

export type ReportCardSchool = {
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  primaryColor?: string;
  logoPath?: string | null;
};

export type ReportCardTemplateOptions = {
  layout: string;
  showRank: boolean;
  showGpa: boolean;
  showAttendance: boolean;
  showRemarks: boolean;
  showGradeLegend: boolean;
  showBreakdown: boolean;
  headerNote: string;
  signatures: string[];
};

export type ReportCard = {
  title: string;
  yearName: string;
  student: { name: string; admissionNo: string; rollNo: string; className: string; guardian: string };
  scope: "EXAM" | "TERM" | "ANNUAL";
  subjects: SubjectLine[];
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  gpa: number | null;
  rank: number | null;
  classSize: number;
  passed: boolean;
  attendancePct: number | null;
  teacherRemark: string;
  principalRemark: string;
};

const INK = "#16161d";
const MUTED = "#6b6b76";
const LINE = "#d4d4dc";
const FAIL = "#c0392b";

function fmt(value: number | null | undefined) {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** One A4 page per student; many students render into one PDF for bulk printing. */
export async function renderReportCards(input: { school: ReportCardSchool; template: ReportCardTemplateOptions; bands: Band[]; cards: ReportCard[] }) {
  const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const accent = input.school.primaryColor || BrandColors.indigo;
  const compact = input.template.layout === "COMPACT";
  const modern = input.template.layout === "MODERN";
  const base = compact ? 9 : 10;

  for (const card of input.cards) {
    doc.addPage();
    const left = 40;
    const width = doc.page.width - 80;
    let y = 40;

    // Letterhead
    if (modern) {
      doc.rect(0, 0, doc.page.width, 96).fill(accent);
      y = 22;
    }
    let textX = left;
    if (input.school.logoPath && existsSync(input.school.logoPath)) {
      try {
        doc.image(input.school.logoPath, left, y, { fit: [54, 54] });
        textX = left + 66;
      } catch {
        textX = left;
      }
    }
    const headColor = modern ? "#ffffff" : INK;
    const subColor = modern ? "#e8e8ff" : "#55555f";
    doc.font("Helvetica-Bold").fontSize(17).fillColor(headColor).text(input.school.name.toUpperCase(), textX, y + 2, { width: width - (textX - left) });
    doc.font("Helvetica").fontSize(8.5).fillColor(subColor);
    const contact = [input.school.address, [input.school.phone && `Phone: ${input.school.phone}`, input.school.email].filter(Boolean).join("   ")].filter(Boolean);
    contact.forEach((line) => doc.text(line, textX, doc.y, { width: width - (textX - left) }));
    y = modern ? 108 : Math.max(doc.y, y + 58) + 8;
    if (!modern) {
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(1.5).strokeColor(accent).stroke();
      y += 10;
    }

    doc.font("Helvetica-Bold").fontSize(13).fillColor(INK).text(card.title.toUpperCase(), left, y, { width, align: "center" });
    doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(`Academic year ${card.yearName}`, left, doc.y + 2, { width, align: "center" });
    if (input.template.headerNote) doc.fontSize(8.5).text(input.template.headerNote, left, doc.y + 2, { width, align: "center" });
    y = doc.y + 12;

    // Student block
    const meta: [string, string][] = [
      ["Student", card.student.name],
      ["Admission no", card.student.admissionNo || "—"],
      ["Class", card.student.className],
      ["Roll no", card.student.rollNo || "—"],
    ];
    if (card.student.guardian) meta.push(["Guardian", card.student.guardian]);
    const col = width / 2;
    doc.roundedRect(left, y, width, Math.ceil(meta.length / 2) * 28 + 10, 6).lineWidth(0.8).strokeColor(LINE).stroke();
    let my = y + 8;
    meta.forEach(([label, value], i) => {
      const x = left + 12 + (i % 2) * col;
      if (i % 2 === 0 && i > 0) my += 28;
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x, my, { width: col - 24 });
      doc.font("Helvetica-Bold").fontSize(base + 0.5).fillColor(INK).text(value, x, my + 9, { width: col - 24 });
    });
    y += Math.ceil(meta.length / 2) * 28 + 22;

    // Marks table
    const byMarks = card.scope === "EXAM";
    const breakdown = input.template.showBreakdown && !byMarks;
    const partLabels = breakdown ? [...new Set(card.subjects.flatMap((s) => (s.parts ?? []).map((p) => p.label)))].slice(0, 4) : [];
    const columns: { label: string; w: number; align: "left" | "center" | "right" }[] = [
      { label: "Subject", w: 0, align: "left" },
      ...(byMarks
        ? [
            { label: "Max", w: 50, align: "center" as const },
            { label: "Pass", w: 50, align: "center" as const },
            { label: "Obtained", w: 64, align: "center" as const },
          ]
        : partLabels.map((l) => ({ label: l.length > 14 ? `${l.slice(0, 13)}…` : l, w: 64, align: "center" as const }))),
      { label: byMarks ? "%" : "Final %", w: 52, align: "center" },
      { label: "Grade", w: 46, align: "center" },
      { label: "Status", w: 54, align: "center" },
    ];
    const fixed = columns.reduce((s, c) => s + c.w, 0);
    columns[0].w = width - fixed;
    const rowH = compact ? 17 : 20;
    const drawRow = (cells: string[], opts: { head?: boolean; fill?: string; colors?: (string | undefined)[] } = {}) => {
      if (opts.fill) doc.rect(left, y, width, rowH).fill(opts.fill);
      let x = left;
      cells.forEach((cell, i) => {
        const c = columns[i];
        doc
          .font(opts.head || i === 0 ? "Helvetica-Bold" : "Helvetica")
          .fontSize(opts.head ? base - 1 : base)
          .fillColor(opts.colors?.[i] ?? INK)
          .text(cell, x + 6, y + (rowH - base) / 2, { width: c.w - 12, align: c.align, lineBreak: false, ellipsis: true });
        x += c.w;
      });
      y += rowH;
      doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.4).strokeColor(LINE).stroke();
    };
    drawRow(columns.map((c) => c.label), { head: true, fill: "#f1f1f5" });
    card.subjects.forEach((s) => {
      const status = s.pct == null ? (s.attendance === "ABSENT" ? "Absent" : s.attendance === "EXEMPT" ? "Exempt" : "—") : s.passed ? "Pass" : "Fail";
      const cells = byMarks
        ? [s.name, fmt(s.max || null), fmt(s.max ? (s.passPct * s.max) / 100 : null), s.attendance === "ABSENT" ? "Abs" : `${fmt(s.obtained)}${s.grace ? ` (+${fmt(s.grace)})` : ""}`, fmt(s.pct), s.grade || "—", status]
        : [s.name, ...partLabels.map((l) => fmt(s.parts?.find((p) => p.label === l)?.pct)), fmt(s.pct), s.grade || "—", status];
      const colors = cells.map((_, i) => (i === cells.length - 1 && status === "Fail" ? FAIL : undefined));
      drawRow(cells, { colors });
    });
    y += 12;

    // Summary tiles
    const tiles: [string, string][] = [
      ...(byMarks ? [["Total", `${fmt(card.totalObtained)} / ${fmt(card.totalMax)}`] as [string, string]] : []),
      [byMarks ? "Percentage" : "Overall", `${fmt(card.percentage)}%`],
      ["Grade", card.grade || "—"],
      ["Result", card.passed ? "PASS" : "FAIL"],
    ];
    const resultTile = tiles.findIndex(([label]) => label === "Result");
    if (input.template.showGpa && card.gpa != null) tiles.push(["GPA", card.gpa.toFixed(2)]);
    if (input.template.showRank && card.rank) tiles.push(["Position", `${ordinal(card.rank)} of ${card.classSize}`]);
    if (input.template.showAttendance && card.attendancePct != null) tiles.push(["Attendance", `${fmt(card.attendancePct)}%`]);
    const tileW = width / tiles.length;
    tiles.forEach(([label, value], i) => {
      const x = left + i * tileW;
      doc.roundedRect(x + 2, y, tileW - 4, 42, 6).fill(i === resultTile ? (card.passed ? "#e8f6ee" : "#fdecea") : "#f7f7f8");
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), x + 8, y + 7, { width: tileW - 16 });
      doc.font("Helvetica-Bold").fontSize(12).fillColor(i === resultTile ? (card.passed ? "#1e7a46" : FAIL) : INK).text(value, x + 8, y + 20, { width: tileW - 16 });
    });
    y += 56;

    // Remarks
    if (input.template.showRemarks) {
      const remarks: [string, string][] = [
        ["Class teacher's remarks", card.teacherRemark],
        ["Principal's remarks", card.principalRemark],
      ];
      remarks.forEach(([label, text]) => {
        doc.font("Helvetica-Bold").fontSize(8.5).fillColor(MUTED).text(label, left, y);
        doc.font("Helvetica").fontSize(base).fillColor(INK).text(text || " ", left, y + 11, { width });
        y = Math.max(doc.y, y + 22) + 8;
      });
    }

    // Grade legend
    if (input.template.showGradeLegend && input.bands.length) {
      const legend = input.bands.map((b) => (b.minPct > 0 ? `${b.grade} ${b.minPct}%+` : `${b.grade} below ${input.bands[input.bands.length - 2]?.minPct ?? 0}%`));
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(`Grading: ${legend.join("   ")}`, left, y, { width });
      y = doc.y + 8;
    }

    // Signatures pinned to the bottom of the page
    const sigY = doc.page.height - 80;
    const sigs = input.template.signatures.length ? input.template.signatures : ["Class teacher", "Principal"];
    const sigW = width / sigs.length;
    sigs.forEach((label, i) => {
      const x = left + i * sigW + 14;
      doc.moveTo(x, sigY).lineTo(x + sigW - 28, sigY).lineWidth(0.5).strokeColor("#9494a0").stroke();
      doc.font("Helvetica").fontSize(8.5).fillColor(MUTED).text(label, x, sigY + 4, { width: sigW - 28, align: "center" });
    });
  }
  if (!input.cards.length) {
    doc.addPage();
    doc.font("Helvetica").fontSize(12).fillColor(MUTED).text("No results to print.", 40, 80);
  }
  doc.end();
  return done;
}
