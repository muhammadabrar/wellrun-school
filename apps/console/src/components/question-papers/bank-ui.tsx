import { DIFFICULTY_LABEL, QUESTION_TYPE_INFO, type Difficulty } from "@wellrun/shared";
import { Badge } from "@wellrun/ui";
import type { BankQuestionView } from "@/lib/question-bank-api";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

export const DIFFICULTY_TONE: Record<Difficulty, "success" | "warning" | "danger"> = { EASY: "success", MEDIUM: "warning", HARD: "danger" };

/** The question as a teacher reads it: wording, the choices, and the right answer marked. */
export function QuestionBody({ q }: { q: Pick<BankQuestionView, "type" | "text" | "options" | "answer" | "answerLines" | "rtl"> }) {
  const dir = q.rtl ? "rtl" : "ltr";
  return (
    <div dir={dir}>
      <p className="whitespace-pre-line text-sm">{q.text}</p>
      {q.type === "MCQ" ? (
        <ul className="mt-1 grid gap-x-4 text-xs text-muted-foreground sm:grid-cols-2">
          {((q.options as unknown[]) ?? []).map((o, i) =>
            typeof o === "string" && o.trim() ? (
              <li key={i} className={String(i) === q.answer ? "font-semibold text-success" : ""}>
                {LETTERS[i]}. {o}
                {String(i) === q.answer ? " ✓" : ""}
              </li>
            ) : null,
          )}
        </ul>
      ) : q.type === "MATCH" ? (
        <ul className="mt-1 text-xs text-muted-foreground">
          {((q.options as { left: string; right: string }[]) ?? []).map((p, i) => (
            <li key={i}>
              {p.left} ↔ {p.right}
            </li>
          ))}
        </ul>
      ) : q.type === "TRUE_FALSE" ? (
        <p className="mt-0.5 text-xs text-muted-foreground">Answer: {q.answer === "TRUE" ? "True" : q.answer === "FALSE" ? "False" : "not set"}</p>
      ) : q.answer ? (
        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">Answer: {q.answer}</p>
      ) : null}
    </div>
  );
}

/** Small labels that say what a bank question is: its kind, difficulty, topic and tags. */
export function QuestionMeta({ q, showGrade = false }: { q: BankQuestionView; showGrade?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone="neutral">{QUESTION_TYPE_INFO[q.type].label}</Badge>
      <Badge tone={DIFFICULTY_TONE[q.difficulty]}>{DIFFICULTY_LABEL[q.difficulty]}</Badge>
      <span className="text-xs tabular-nums text-muted-foreground">[{q.marks}]</span>
      {showGrade ? <span className="text-xs text-muted-foreground">{q.gradeName} · {q.subject}</span> : null}
      {q.topic ? <Badge tone="indigo">{q.topic}</Badge> : null}
      {q.tags.map((tag) => (
        <span key={tag} className="rounded-full bg-paper px-2 py-0.5 text-xs text-muted-foreground">
          #{tag}
        </span>
      ))}
    </div>
  );
}
