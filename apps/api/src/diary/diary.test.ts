import { canPostDiary, diaryCreateSchema, diaryDateError, diaryUpdateSchema, diaryWindow, isDiaryDateOpen, noticeSchema, type DiaryScope } from "@wellrun/shared";
import { describe, expect, it } from "vitest";

const teacher = (over: Partial<{ classIds: string[]; wholeClassIds: string[]; pairs: string[] }> = {}): DiaryScope => ({
  classIds: new Set(over.classIds ?? ["c5a", "c5b"]),
  wholeClassIds: new Set(over.wholeClassIds ?? []),
  pairs: new Set(over.pairs ?? ["c5a:math", "c5b:math", "c5a:urdu"]),
});

describe("canPostDiary", () => {
  it("lets a subject teacher post only for their own subject in their own class", () => {
    expect(canPostDiary(teacher(), { classId: "c5a", subjectId: "math", kind: "HOMEWORK" })).toBe(true);
    expect(canPostDiary(teacher(), { classId: "c5a", subjectId: "english", kind: "HOMEWORK" })).toBe(false);
    expect(canPostDiary(teacher(), { classId: "c6a", subjectId: "math", kind: "HOMEWORK" })).toBe(false);
  });

  it("lets a subject teacher send a general note to a class they teach, but not general homework", () => {
    expect(canPostDiary(teacher(), { classId: "c5a", subjectId: null, kind: "NOTE" })).toBe(true);
    expect(canPostDiary(teacher(), { classId: "c5a", subjectId: null, kind: "HOMEWORK" })).toBe(false);
  });

  it("lets a class teacher post anything for their whole class", () => {
    const classTeacher = teacher({ wholeClassIds: ["c5a"], pairs: [] });
    expect(canPostDiary(classTeacher, { classId: "c5a", subjectId: "english", kind: "HOMEWORK" })).toBe(true);
    expect(canPostDiary(classTeacher, { classId: "c5a", subjectId: null, kind: "CLASSWORK" })).toBe(true);
    expect(canPostDiary(classTeacher, { classId: "c5b", subjectId: "english", kind: "HOMEWORK" })).toBe(false);
  });

  it("never lets an admin (no teacher scope) write the diary", () => {
    expect(canPostDiary(null, { classId: "c5a", subjectId: "math", kind: "HOMEWORK" })).toBe(false);
  });
});

describe("diary dates", () => {
  it("allows yesterday through a month ahead", () => {
    expect(diaryWindow("2026-10-10")).toEqual({ from: "2026-10-09", to: "2026-11-09" });
    expect(diaryDateError("2026-10-09", "2026-10-10")).toBeNull();
    expect(diaryDateError("2026-10-10", "2026-10-10")).toBeNull();
    expect(diaryDateError("2026-11-09", "2026-10-10")).toBeNull();
    expect(diaryDateError("2026-10-08", "2026-10-10")).toMatch(/yesterday/);
    expect(diaryDateError("2026-11-10", "2026-10-10")).toMatch(/too far/);
  });

  it("closes an entry for edits once its day is more than a day old", () => {
    expect(isDiaryDateOpen("2026-10-10", "2026-10-10")).toBe(true);
    expect(isDiaryDateOpen("2026-10-09", "2026-10-10")).toBe(true);
    expect(isDiaryDateOpen("2026-10-08", "2026-10-10")).toBe(false);
    expect(isDiaryDateOpen("2026-12-01", "2026-10-10")).toBe(true);
  });

  it("works across a month and year boundary", () => {
    expect(isDiaryDateOpen("2026-12-31", "2027-01-01")).toBe(true);
    expect(isDiaryDateOpen("2026-12-30", "2027-01-01")).toBe(false);
  });
});

describe("diary schemas", () => {
  const base = { classId: "c5a", date: "2026-10-10", body: "  Page 42, questions 1 to 5  " };

  it("trims text and defaults to homework", () => {
    const parsed = diaryCreateSchema.parse(base);
    expect(parsed.body).toBe("Page 42, questions 1 to 5");
    expect(parsed.kind).toBe("HOMEWORK");
    expect(parsed.title).toBe("");
  });

  it("rejects an empty body, a bad date and a due date before the diary date", () => {
    expect(diaryCreateSchema.safeParse({ ...base, body: "   " }).success).toBe(false);
    expect(diaryCreateSchema.safeParse({ ...base, date: "10/10/2026" }).success).toBe(false);
    const early = diaryCreateSchema.safeParse({ ...base, dueOn: "2026-10-09" });
    expect(early.success).toBe(false);
    expect(diaryCreateSchema.safeParse({ ...base, dueOn: "2026-10-12" }).success).toBe(true);
  });

  it("keeps an update partial: absent fields stay absent", () => {
    const parsed = diaryUpdateSchema.parse({ body: "Changed" });
    expect(parsed).toEqual({ body: "Changed" });
    expect(diaryUpdateSchema.parse({ removeImage: true })).toEqual({ removeImage: true });
  });
});

describe("noticeSchema", () => {
  it("defaults to everyone and not pinned", () => {
    const parsed = noticeSchema.parse({ title: " Eid holidays ", body: "School closed Monday" });
    expect(parsed).toMatchObject({ title: "Eid holidays", audience: "ALL", classIds: [], pinned: false });
  });

  it("requires a title and a body", () => {
    expect(noticeSchema.safeParse({ title: "", body: "x" }).success).toBe(false);
    expect(noticeSchema.safeParse({ title: "x", body: " " }).success).toBe(false);
  });
});
