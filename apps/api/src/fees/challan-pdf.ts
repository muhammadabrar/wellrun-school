import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { BrandColors } from "./pdf-brand";

export interface ChallanStudentData {
  schoolName: string;
  campusName?: string;
  schoolAddress?: string;
  phone?: string;
  bankDetails?: string;
  primaryColor?: string;
  logoPath?: string | null;

  invoiceNumber: string;
  billingPeriod: string;
  issueDate: Date;
  dueOn: Date;

  studentName: string;
  guardianName?: string;
  admissionNo: string;
  rollNo?: string;
  className: string;
  section?: string;

  lines: { description: string; amountPkr: number }[];
  currentTotalPkr: number;
  arrearsPkr: number;
  totalPayableWithinDuePkr: number;
  lateFeePkr: number;
  totalPayableAfterDuePkr: number;
}

const COPY_TYPES = ["BANK COPY", "SCHOOL COPY", "STUDENT COPY"] as const;

export async function renderChallanDocument(students: ChallanStudentData[]): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 0,
    autoFirstPage: false,
  });

  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  for (const student of students) {
    doc.addPage({ size: "A4", layout: "landscape", margin: 0 });
    drawSingleStudentPage(doc, student);
  }

  doc.end();
  return done;
}

function drawSingleStudentPage(doc: PDFKit.PDFDocument, data: ChallanStudentData) {
  const pageWidth = 841.89;
  const pageHeight = 595.28;
  const marginX = 20;
  const marginY = 16;
  const gap = 16;
  const totalUsableWidth = pageWidth - marginX * 2;
  const colWidth = (totalUsableWidth - gap * 2) / 3;
  const accent = data.primaryColor || BrandColors.indigo;

  // Draw 3 copies side-by-side
  for (let i = 0; i < 3; i++) {
    const colX = marginX + i * (colWidth + gap);
    drawChallanColumn(doc, data, colX, marginY, colWidth, COPY_TYPES[i], accent);

    // Draw dashed vertical cutting line between copies
    if (i < 2) {
      const lineX = colX + colWidth + gap / 2;
      doc.save();
      doc.strokeColor("#b5b5c0").lineWidth(0.75).dash(4, { space: 4 });
      doc.moveTo(lineX, 10).lineTo(lineX, pageHeight - 10).stroke();
      doc.restore();
    }
  }
}

function drawChallanColumn(
  doc: PDFKit.PDFDocument,
  data: ChallanStudentData,
  x: number,
  y: number,
  width: number,
  copyLabel: string,
  accent: string,
) {
  let currY = y;
  const pad = 6;
  const innerWidth = width - pad * 2;
  const innerX = x + pad;

  // 1. Copy Badge (Centered at top)
  doc.save();
  doc.roundedRect(innerX + innerWidth / 2 - 50, currY, 100, 16, 3).fillAndStroke("#f0f0f4", "#d4d4dc");
  doc.fontSize(8).fillColor("#1e1e24").font("Helvetica-Bold").text(copyLabel, innerX, currY + 4, {
    width: innerWidth,
    align: "center",
  });
  doc.restore();
  currY += 20;

  // 2. School Header
  doc.fontSize(11).font("Helvetica-Bold").fillColor("#16161d").text(data.schoolName, innerX, currY, {
    width: innerWidth,
    align: "center",
  });
  currY += 13;

  const subHeader = [data.campusName, data.schoolAddress, data.phone].filter(Boolean).join(" · ");
  if (subHeader) {
    doc.fontSize(6.5).font("Helvetica").fillColor("#6b6b76").text(subHeader, innerX, currY, {
      width: innerWidth,
      align: "center",
    });
    currY += 10;
  }

  // 3. Bank / Deposit Instructions Box
  const bankText = data.bankDetails || "Fee deposit accepted at school accounts desk & designated bank branch.";
  doc.save();
  doc.roundedRect(innerX, currY, innerWidth, 24, 3).fillAndStroke("#f8f9fa", "#e4e5eb");
  doc.fontSize(6.5).font("Helvetica-Bold").fillColor("#3b3b45").text(bankText, innerX + 4, currY + 3, {
    width: innerWidth - 8,
    align: "center",
    lineGap: 1,
  });
  doc.restore();
  currY += 28;

  // 4. Challan & Invoice Metadata Grid
  doc.save();
  doc.rect(innerX, currY, innerWidth, 34).fillAndStroke("#ffffff", "#e4e5eb");
  const halfCol = innerWidth / 2;

  // Left col
  metaRow(doc, "Challan #:", data.invoiceNumber || "INV-NEW", innerX + 4, currY + 4, halfCol - 8);
  metaRow(doc, "Billing Period:", formatPeriod(data.billingPeriod), innerX + 4, currY + 18, halfCol - 8);

  // Right col
  metaRow(doc, "Issue Date:", formatDate(data.issueDate), innerX + halfCol + 4, currY + 4, halfCol - 8);
  metaRow(doc, "Due Date:", formatDate(data.dueOn), innerX + halfCol + 4, currY + 18, halfCol - 8, true);
  doc.restore();
  currY += 38;

  // 5. Student Information Box
  doc.save();
  doc.roundedRect(innerX, currY, innerWidth, 42, 3).fillAndStroke("#fdfdfe", "#d8d9e2");
  metaRow(doc, "Student:", data.studentName, innerX + 4, currY + 4, innerWidth - 8, true);
  if (data.guardianName) {
    metaRow(doc, "Father/Guardian:", data.guardianName, innerX + 4, currY + 16, innerWidth - 8);
  }
  const classSec = `${data.className}${data.section ? ` - ${data.section}` : ""}`;
  metaRow(doc, "Class & Section:", classSec, innerX + 4, currY + 28, halfCol - 6);
  metaRow(doc, "Adm # / Roll:", `${data.admissionNo}${data.rollNo ? ` / ${data.rollNo}` : ""}`, innerX + halfCol + 4, currY + 28, halfCol - 8);
  doc.restore();
  currY += 46;

  // 6. Fee Particulars Table
  doc.save();
  // Table Header
  doc.rect(innerX, currY, innerWidth, 14).fillAndStroke("#eef0f6", "#d4d6e2");
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#242430");
  doc.text("Fee Particulars", innerX + 6, currY + 3);
  doc.text("Amount (Rs.)", innerX + innerWidth - 70, currY + 3, { width: 64, align: "right" });
  currY += 15;

  // Line items
  const maxLines = 6;
  const visibleLines = data.lines.slice(0, maxLines);
  const remainingCount = data.lines.length - maxLines;

  let rowBg = false;
  for (const line of visibleLines) {
    doc.rect(innerX, currY, innerWidth, 13).fill(rowBg ? "#fafafc" : "#ffffff");
    doc.fontSize(7).font("Helvetica").fillColor("#2c2c36");
    doc.text(truncate(line.description, 32), innerX + 6, currY + 3);
    doc.text(line.amountPkr.toLocaleString("en-PK"), innerX + innerWidth - 70, currY + 3, {
      width: 64,
      align: "right",
    });
    currY += 13;
    rowBg = !rowBg;
  }

  if (remainingCount > 0) {
    doc.fontSize(6.5).font("Helvetica-Oblique").fillColor("#6b6b76");
    doc.text(`+ ${remainingCount} other fee items`, innerX + 6, currY + 2);
    currY += 11;
  }

  // Current Month Total line
  doc.moveTo(innerX, currY).lineTo(innerX + innerWidth, currY).strokeColor("#e0e0e8").stroke();
  doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#1e1e24");
  doc.text("Current Dues:", innerX + 6, currY + 3);
  doc.text(data.currentTotalPkr.toLocaleString("en-PK"), innerX + innerWidth - 70, currY + 3, {
    width: 64,
    align: "right",
  });
  currY += 14;

  // Arrears line if any
  if (data.arrearsPkr > 0) {
    doc.rect(innerX, currY, innerWidth, 14).fill("#fff7ed");
    doc.fontSize(7.5).font("Helvetica-Bold").fillColor("#9a3412");
    doc.text("Previous Arrears:", innerX + 6, currY + 3);
    doc.text(data.arrearsPkr.toLocaleString("en-PK"), innerX + innerWidth - 70, currY + 3, {
      width: 64,
      align: "right",
    });
    currY += 14;
  }

  // Total Payable within Due Date Box (Highlighted)
  doc.roundedRect(innerX, currY, innerWidth, 20, 3).fillAndStroke("#eef2ff", accent);
  doc.fontSize(8.5).font("Helvetica-Bold").fillColor(accent);
  doc.text("PAYABLE BY DUE DATE:", innerX + 6, currY + 5);
  doc.fontSize(9.5).text(`Rs. ${data.totalPayableWithinDuePkr.toLocaleString("en-PK")}`, innerX + innerWidth - 90, currY + 5, {
    width: 84,
    align: "right",
  });
  currY += 23;

  // Late fee + Payable After Due Date
  if (data.lateFeePkr > 0) {
    doc.roundedRect(innerX, currY, innerWidth, 18, 3).fillAndStroke("#fef2f2", "#fca5a5");
    doc.fontSize(7.5).font("Helvetica").fillColor("#991b1b");
    doc.text(`Late Surcharge: Rs. ${data.lateFeePkr.toLocaleString("en-PK")}`, innerX + 6, currY + 4);
    doc.font("Helvetica-Bold").text(
      `After Due: Rs. ${data.totalPayableAfterDuePkr.toLocaleString("en-PK")}`,
      innerX + innerWidth - 110,
      currY + 4,
      { width: 104, align: "right" },
    );
    currY += 21;
  }
  doc.restore();

  // 7. Instructions
  doc.save();
  doc.fontSize(6).font("Helvetica").fillColor("#71717a");
  doc.text("• Please pay by the due date and keep this stamped voucher safely.", innerX, currY, { width: innerWidth });
  currY += 14;
  doc.restore();

  // 8. Signatures Block (Pinned near bottom)
  const sigY = 535;
  doc.save();
  doc.strokeColor("#9494a0").lineWidth(0.5);
  const sigColWidth = innerWidth / 2 - 12;

  // Depositor Signature
  doc.moveTo(innerX + 4, sigY).lineTo(innerX + 4 + sigColWidth, sigY).stroke();
  doc.fontSize(6.5).font("Helvetica").fillColor("#646470").text("Depositor's Signature", innerX + 4, sigY + 3, {
    width: sigColWidth,
    align: "center",
  });

  // Bank Officer Signature & Stamp
  const rightSigX = innerX + innerWidth - sigColWidth - 4;
  doc.moveTo(rightSigX, sigY).lineTo(rightSigX + sigColWidth, sigY).stroke();
  doc.fontSize(6.5).font("Helvetica").fillColor("#646470").text("Authorized Bank / Cashier", rightSigX, sigY + 3, {
    width: sigColWidth,
    align: "center",
  });
  doc.restore();
}

function metaRow(
  doc: PDFKit.PDFDocument,
  label: string,
  value: string,
  x: number,
  y: number,
  width: number,
  boldValue = false,
) {
  doc.fontSize(6.5).font("Helvetica").fillColor("#6b6b76").text(`${label} `, x, y, { continued: true, width, lineBreak: false });
  doc.fontSize(7).font(boldValue ? "Helvetica-Bold" : "Helvetica").fillColor("#18181b").text(value, { lineBreak: false });
}

function formatPeriod(period: string): string {
  if (!period) return "";
  const [year, month] = period.split("-");
  if (!year || !month) return period;
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const mIndex = parseInt(month, 10) - 1;
  return `${monthNames[mIndex] ?? month} ${year}`;
}

function formatDate(date: Date): string {
  if (!date) return "";
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  return str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;
}

export function writeChallanPdfFile(schoolId: string, identifier: string, bytes: Buffer): string {
  const dir = join(process.cwd(), "uploads");
  mkdirSync(dir, { recursive: true });
  const name = `${schoolId}-challan-${identifier.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`;
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return `/uploads/${name}`;
}
