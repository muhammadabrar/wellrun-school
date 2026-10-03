import { describe, expect, it } from "vitest";
import { A4, CARD_H, CARD_W, PER_SHEET, cardOrigin, chunk, fitText, sheetCount } from "./layout";

describe("card size", () => {
  it("is credit-card sized", () => {
    expect(CARD_W / (72 / 25.4)).toBeCloseTo(85.6, 5);
    expect(CARD_H / (72 / 25.4)).toBeCloseTo(54, 5);
  });
});

describe("cardOrigin", () => {
  const front = Array.from({ length: PER_SHEET }, (_, i) => cardOrigin(i, "front"));
  const back = Array.from({ length: PER_SHEET }, (_, i) => cardOrigin(i, "back"));

  it("fits eight cards on an A4 page, none past an edge", () => {
    expect(PER_SHEET).toBe(8);
    for (const { x, y } of [...front, ...back]) {
      expect(x).toBeGreaterThanOrEqual(20);
      expect(y).toBeGreaterThanOrEqual(20);
      expect(x + CARD_W).toBeLessThanOrEqual(A4.w - 20);
      expect(y + CARD_H).toBeLessThanOrEqual(A4.h - 20);
    }
  });

  it("leaves a gap between cards so there is room to cut", () => {
    for (let i = 0; i < PER_SHEET; i += 1) {
      for (let j = i + 1; j < PER_SHEET; j += 1) {
        const a = front[i]!;
        const b = front[j]!;
        const apartX = Math.abs(a.x - b.x) >= CARD_W + 10;
        const apartY = Math.abs(a.y - b.y) >= CARD_H + 10;
        expect(apartX || apartY).toBe(true);
      }
    }
  });

  it("puts each back exactly behind its front when the sheet is flipped along the long edge", () => {
    for (let i = 0; i < PER_SHEET; i += 1) {
      const f = front[i]!;
      const b = back[i]!;
      expect(b.y).toBeCloseTo(f.y, 6);
      // Flipping mirrors the page left to right: the back's left edge is where the front's right edge shows through.
      expect(A4.w - (b.x + CARD_W)).toBeCloseTo(f.x, 6);
    }
  });

  it("centres the grid on the page", () => {
    const left = Math.min(...front.map((o) => o.x));
    const right = Math.max(...front.map((o) => o.x + CARD_W));
    expect(left).toBeCloseTo(A4.w - right, 6);
    const top = Math.min(...front.map((o) => o.y));
    const bottom = Math.max(...front.map((o) => o.y + CARD_H));
    expect(top).toBeCloseTo(A4.h - bottom, 6);
  });

  it("starts the next sheet at the same positions", () => {
    expect(cardOrigin(PER_SHEET, "front")).toEqual(cardOrigin(0, "front"));
    expect(cardOrigin(PER_SHEET + 3, "back")).toEqual(cardOrigin(3, "back"));
  });
});

describe("sheetCount and chunk", () => {
  it("rounds up to whole sheets", () => {
    expect([0, 1, 8, 9, 16, 17].map(sheetCount)).toEqual([0, 1, 1, 2, 2, 3]);
  });

  it("splits a list into sheets of eight, the last one short", () => {
    const pages = chunk(Array.from({ length: 19 }, (_, i) => i), PER_SHEET);
    expect(pages.map((p) => p.length)).toEqual([8, 8, 3]);
    expect(chunk([], 8)).toEqual([]);
  });
});

describe("fitText", () => {
  it("leaves short text alone and shortens long text with an ellipsis", () => {
    expect(fitText("Ayesha Khan", 24)).toBe("Ayesha Khan");
    expect(fitText("Muhammad Abdullah Bin Abdul Rahman Siddiqui", 24)).toBe("Muhammad Abdullah Bin A…");
    expect(fitText("  a   b  ", 10)).toBe("a b");
  });
});
