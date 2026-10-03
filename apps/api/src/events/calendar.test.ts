import { describe, expect, it } from "vitest";
import { groupExamPapers, type ExamDayPaper } from "./calendar";

const paper = (over: Partial<ExamDayPaper>): ExamDayPaper => ({ id: "p", date: "2026-10-12", startTime: "09:00", endTime: "11:00", className: "Grade 5 A", subject: "English", examId: "mid", examName: "Mid-term", ...over });

describe("groupExamPapers", () => {
  it("makes one entry for an exam on a day, however many papers it has", () => {
    const items = groupExamPapers([paper({ id: "1" }), paper({ id: "2", subject: "Maths" }), paper({ id: "3", subject: "Urdu", className: "Grade 5 B" })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "EXAM", title: "Mid-term", date: "2026-10-12", endDate: "2026-10-12", eventId: null });
    expect(items[0]!.subtitle).toBe("English (Grade 5 A), Maths (Grade 5 A), Urdu (Grade 5 B)");
    expect(items[0]!.classLabels).toEqual(["Grade 5 A", "Grade 5 B"]);
  });

  it("names a few papers and counts the rest", () => {
    const many = ["English", "Maths", "Urdu", "Science", "Islamiyat"].map((subject, i) => paper({ id: String(i), subject }));
    expect(groupExamPapers(many)[0]!.subtitle).toBe("English (Grade 5 A), Maths (Grade 5 A), Urdu (Grade 5 A) and 2 more");
  });

  it("keeps different days and different exams apart", () => {
    const items = groupExamPapers([paper({ id: "1" }), paper({ id: "2", date: "2026-10-13" }), paper({ id: "3", examId: "quiz", examName: "Quiz" })]);
    expect(items.map((i) => i.id).sort()).toEqual(["exam:mid:2026-10-12", "exam:mid:2026-10-13", "exam:quiz:2026-10-12"]);
  });

  it("covers the whole span of the day's papers", () => {
    const item = groupExamPapers([paper({ id: "1", startTime: "11:00", endTime: "12:30" }), paper({ id: "2", startTime: "08:30", endTime: "10:00" })])[0]!;
    expect(item.startTime).toBe("08:30");
    expect(item.endTime).toBe("12:30");
  });

  it("copes with papers that have no times set", () => {
    const item = groupExamPapers([paper({ startTime: "", endTime: "" })])[0]!;
    expect(item.startTime).toBe("");
    expect(item.endTime).toBe("");
  });

  it("is empty when there are no papers", () => {
    expect(groupExamPapers([])).toEqual([]);
  });
});
