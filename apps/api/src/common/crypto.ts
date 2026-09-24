import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const PREFIX = "v1";

function keyFromSecret(secret: string) {
  return scryptSync(secret, "wellrun-fbr", 32);
}

export function encryptSecret(plain: string, secret = process.env.FBR_CREDENTIALS_KEY || process.env.JWT_SECRET || "wellrun-dev-secret") {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(secret), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string, secret = process.env.FBR_CREDENTIALS_KEY || process.env.JWT_SECRET || "wellrun-dev-secret") {
  if (!payload) return "";
  const [prefix, ivB64, tagB64, dataB64] = payload.split(":");
  if (prefix !== PREFIX || !ivB64 || !tagB64 || !dataB64) return "";
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(secret), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
