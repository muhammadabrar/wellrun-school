import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import { pdfSafe } from "../common/pdf-text";
import { BrandColors } from "../fees/pdf-brand";
import { CARD_H, CARD_W, PER_SHEET, cardOrigin, chunk, fitText } from "./layout";

export type CardSchool = { name: string; address: string; phone: string; primaryColor?: string; logoPath?: string | null };

export type Card = {
  kind: "student" | "staff";
  name: string;
  /** Class and roll number, or the job title. */
  subtitle: string;
  numberLabel: string;
  number: string;
  photoPath: string | null;
  /** Shown on the back: the guardian to call for a student, the department for staff. */
  contactLine: string;
  contactPhone: string;
  validity: string;
};

const INK = "#16161d";
const MUTED = "#6b6b76";
const HAIR = "#d4d4dc";

function photo(doc: PDFKit.PDFDocument, path: string | null, x: number, y: number, w: number, h: number, initial: string, accent: string) {
  doc.save();
  doc.roundedRect(x, y, w, h, 5).clip();
  let drawn = false;
  if (path) {
    try {
      doc.image(path, x, y, { cover: [w, h], align: "center", valign: "center" });
      drawn = true;
    } catch {
      /* A photo in a format the PDF library can't read (such as WebP) falls back to the initial. */
    }
  }
  if (!drawn) {
    doc.rect(x, y, w, h).fill("#eceaff");
    doc.fillColor(accent).font("Helvetica-Bold").fontSize(h * 0.42).text(initial, x, y + h * 0.26, { width: w, align: "center", lineBreak: false });
  }
  doc.restore();
  doc.roundedRect(x, y, w, h, 5).lineWidth(0.8).strokeColor(HAIR).stroke();
}

async function front(doc: PDFKit.PDFDocument, school: CardSchool, card: Card, x: number, y: number, accent: string) {
  doc.save();
  doc.roundedRect(x, y, CARD_W, CARD_H, 8).clip();
  doc.rect(x, y, CARD_W, CARD_H).fill("#ffffff");
  doc.rect(x, y, CARD_W, 36).fill(accent);
  let textX = x + 10;
  if (school.logoPath) {
    try {
      doc.circle(x + 22, y + 18, 13).fill("#ffffff");
      doc.image(school.logoPath, x + 12, y + 8, { fit: [20, 20], align: "center", valign: "center" });
      textX = x + 42;
    } catch {
      /* No logo on the card if it can't be read. */
    }
  }
  doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(9.5).text(pdfSafe(fitText(school.name, 34)), textX, y + 9, { width: x + CARD_W - textX - 8, lineBreak: false });
  doc.font("Helvetica").fontSize(7).fillColor("#e6e6ff").text(card.kind === "student" ? "STUDENT ID CARD" : "STAFF ID CARD", textX, y + 23, { width: x + CARD_W - textX - 8, lineBreak: false, characterSpacing: 0.8 });
  photo(doc, card.photoPath, x + 10, y + 46, 58, 72, (card.name.trim()[0] ?? "?").toUpperCase(), accent);
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(10.5).text(pdfSafe(fitText(card.name, 30)), x + 76, y + 48, { width: 104, height: 28, ellipsis: true });
  doc.fillColor(MUTED).font("Helvetica").fontSize(8).text(pdfSafe(fitText(card.subtitle, 34)), x + 76, doc.y + 2, { width: 104 });
  doc.fillColor(MUTED).fontSize(7).text(card.numberLabel, x + 76, y + 98, { width: 104, lineBreak: false });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(9).text(pdfSafe(card.number), x + 76, y + 107, { width: 104, lineBreak: false });
  try {
    const qr = await QRCode.toBuffer(card.number, { margin: 0, width: 160, errorCorrectionLevel: "M" });
    doc.image(qr, x + CARD_W - 56, y + 56, { width: 46 });
  } catch {
    /* The number is printed beside it regardless. */
  }
  doc.rect(x, y + CARD_H - 8, CARD_W, 8).fill(accent);
  doc.restore();
  doc.roundedRect(x, y, CARD_W, CARD_H, 8).lineWidth(0.6).strokeColor(HAIR).stroke();
}

function back(doc: PDFKit.PDFDocument, school: CardSchool, card: Card, x: number, y: number, accent: string) {
  doc.save();
  doc.roundedRect(x, y, CARD_W, CARD_H, 8).clip();
  doc.rect(x, y, CARD_W, CARD_H).fill("#ffffff");
  doc.rect(x, y, CARD_W, 12).fill(accent);
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text("If found, please return to:", x + 12, y + 20, { width: CARD_W - 24, lineBreak: false });
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(9.5).text(pdfSafe(fitText(school.name, 40)), x + 12, y + 31, { width: CARD_W - 24, lineBreak: false });
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(pdfSafe(fitText(school.address, 70)), x + 12, y + 44, { width: CARD_W - 24, height: 20 });
  if (school.phone) doc.text(pdfSafe(`Phone: ${school.phone}`), x + 12, doc.y + 1, { width: CARD_W - 24, lineBreak: false });
  doc.moveTo(x + 12, y + 80).lineTo(x + CARD_W - 12, y + 80).lineWidth(0.5).strokeColor(HAIR).stroke();
  if (card.contactLine) {
    doc.fillColor(MUTED).fontSize(7).text(card.kind === "student" ? "In an emergency, call" : "Department", x + 12, y + 86, { width: CARD_W - 24, lineBreak: false });
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(8.5).text(pdfSafe(fitText(`${card.contactLine}${card.contactPhone ? `  ${card.contactPhone}` : ""}`, 44)), x + 12, y + 95, { width: CARD_W - 24, lineBreak: false });
  }
  doc.fillColor(MUTED).font("Helvetica").fontSize(7.5).text(pdfSafe(card.validity), x + 12, y + CARD_H - 24, { width: 120, lineBreak: false });
  doc.moveTo(x + CARD_W - 84, y + CARD_H - 22).lineTo(x + CARD_W - 12, y + CARD_H - 22).lineWidth(0.5).strokeColor(INK).stroke();
  doc.fontSize(6.5).text("Principal", x + CARD_W - 84, y + CARD_H - 19, { width: 72, align: "center", lineBreak: false });
  doc.restore();
  doc.roundedRect(x, y, CARD_W, CARD_H, 8).lineWidth(0.6).strokeColor(HAIR).stroke();
}

/** Fronts on one A4 page, the matching backs on the next, eight cards a page. */
export async function renderIdCards(input: { school: CardSchool; cards: Card[]; sides: "both" | "front" }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const accent = input.school.primaryColor || BrandColors.indigo;
  for (const sheet of chunk(input.cards, PER_SHEET)) {
    doc.addPage();
    for (const [i, card] of sheet.entries()) {
      const { x, y } = cardOrigin(i, "front");
      await front(doc, input.school, card, x, y, accent);
    }
    if (input.sides === "both") {
      doc.addPage();
      for (const [i, card] of sheet.entries()) {
        const { x, y } = cardOrigin(i, "back");
        back(doc, input.school, card, x, y, accent);
      }
    }
  }
  if (!input.cards.length) doc.addPage();
  doc.end();
  return done;
}
