import { seededOrder } from "@wellrun/shared";
import { useEffect } from "react";
import { mediaUrl } from "@/lib/format";
import type { PaperQuestionRow, PaperSectionRow, PaperSlot, QuestionPaperDetail } from "@/lib/question-papers-api";

const URDU_STACK = '"Noto Nastaliq Urdu", "Jameel Noori Nastaleeq", "Noto Naskh Arabic", "Geeza Pro", "Times New Roman", serif';
const LATIN_STACK = '"Times New Roman", Georgia, serif';
const LETTERS = ["a", "b", "c", "d", "e", "f"];
const ARABIC_LETTERS = ["أ", "ب", "ج", "د", "ہ", "و"];

/** Loads an Urdu web font the first time a paper needs one (falls back to the system's Arabic-script fonts). */
export function useUrduFont(needed: boolean) {
  useEffect(() => {
    if (!needed || document.getElementById("qp-urdu-font")) return;
    const link = document.createElement("link");
    link.id = "qp-urdu-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600&display=swap";
    document.head.appendChild(link);
  }, [needed]);
}

export type SheetOptions = {
  /** Ruled lines under each question for the student's answer. */
  answerLines: boolean;
  /** Name / roll number / signature boxes at the top. */
  studentLines: boolean;
  /** Teacher's copy: shows correct answers and model answers. */
  answerKey: boolean;
};

const fmtDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "");

function marksLabel(marks: number) {
  return Number.isInteger(marks) ? String(marks) : marks.toFixed(1);
}

function Lines({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <div className="mt-1" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-6 border-b border-dotted border-neutral-500" />
      ))}
    </div>
  );
}

function McqQuestion({ q, rtl, answerKey }: { q: PaperQuestionRow; rtl: boolean; answerKey: boolean }) {
  const options = ((q.options as unknown[]) ?? []).map((o) => (typeof o === "string" ? o : ""));
  const correct = Number(q.answer);
  const letters = rtl ? ARABIC_LETTERS : LETTERS;
  return (
    <ol className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-[0.95em]" style={{ listStyle: "none", padding: 0 }}>
      {options.map((option, i) =>
        option.trim() ? (
          <li key={i} className={answerKey && i === correct ? "font-bold" : ""}>
            ({letters[i]}) {option}
            {answerKey && i === correct ? " ✓" : ""}
          </li>
        ) : null,
      )}
    </ol>
  );
}

function MatchQuestion({ q, rtl, answerKey }: { q: PaperQuestionRow; rtl: boolean; answerKey: boolean }) {
  const pairs = ((q.options as { left?: string; right?: string }[]) ?? []).filter((p) => p?.left?.trim() && p?.right?.trim()) as { left: string; right: string }[];
  const order = seededOrder(pairs.length, q.id);
  const letters = rtl ? ARABIC_LETTERS : LETTERS;
  return (
    <div className="mt-1 grid grid-cols-2 gap-x-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide">{rtl ? "کالم الف" : "Column A"}</p>
        <ol style={{ listStyle: "none", padding: 0 }}>
          {pairs.map((p, i) => (
            <li key={i}>
              {i + 1}. {p.left} {answerKey ? <strong>→ {letters[order.indexOf(i)]}</strong> : <span className="inline-block w-10 border-b border-neutral-500" />}
            </li>
          ))}
        </ol>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide">{rtl ? "کالم ب" : "Column B"}</p>
        <ol style={{ listStyle: "none", padding: 0 }}>
          {order.map((pairIndex, i) => (
            <li key={i}>
              ({letters[i]}) {pairs[pairIndex].right}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function SectionBlock({ section, index, options }: { section: PaperSectionRow; index: number; options: SheetOptions }) {
  const rtl = section.rtl;
  const mark = (m: number) => `[${marksLabel(m)}]`;
  return (
    <section className="mt-5 break-inside-auto" dir={rtl ? "rtl" : "ltr"} style={{ fontFamily: rtl ? URDU_STACK : LATIN_STACK, lineHeight: rtl ? 2.1 : 1.45 }}>
      <div className="flex items-baseline justify-between gap-4 border-b border-black pb-0.5">
        <h3 className="text-[1.05em] font-bold">{section.title}</h3>
        <span className="shrink-0 text-sm font-semibold">
          {rtl ? "کل نمبر" : "Marks"}: {marksLabel(section.marks)}
        </span>
      </div>
      {section.instructions || section.attemptCount ? (
        <p className="mt-1 text-[0.92em] italic">
          {section.instructions}
          {section.attemptCount && !section.instructions.toLowerCase().includes(String(section.attemptCount)) ? ` ${rtl ? `کوئی سے ${section.attemptCount} سوالات حل کیجیے۔` : `(Attempt any ${section.attemptCount}.)`}` : ""}
        </p>
      ) : null}
      {section.type === "COMPREHENSION" && section.passage ? <p className="mt-2 whitespace-pre-line rounded border border-neutral-400 p-2 text-[0.95em]">{section.passage}</p> : null}
      <ol className="mt-2 space-y-2.5" style={{ listStyle: "none", padding: 0 }}>
        {section.questions.map((q, i) => (
          <li key={q.id} className="break-inside-avoid">
            <div className="flex items-start justify-between gap-3">
              <p className="min-w-0 flex-1 whitespace-pre-line">
                <span className="font-semibold">{rtl ? `${i + 1}۔` : `Q${i + 1}.`}</span> {q.text}
              </p>
              {section.type === "TRUE_FALSE" ? (
                <span className="shrink-0 text-sm">{options.answerKey ? <strong>{q.answer === "TRUE" ? (rtl ? "درست" : "True") : rtl ? "غلط" : "False"}</strong> : rtl ? "درست / غلط" : "True / False"}</span>
              ) : null}
              <span className="shrink-0 text-sm font-semibold tabular-nums">{mark(q.marks)}</span>
            </div>
            {section.type === "MCQ" ? <McqQuestion q={q} rtl={rtl} answerKey={options.answerKey} /> : null}
            {section.type === "MATCH" ? <MatchQuestion q={q} rtl={rtl} answerKey={options.answerKey} /> : null}
            {options.answerKey && q.answer && section.type !== "MCQ" && section.type !== "TRUE_FALSE" && section.type !== "MATCH" ? (
              <p className="mt-0.5 rounded bg-neutral-100 px-2 py-0.5 text-[0.92em]">
                <strong>{rtl ? "جواب" : "Answer"}:</strong> {q.answer}
              </p>
            ) : null}
            {!options.answerKey && options.answerLines && section.type !== "MCQ" && section.type !== "TRUE_FALSE" && section.type !== "MATCH" ? <Lines count={q.answerLines} /> : null}
          </li>
        ))}
      </ol>
      <span className="sr-only">Section {index + 1}</span>
    </section>
  );
}

/** One printed copy of the paper for one class section. */
export function PaperSheet({ paper, slot, options }: { paper: QuestionPaperDetail; slot?: PaperSlot | null; options: SheetOptions }) {
  const needsUrdu = paper.sections.some((s) => s.rtl) || /[؀-ۿ]/.test(paper.instructions);
  useUrduFont(needsUrdu);
  const logo = mediaUrl(paper.school.logoUrl);
  const hours = Math.floor(paper.durationMinutes / 60);
  const mins = paper.durationMinutes % 60;
  const time = `${hours ? `${hours} hr${hours > 1 ? "s" : ""}` : ""}${hours && mins ? " " : ""}${mins ? `${mins} min` : ""}`;
  const rtlInstructions = /[؀-ۿ]/.test(paper.instructions);

  return (
    <article className="qp-sheet bg-white p-8 text-[11pt] text-black print:p-0" style={{ fontFamily: LATIN_STACK }}>
      <header className="text-center">
        <div className="flex items-center justify-center gap-3">
          {logo ? <img src={logo} alt="" className="size-14 object-contain" /> : null}
          <div>
            <h1 className="text-[1.5em] font-bold uppercase tracking-wide">{paper.school.name}</h1>
            {paper.school.address ? <p className="text-xs">{paper.school.address}</p> : null}
          </div>
        </div>
        <h2 className="mt-2 text-[1.15em] font-bold uppercase">
          {paper.exam.name}
          {options.answerKey ? " — Answer key" : ""}
        </h2>
        <p className="text-xs">Academic year {paper.exam.yearName}</p>
      </header>

      <table className="mt-3 w-full border-y-2 border-black text-sm">
        <tbody>
          <tr>
            <td className="py-1 pr-3">
              <strong>Subject:</strong> {paper.subject.name}
            </td>
            <td className="py-1 pr-3">
              <strong>Class:</strong> {slot?.label ?? paper.gradeName}
            </td>
            <td className="py-1 text-right">
              <strong>Maximum marks:</strong> {marksLabel(paper.totalMarks)}
            </td>
          </tr>
          <tr>
            <td className="py-1 pr-3">
              <strong>Date:</strong> {fmtDate(slot?.date) || "________________"}
            </td>
            <td className="py-1 pr-3">
              <strong>Time allowed:</strong> {time}
            </td>
            <td className="py-1 text-right">{slot?.room ? <><strong>Room:</strong> {slot.room}</> : null}</td>
          </tr>
        </tbody>
      </table>

      {options.studentLines && !options.answerKey ? (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className="flex min-w-60 flex-1 items-end gap-2">
            <strong>Student name:</strong>
            <span className="flex-1 border-b border-black" />
          </span>
          <span className="flex min-w-32 items-end gap-2">
            <strong>Roll no:</strong>
            <span className="w-20 border-b border-black" />
          </span>
          <span className="flex min-w-40 items-end gap-2">
            <strong>Invigilator's sign:</strong>
            <span className="w-24 border-b border-black" />
          </span>
        </div>
      ) : null}

      {paper.instructions ? (
        <p className="mt-3 whitespace-pre-line rounded border border-neutral-500 px-3 py-1.5 text-[0.95em]" dir={rtlInstructions ? "rtl" : "ltr"} style={rtlInstructions ? { fontFamily: URDU_STACK, lineHeight: 2.1 } : undefined}>
          <strong>{rtlInstructions ? "ہدایات: " : "Instructions: "}</strong>
          {paper.instructions}
        </p>
      ) : null}

      {paper.sections.map((section, i) => (
        <SectionBlock key={section.id} section={section} index={i} options={options} />
      ))}

      <p className="mt-6 text-center text-xs">— End of paper —</p>
    </article>
  );
}
