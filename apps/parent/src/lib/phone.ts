/**
 * What the parent typed, as the digits the server matches on: 03001234567, +92 300 1234567 and 3001234567
 * are all the same number. Returns null when it can't be a real number, so the form can say so before sending.
 */
export function normalizePhoneInput(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const full = digits.startsWith("92") ? digits : digits.startsWith("0") ? `92${digits.slice(1)}` : digits.length === 10 ? `92${digits}` : digits;
  return full.length >= 10 && full.length <= 15 ? full : null;
}
