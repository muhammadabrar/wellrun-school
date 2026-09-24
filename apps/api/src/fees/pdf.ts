import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { BrandColors } from "./pdf-brand";

export async function renderReceiptPdf(input: {
  schoolName: string;
  schoolAddress?: string;
  taxNumber?: string;
  ntn?: string;
  strn?: string;
  primaryColor?: string;
  logoPath?: string | null;
  header?: string;
  footer?: string;
  receiptNumber: string;
  paymentDate: Date;
  studentName: string;
  admissionNo?: string;
  method: string;
  referenceNumber?: string;
  lines: { description: string; amountPkr: number }[];
  subtotalPkr: number;
  discountAmountPkr: number;
  lateFeeAmountPkr: number;
  taxAmountPkr: number;
  showTax: boolean;
  totalPkr: number;
  paidPkr: number;
  remainingPkr: number;
  fbr?: { number: string } | null;
}) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const accent = input.primaryColor || BrandColors.indigo;
  if (input.logoPath && existsSync(input.logoPath)) {
    try {
      doc.image(input.logoPath, 48, 48, { width: 72 });
    } catch {
      doc.fontSize(16).fillColor(accent).text(input.schoolName, 48, 48);
    }
    doc.fontSize(18).fillColor("#16161d").text(input.schoolName, 132, 52);
  } else {
    doc.fontSize(18).fillColor(accent).text(input.schoolName, 48, 48);
  }
  doc.fontSize(10).fillColor("#6b6b76");
  if (input.schoolAddress) doc.text(input.schoolAddress);
  if (input.taxNumber) doc.text(`Tax no. ${input.taxNumber}`);
  if (input.ntn) doc.text(`NTN ${input.ntn}`);
  if (input.strn) doc.text(`STRN ${input.strn}`);
  if (input.header) doc.moveDown(0.5).text(input.header);
  doc.moveDown();
  doc.fontSize(20).fillColor("#16161d").text("Receipt");
  doc.fontSize(11).fillColor("#16161d");
  doc.text(`Receipt ${input.receiptNumber}`);
  doc.text(`Date ${input.paymentDate.toLocaleDateString("en-PK")}`);
  doc.text(`Student ${input.studentName}${input.admissionNo ? ` (${input.admissionNo})` : ""}`);
  doc.text(`Method ${input.method}${input.referenceNumber ? ` · ${input.referenceNumber}` : ""}`);
  doc.moveDown();
  for (const line of input.lines) {
    doc.text(`${line.description}`, { continued: true });
    doc.text(formatPkr(line.amountPkr), { align: "right" });
  }
  doc.moveDown(0.5);
  row(doc, "Subtotal", input.subtotalPkr);
  if (input.discountAmountPkr) row(doc, "Discount", -input.discountAmountPkr);
  if (input.lateFeeAmountPkr) row(doc, "Late fee", input.lateFeeAmountPkr);
  if (input.showTax && input.taxAmountPkr) row(doc, "Tax", input.taxAmountPkr);
  doc.fontSize(13).text("Total", { continued: true });
  doc.text(formatPkr(input.totalPkr), { align: "right" });
  doc.fontSize(11).text("Paid", { continued: true });
  doc.text(formatPkr(input.paidPkr), { align: "right" });
  doc.text("Remaining", { continued: true });
  doc.text(formatPkr(input.remainingPkr), { align: "right" });
  if (input.fbr?.number) {
    doc.moveDown().text(`FBR invoice ${input.fbr.number}`);
  }
  if (input.footer) {
    doc.moveDown().fontSize(10).fillColor("#6b6b76").text(input.footer);
  }
  doc.end();
  return done;
}

function row(doc: PDFKit.PDFDocument, label: string, amount: number) {
  doc.fontSize(11).text(label, { continued: true });
  doc.text(formatPkr(amount), { align: "right" });
}

function formatPkr(amount: number) {
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

export function writePdfFile(schoolId: string, receiptNumber: string, bytes: Buffer) {
  const dir = join(process.cwd(), "uploads");
  mkdirSync(dir, { recursive: true });
  const name = `${schoolId}-receipt-${receiptNumber.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`;
  const path = join(dir, name);
  writeFileSync(path, bytes);
  return `/uploads/${name}`;
}

export function logoFilePath(url?: string | null) {
  if (!url) return null;
  if (url.startsWith("/uploads/")) {
    const path = join(process.cwd(), url.replace(/^\//, ""));
    return existsSync(path) ? path : null;
  }
  return null;
}

export function readUploadBytes(url: string) {
  const path = join(process.cwd(), url.replace(/^\//, ""));
  return existsSync(path) ? readFileSync(path) : null;
}
