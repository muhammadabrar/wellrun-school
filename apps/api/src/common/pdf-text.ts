/**
 * The fonts built into the PDF library draw Latin letters only. Anything else (Urdu, Arabic) would print as blank boxes or
 * nonsense, so it is swapped for "?" and the person is warned beforehand instead of finding out on paper.
 */
const SAFE = /[ -~ -ÿ–—‘’“”•…\n\t]/;

export const hasUnprintable = (text: string) => [...text].some((ch) => !SAFE.test(ch) && ch.trim() !== "");

export function pdfSafe(text: string) {
  return [...text.normalize("NFC")].map((ch) => (SAFE.test(ch) ? ch : ch.trim() === "" ? " " : "?")).join("");
}
