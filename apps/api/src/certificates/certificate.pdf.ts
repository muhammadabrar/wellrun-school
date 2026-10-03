import QRCode from "qrcode";
import PDFDocument from "pdfkit";
import { pdfSafe } from "../common/pdf-text";
import { BrandColors } from "../fees/pdf-brand";

export type CertificatePdf = {
  school: { name: string; address: string; phone: string; email: string; primaryColor?: string; logoPath?: string | null };
  principal: string;
  title: string;
  text: string;
  serial: string;
  issuedOn: string;
  revoked: boolean;
};

const INK = "#16161d";
const MUTED = "#6b6b76";

/** One landscape A4 page: border, letterhead, wording, signatures and a small code carrying the serial number. */
export async function renderCertificate(input: CertificatePdf): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 0 });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const W = doc.page.width;
  const H = doc.page.height;
  const accent = input.school.primaryColor || BrandColors.indigo;

  doc.lineWidth(3).strokeColor(accent).rect(24, 24, W - 48, H - 48).stroke();
  doc.lineWidth(0.8).rect(32, 32, W - 64, H - 64).stroke();

  let y = 52;
  if (input.school.logoPath) {
    try {
      doc.image(input.school.logoPath, W / 2 - 28, y, { fit: [56, 56], align: "center" });
      y += 62;
    } catch {
      /* A logo in a format the PDF library can't read is left out rather than failing the certificate. */
    }
  }
  doc.fillColor(INK).font("Helvetica-Bold").fontSize(24).text(pdfSafe(input.school.name), 60, y, { width: W - 120, align: "center" });
  y = doc.y + 2;
  const contact = [input.school.address, input.school.phone, input.school.email].filter(Boolean).join("  ·  ");
  if (contact) {
    doc.fillColor(MUTED).font("Helvetica").fontSize(9.5).text(pdfSafe(contact), 60, y, { width: W - 120, align: "center" });
    y = doc.y;
  }
  y += 14;
  doc.lineWidth(1).strokeColor(accent).moveTo(W / 2 - 70, y).lineTo(W / 2 + 70, y).stroke();
  y += 18;

  doc.fillColor(accent).font("Helvetica-Bold").fontSize(30).text(pdfSafe(input.title).toUpperCase(), 60, y, { width: W - 120, align: "center", characterSpacing: 1.5 });
  y = doc.y + 8;
  doc.fillColor(MUTED).font("Helvetica").fontSize(10).text(`Certificate no. ${input.serial}`, 70, y, { width: 300, align: "left" });
  doc.text(`Date: ${input.issuedOn}`, W - 370, y, { width: 300, align: "right" });
  y += 44;

  doc.fillColor(INK).font("Helvetica").fontSize(17).text(pdfSafe(input.text), 92, y, { width: W - 184, align: "center", lineGap: 12 });

  const baseline = H - 96;
  doc.lineWidth(0.8).strokeColor(INK);
  doc.moveTo(88, baseline).lineTo(268, baseline).stroke();
  doc.moveTo(W - 268, baseline).lineTo(W - 88, baseline).stroke();
  doc.fillColor(MUTED).font("Helvetica").fontSize(10);
  doc.text("Issued by (school office)", 88, baseline + 4, { width: 180, align: "center" });
  doc.fillColor(INK).font("Helvetica-Bold").text(pdfSafe(input.principal || "Principal"), W - 268, baseline + 4, { width: 180, align: "center" });
  doc.fillColor(MUTED).font("Helvetica").text("Principal", W - 268, doc.y, { width: 180, align: "center" });

  try {
    const qr = await QRCode.toBuffer(`${input.school.name} | ${input.serial}`, { margin: 0, width: 140, errorCorrectionLevel: "M" });
    doc.image(qr, W / 2 - 24, baseline - 34, { width: 48 });
    doc.fillColor(MUTED).fontSize(7.5).text(input.serial, W / 2 - 60, baseline + 18, { width: 120, align: "center" });
  } catch {
    /* The code is a convenience; the serial number is printed in the corner regardless. */
  }

  if (input.revoked) {
    doc.save();
    doc.rotate(-24, { origin: [W / 2, H / 2] });
    doc.fillOpacity(0.16).fillColor("#c0392b").font("Helvetica-Bold").fontSize(96).text("WITHDRAWN", 0, H / 2 - 56, { width: W, align: "center" });
    doc.restore();
  }

  doc.end();
  return done;
}
