import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, pageCount, pageParams, paginate } from "@wellrun/shared";
import { describe, expect, it } from "vitest";

describe("pageParams", () => {
  it("defaults to the first page", () => {
    expect(pageParams({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE, skip: 0, take: DEFAULT_PAGE_SIZE });
  });

  it("turns page and size into skip and take", () => {
    expect(pageParams({ page: "3", pageSize: "25" })).toMatchObject({ page: 3, pageSize: 25, skip: 50, take: 25 });
  });

  it("survives junk and out-of-range input", () => {
    expect(pageParams({ page: "-4", pageSize: "abc" })).toMatchObject({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
    expect(pageParams({ page: "0" }).page).toBe(1);
    expect(pageParams({ pageSize: "100000" }).pageSize).toBe(MAX_PAGE_SIZE);
    expect(pageParams({ page: "2.9" }).page).toBe(2);
  });

  it("honours a different default size", () => {
    expect(pageParams({}, 50).pageSize).toBe(50);
  });
});

describe("pageCount", () => {
  it("is always at least one page", () => {
    expect(pageCount(0, 20)).toBe(1);
    expect(pageCount(20, 20)).toBe(1);
    expect(pageCount(21, 20)).toBe(2);
  });
});

describe("paginate", () => {
  const rows = Array.from({ length: 45 }, (_, i) => i + 1);

  it("slices a loaded list and reports the total", () => {
    const second = paginate(rows, { page: 2, pageSize: 20 });
    expect(second.items[0]).toBe(21);
    expect(second.items).toHaveLength(20);
    expect(second).toMatchObject({ total: 45, page: 2, pageSize: 20 });
  });

  it("returns a short last page and an empty page past the end", () => {
    expect(paginate(rows, { page: 3, pageSize: 20 }).items).toEqual([41, 42, 43, 44, 45]);
    expect(paginate(rows, { page: 9, pageSize: 20 }).items).toEqual([]);
  });
});
