import { academicYearSchema, isFinalClass, nextClassName, nextYearDraft, promotionSchema } from "@wellrun/shared";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { assertExamYearOpen, assertYearOpen } from "../common/year-lock";
import { AcademicYearsService } from "./academic-years.service";
import { raiseAmount, suggestAction } from "./rollover.service";

type Year = { id: string; schoolId: string; name: string; status: "PLANNING" | "ACTIVE" | "CLOSED"; current: boolean; startsOn: Date; endsOn: Date };

/** Just enough of Prisma for the status transitions. */
function fakePrisma(seed: Year[]) {
  const years = seed.map((y) => ({ ...y }));
  const match = (y: Year, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      if (value && typeof value === "object" && "not" in value) return y[key as keyof Year] !== (value as { not: unknown }).not;
      return y[key as keyof Year] === value;
    });
  const academicYear = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => years.find((y) => match(y, where)) ?? null),
    count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => years.filter((y) => match(y, where)).length),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Year> }) => Object.assign(years.find((y) => y.id === where.id)!, data)),
  };
  const prisma = {
    academicYear,
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(prisma)),
  };
  return { prisma: prisma as unknown as PrismaService, years };
}

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const y2526: Year = { id: "y1", schoolId: "s", name: "2025-26", status: "ACTIVE", current: true, startsOn: d("2025-04-01"), endsOn: d("2026-03-31") };
const y2627: Year = { id: "y2", schoolId: "s", name: "2026-27", status: "PLANNING", current: false, startsOn: d("2026-04-01"), endsOn: d("2027-03-31") };

describe("academic year input", () => {
  it("needs an end after the start and at most ~13 months", () => {
    expect(academicYearSchema.safeParse({ name: "2027-28", startsOn: "2027-04-01", endsOn: "2027-03-31" }).success).toBe(false);
    expect(academicYearSchema.safeParse({ name: "2027-28", startsOn: "2027-04-01", endsOn: "2029-03-31" }).success).toBe(false);
    expect(academicYearSchema.parse({ name: " 2027-28 ", startsOn: "2027-04-01T00:00:00.000Z", endsOn: "2028-03-31" })).toEqual({
      name: "2027-28",
      startsOn: "2027-04-01",
      endsOn: "2028-03-31",
    });
  });

  it("suggests the next session from the last one", () => {
    expect(nextYearDraft({ name: "2026-27", endsOn: "2027-03-31T00:00:00.000Z" })).toEqual({ name: "2027-28", startsOn: "2027-04-01", endsOn: "2028-03-31" });
    expect(nextYearDraft({ name: "2026", endsOn: "2026-12-31" })).toEqual({ name: "2027", startsOn: "2027-01-01", endsOn: "2027-12-31" });
  });
});

describe("year status transitions", () => {
  it("won't start a new year while another is running unless told to close it", async () => {
    const { prisma } = fakePrisma([y2526, y2627]);
    await expect(new AcademicYearsService(prisma).activate("s", "u", "y2", {})).rejects.toThrow(/still running/);
  });

  it("closes the running year and starts the new one together", async () => {
    const { prisma, years } = fakePrisma([y2526, y2627]);
    await new AcademicYearsService(prisma).activate("s", "u", "y2", { closePrevious: true });
    expect(years.find((y) => y.id === "y1")).toMatchObject({ status: "CLOSED", current: false });
    expect(years.find((y) => y.id === "y2")).toMatchObject({ status: "ACTIVE", current: true });
    expect(years.filter((y) => y.current)).toHaveLength(1);
  });

  it("re-opens a closed year only when nothing else is current", async () => {
    const closed = { ...y2526, status: "CLOSED" as const, current: false };
    const running = { ...y2627, status: "ACTIVE" as const, current: true };
    await expect(new AcademicYearsService(fakePrisma([closed, running]).prisma).reopen("s", "u", "y1")).rejects.toThrow(/current year/);

    const { prisma, years } = fakePrisma([closed]);
    await new AcademicYearsService(prisma).reopen("s", "u", "y1");
    expect(years[0]).toMatchObject({ status: "ACTIVE", current: true });
  });

  it("doesn't close an upcoming year", async () => {
    await expect(new AcademicYearsService(fakePrisma([y2627]).prisma).close("s", "u", "y2")).rejects.toThrow(/delete it instead/);
  });
});

describe("closed-year lock", () => {
  it("blocks writes to a closed year only", () => {
    expect(() => assertYearOpen({ name: "2025-26", status: "CLOSED" })).toThrow(/2025-26 is closed/);
    expect(() => assertYearOpen({ name: "2026-27", status: "ACTIVE" })).not.toThrow();
    expect(() => assertYearOpen(null)).not.toThrow();
  });

  it("looks up exam data by whichever id the route has", async () => {
    const findFirst = vi.fn(async () => ({ name: "2025-26", status: "CLOSED" }));
    const prisma = { academicYear: { findFirst } } as unknown as PrismaService;
    await expect(assertExamYearOpen(prisma, "s", { paperIds: ["p1"] })).rejects.toThrow(/closed/);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ schoolId: "s", status: "CLOSED" }) }));

    findFirst.mockClear();
    await assertExamYearOpen(prisma, "s", {});
    expect(findFirst).not.toHaveBeenCalled();
  });
});

describe("rollover", () => {
  it("finds the next class on known ladders, skipping rungs the school doesn't run", () => {
    expect(nextClassName("Grade 3")).toBe("Grade 4");
    expect(nextClassName("Nursery", ["Nursery", "Grade 1"])).toBe("Grade 1");
    expect(nextClassName("Year 11")).toBe("AS Level");
    expect(nextClassName("Class 7")).toBe("Class 8");
    expect(nextClassName("Blue House")).toBeNull();
  });

  it("knows the final class, including schools that stop early", () => {
    expect(isFinalClass("Grade 12")).toBe(true);
    expect(isFinalClass("Grade 10", ["Grade 9", "Grade 10"])).toBe(true);
    expect(isFinalClass("Grade 9", ["Grade 9", "Grade 10"])).toBe(false);
    expect(isFinalClass("Blue House")).toBe(false);
  });

  it("suggests repeat for a failed result, graduate for the last class", () => {
    expect(suggestAction({ passed: false, isFinal: false, hasRepeatTarget: true })).toBe("REPEAT");
    expect(suggestAction({ passed: false, isFinal: false, hasRepeatTarget: false })).toBe("PROMOTE");
    expect(suggestAction({ passed: null, isFinal: true, hasRepeatTarget: true })).toBe("GRADUATE");
    expect(suggestAction({ passed: true, isFinal: false, hasRepeatTarget: true })).toBe("PROMOTE");
  });

  it("raises fees to the nearest Rs 10", () => {
    expect(raiseAmount(4500, 0)).toBe(4500);
    expect(raiseAmount(4500, 10)).toBe(4950);
    expect(raiseAmount(3333, 7)).toBe(3570);
  });

  it("needs a class for promote and repeat, not for leave or graduate", () => {
    expect(promotionSchema.safeParse({ fromYearId: "y1", decisions: [{ studentId: "s1", action: "PROMOTE" }] }).success).toBe(false);
    expect(promotionSchema.safeParse({ fromYearId: "y1", decisions: [{ studentId: "s1", action: "GRADUATE" }] }).success).toBe(true);
  });
});
