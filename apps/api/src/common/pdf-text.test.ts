import { describe, expect, it } from "vitest";
import { hasUnprintable, pdfSafe } from "./pdf-text";

describe("pdfSafe", () => {
  it("keeps ordinary English, accents and the usual punctuation", () => {
    const text = "Ayesha Khan's café — “Grade 5”, 12/03/2015 • Rs. 1,500…";
    expect(pdfSafe(text)).toBe(text);
    expect(hasUnprintable(text)).toBe(false);
  });

  it("swaps Urdu letters for a question mark instead of printing nonsense", () => {
    expect(pdfSafe("عائشہ خان")).toBe("????? ???");
    expect(hasUnprintable("عائشہ خان")).toBe(true);
  });

  it("keeps the Latin parts of mixed text", () => {
    expect(pdfSafe("Ali علی Khan")).toBe("Ali ??? Khan");
  });

  it("turns odd whitespace into a plain space and keeps line breaks", () => {
    expect(pdfSafe("a​b　c")).toBe("a?b c");
    expect(pdfSafe("line one\nline two")).toBe("line one\nline two");
  });

  it("does not flag empty text", () => {
    expect(hasUnprintable("")).toBe(false);
    expect(pdfSafe("")).toBe("");
  });
});
