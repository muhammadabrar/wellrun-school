import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { BadRequestException } from "@nestjs/common";

export function saveDataUrl(schoolId: string, prefix: string, dataUrl: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+|application\/pdf);base64,(.+)$/);
  if (!match) throw new BadRequestException("Upload a PNG, JPG, WebP, or PDF file");
  const mime = match[1];
  const ext = mime.includes("pdf") ? "pdf" : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const dir = join(process.cwd(), "uploads");
  mkdirSync(dir, { recursive: true });
  const name = `${schoolId}-${prefix}-${Date.now()}.${ext}`;
  writeFileSync(join(dir, name), Buffer.from(match[2], "base64"));
  return `http://localhost:3000/uploads/${name}`;
}
