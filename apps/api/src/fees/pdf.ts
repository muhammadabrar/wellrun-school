import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";
import { BrandColors } from "./pdf-brand";

const METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank: "Bank transfer",
  cheque: "Cheque",
  online: "Online",
  other: "Other",
  credit: "Student credit",
};

export function methodLabel(method: string) {
  return METHOD_LABELS[method] ?? method;
}

export async function renderReceiptPdf(input: {
  school: {
    name: string;
    address: string;
    phone: string;
    email: string;
    website: string;
    registrationNo: string;
    primaryColor?: string;
    logoPath?: string | null;
  };
  header?: string;
  footer?: string;
  receiptNumber: string;
  receiptDate: Date;
  student: { name: string; admissionNo: string; className: string; section: string } | null;
  guardian: { name: string; relation: string } | null;
  lines: { description: string; amountPkr: number }[];
  discountPkr: number;
  lateFeePkr: number;
  totalPkr: number;
  amountPaidPkr: number;
  method: string;
  referenceNumber?: string;
  previousBalancePkr: number;
  remainingBalancePkr: number;
  creditPkr: number;
  voided?: boolean;
}) {
  const doc = new PDFDocument({ size: "A4", margin: 48 });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const accent = input.school.primaryColor || BrandColors.indigo;
  const left = 48;
  const width = doc.page.width - 96;

  // Letterhead
  let textX = left;
  if (input.school.logoPath && existsSync(input.school.logoPath)) {
    try {
      doc.image(input.school.logoPath, left, 48, { fit: [64, 64] });
      textX = left + 80;
    } catch {
      textX = left;
    }
  }
  doc.font("Helvetica-Bold").fontSize(18).fillColor("#16161d").text(input.school.name.toUpperCase(), textX, 50, { width: width - (textX - left) });
  doc.font("Helvetica").fontSize(9.5).fillColor("#55555f");
  const contact = [
    input.school.address,
    [input.school.phone && `Phone: ${input.school.phone}`, input.school.email && `Email: ${input.school.email}`].filter(Boolean).join("   "),
    input.school.website,
    input.school.registrationNo && `Registration No: ${input.school.registrationNo}`,
  ].filter(Boolean) as string[];
  for (const line of contact) doc.text(line, textX, doc.y, { width: width - (textX - left) });
  if (input.header) doc.moveDown(0.3).text(input.header, textX, doc.y, { width: width - (textX - left) });
  const ruleY = Math.max(doc.y, 118) + 10;
  doc.moveTo(left, ruleY).lineTo(left + width, ruleY).lineWidth(1.5).strokeColor(accent).stroke();

  // Title + meta
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#16161d").text("FEE PAYMENT RECEIPT", left, ruleY + 16, { width, align: "center" });
  if (input.voided) {
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#c0392b").text("VOID — this payment was reversed", left, doc.y + 4, { width, align: "center" });
  }
  let y = doc.y + 14;
  const col = width / 2;
  const meta: [string, string][] = [
    ["Receipt No", input.receiptNumber],
    ["Date", formatDate(input.receiptDate)],
    ["Student", input.student?.name ?? "—"],
    ["Admission No", input.student?.admissionNo ?? "—"],
    ["Class", input.student ? `${input.student.className}${input.student.section ? ` - ${input.student.section}` : ""}` : "—"],
    [input.guardian?.relation ? capitalize(input.guardian.relation) : "Father/Guardian", input.guardian?.name ?? "—"],
  ];
  meta.forEach(([label, value], index) => {
    const x = left + (index % 2) * col;
    if (index % 2 === 0 && index > 0) y += 30;
    doc.font("Helvetica").fontSize(8.5).fillColor("#6b6b76").text(label, x, y, { width: col - 12 });
    doc.font("Helvetica-Bold").fontSize(11).fillColor("#16161d").text(value, x, y + 11, { width: col - 12 });
  });
  y += 44;

  // Fee lines
  doc.rect(left, y, width, 22).fill("#f1f1f5");
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#16161d").text("Description", left + 10, y + 7);
  doc.text("Amount", left, y + 7, { width: width - 10, align: "right" });
  y += 28;
  const lineRow = (label: string, amount: string, bold = false, color = "#16161d") => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10.5).fillColor(color).text(label, left + 10, y, { width: width * 0.65 });
    doc.text(amount, left, y, { width: width - 10, align: "right" });
    y += 20;
  };
  for (const line of input.lines) lineRow(line.description, formatPkr(line.amountPkr));
  if (input.discountPkr) lineRow("Discount", `-${formatPkr(input.discountPkr)}`, false, "#1e7a46");
  if (input.lateFeePkr) lineRow("Late fee", formatPkr(input.lateFeePkr));
  doc.moveTo(left, y - 4).lineTo(left + width, y - 4).lineWidth(0.5).strokeColor("#d4d4dc").stroke();
  y += 4;
  lineRow("Total", formatPkr(input.totalPkr), true);
  y += 10;

  // Payment summary
  const summary: [string, string, boolean][] = [
    ["Amount Paid", formatPkr(input.amountPaidPkr), true],
    ["Payment Method", `${methodLabel(input.method)}${input.referenceNumber ? ` (Ref: ${input.referenceNumber})` : ""}`, false],
    ["Previous Balance", formatPkr(input.previousBalancePkr), false],
    ["Remaining Balance", formatPkr(input.remainingBalancePkr), true],
  ];
  if (input.creditPkr) summary.push(["Credit saved for next invoice", formatPkr(input.creditPkr), false]);
  const boxHeight = summary.length * 20 + 16;
  doc.roundedRect(left, y, width, boxHeight, 6).lineWidth(1).strokeColor(accent).stroke();
  y += 10;
  for (const [label, value, bold] of summary) {
    doc.font("Helvetica").fontSize(10.5).fillColor("#55555f").text(label, left + 14, y);
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fillColor("#16161d").text(value, left, y, { width: width - 14, align: "right" });
    y += 20;
  }
  y += 36;

  // Signature + footer
  doc.moveTo(left + width - 180, y).lineTo(left + width, y).lineWidth(0.5).strokeColor("#9494a0").stroke();
  doc.font("Helvetica").fontSize(9).fillColor("#6b6b76").text("Received by / Stamp", left + width - 180, y + 4, { width: 180, align: "center" });
  if (input.footer) doc.fontSize(9).fillColor("#6b6b76").text(input.footer, left, y + 30, { width });
  doc.end();
  return done;
}

function formatPkr(amount: number) {
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

function formatDate(date: Date) {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function capitalize(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
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
