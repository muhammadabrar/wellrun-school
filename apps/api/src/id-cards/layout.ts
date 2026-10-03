/** An ID card is credit-card sized (CR80: 85.6 × 54 mm). Eight fit on an A4 sheet, fronts on one page and backs on the next. */

export const POINTS_PER_MM = 72 / 25.4;
export const CARD_W = 85.6 * POINTS_PER_MM;
export const CARD_H = 54 * POINTS_PER_MM;

export const A4 = { w: 595.28, h: 841.89 };
export const COLS = 2;
export const ROWS = 4;
export const PER_SHEET = COLS * ROWS;
const GAP_X = 22;
const GAP_Y = 16;

export type Side = "front" | "back";

/**
 * Where a card's top-left corner goes on the page. Backs are mirrored left to right: when the sheet is printed on both
 * sides and flipped along its long edge, each back then lands exactly behind its front.
 */
export function cardOrigin(index: number, side: Side, page = A4) {
  const slot = index % PER_SHEET;
  const row = Math.floor(slot / COLS);
  const col = side === "front" ? slot % COLS : COLS - 1 - (slot % COLS);
  const left = (page.w - (COLS * CARD_W + (COLS - 1) * GAP_X)) / 2;
  const top = (page.h - (ROWS * CARD_H + (ROWS - 1) * GAP_Y)) / 2;
  return { x: left + col * (CARD_W + GAP_X), y: top + row * (CARD_H + GAP_Y) };
}

export const sheetCount = (cards: number) => Math.ceil(cards / PER_SHEET);

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Shortens text to fit a width using a rough average letter width, adding an ellipsis, so a long name never spills off a card. */
export function fitText(text: string, maxChars: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= maxChars ? clean : `${clean.slice(0, Math.max(1, maxChars - 1)).trimEnd()}…`;
}
