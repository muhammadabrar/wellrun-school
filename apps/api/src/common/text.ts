/** "muhammad ali" → "Muhammad Ali". Only the first letter of each word changes; the rest stays as typed. */
export function titleCaseName(value: string | null | undefined) {
  if (!value) return value ?? "";
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/(^|[\s\-'(])(\p{Ll})/gu, (_match, lead: string, letter: string) => `${lead}${letter.toUpperCase()}`);
}
