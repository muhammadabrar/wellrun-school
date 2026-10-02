export function waDigits(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  if (digits.length === 10) return `92${digits}`;
  return digits;
}

export function waLink(raw: string, text?: string) {
  const n = waDigits(raw);
  if (!n) return null;
  const q = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${n}${q}`;
}

/** Phone numbers are matched by this form: digits only, 92-prefixed. Null when it can't be a real number. */
export function normalizePhone(raw: string | null | undefined) {
  const digits = waDigits(raw ?? "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** 13-digit CNICs are stored as 00000-0000000-0 so "3520212345671" and "35202-1234567-1" are the same person. */
export function normalizeCnic(raw: string | null | undefined) {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const digits = text.replace(/\D/g, "");
  if (digits.length === 13) return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  return text;
}
