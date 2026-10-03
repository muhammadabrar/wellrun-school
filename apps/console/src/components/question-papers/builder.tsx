import { QUESTION_TYPES, QUESTION_TYPE_INFO, parseTopicList } from "@wellrun/shared";
import { Dialog } from "@wellrun/ui";
import { ArrowDown, ArrowUp, BookmarkCheck, BookmarkPlus, ClipboardPaste, Library, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { BankPickerSheet, type PaperRef } from "@/components/question-papers/bank-picker";
import { questionBankApi } from "@/lib/question-bank-api";
import { questionPapersApi, type PaperQuestionRow, type PaperSectionRow, type QuestionInputBody, type QuestionType } from "@/lib/question-papers-api";

export type Run = (fn: () => Promise<unknown>, done?: string) => void;

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const NO_ANSWER_LINES: QuestionType[] = ["MCQ", "TRUE_FALSE", "MATCH"];

export function questionPreview(q: PaperQuestionRow, type: QuestionType) {
  if (type === "MCQ") {
    const options = ((q.options as unknown[]) ?? []).filter((o) => typeof o === "string" && o.trim()).length;
    return `${options} options`;
  }
  if (type === "MATCH") return `${((q.options as unknown[]) ?? []).length} pairs`;
  if (type === "TRUE_FALSE") return q.answer === "TRUE" ? "True" : q.answer === "FALSE" ? "False" : "No answer set";
  return q.answerLines ? `${q.answerLines} lines` : "";
}

// Question form ---------------------------------------------------------------------------------------------------

type FormState = { text: string; marks: string; options: string[]; pairs: { left: string; right: string }[]; answer: string; lines: string };

function initialState(type: QuestionType, q: PaperQuestionRow | null, defaultMarks: number): FormState {
  const info = QUESTION_TYPE_INFO[type];
  const rawOptions = ((q?.options as unknown[]) ?? []) as unknown[];
  return {
    text: q?.text ?? "",
    marks: String(q?.marks ?? defaultMarks),
    options: type === "MCQ" ? (rawOptions.length ? rawOptions.map((o) => (typeof o === "string" ? o : "")) : ["", "", "", ""]) : [],
    pairs: type === "MATCH" ? (rawOptions.length ? (rawOptions as { left: string; right: string }[]) : [{ left: "", right: "" }, { left: "", right: "" }, { left: "", right: "" }]) : [],
    answer: q?.answer ?? "",
    lines: String(q?.answerLines ?? info.defaultLines),
  };
}

/** One form for every question type: MCQ options + correct answer, True/False, match pairs, or lines + model answer. */
export function QuestionForm({
  type,
  rtl,
  question,
  defaultMarks,
  onSave,
  onCancel,
  saveLabel,
}: {
  type: QuestionType;
  rtl: boolean;
  question: PaperQuestionRow | null;
  defaultMarks: number;
  onSave: (body: QuestionInputBody) => void;
  onCancel: () => void;
  saveLabel: string;
}) {
  const [form, setForm] = useState(() => initialState(type, question, defaultMarks));
  const [error, setError] = useState<string | null>(null);
  const dir = rtl ? "rtl" : "ltr";
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  function submit() {
    const marks = Number(form.marks);
    if (!form.text.trim()) return setError("Write the question");
    if (!(marks > 0)) return setError("Marks must be above 0");
    const body: QuestionInputBody = { text: form.text.trim(), marks, answerLines: NO_ANSWER_LINES.includes(type) ? 0 : Number(form.lines) || 0 };
    if (type === "MCQ") {
      const filled = form.options.filter((o) => o.trim());
      if (filled.length < 2) return setError("Give at least two options");
      if (form.answer === "" || !form.options[Number(form.answer)]?.trim()) return setError("Mark the correct option");
      body.options = form.options;
      body.answer = form.answer;
    } else if (type === "TRUE_FALSE") {
      if (form.answer !== "TRUE" && form.answer !== "FALSE") return setError("Choose True or False as the answer");
      body.answer = form.answer;
    } else if (type === "MATCH") {
      const pairs = form.pairs.filter((p) => p.left.trim() && p.right.trim());
      if (pairs.length < 2) return setError("Add at least two complete pairs");
      body.options = pairs;
    } else {
      body.answer = form.answer;
    }
    setError(null);
    onSave(body);
  }

  return (
    <form
      className="flex flex-col gap-4 rounded-2xl border border-line bg-paper p-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Field>
        <FieldLabel htmlFor="q-text">{type === "FILL_BLANK" ? "Sentence (type ____ where the blank goes)" : type === "TRUE_FALSE" ? "Statement" : type === "MATCH" ? "Instruction for this question" : "Question"}</FieldLabel>
        <Textarea id="q-text" rows={type === "LONG" || type === "WRITING" ? 3 : 2} dir={dir} value={form.text} onChange={(e) => set({ text: e.target.value })} autoFocus />
      </Field>

      {type === "MCQ" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Options — select the correct one</legend>
          {form.options.map((option, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name="q-correct" aria-label={`Option ${LETTERS[i]} is correct`} checked={form.answer === String(i)} onChange={() => set({ answer: String(i) })} className="size-4 accent-[#4642ff]" />
              <span className="w-5 text-sm font-medium">{LETTERS[i]}</span>
              <Input aria-label={`Option ${LETTERS[i]}`} dir={dir} value={option} onChange={(e) => set({ options: form.options.map((o, j) => (j === i ? e.target.value : o)) })} />
              {form.options.length > 2 ? (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove option ${LETTERS[i]}`} onClick={() => set({ options: form.options.filter((_, j) => j !== i), answer: form.answer === String(i) ? "" : form.answer !== "" && Number(form.answer) > i ? String(Number(form.answer) - 1) : form.answer })}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
          {form.options.length < 6 ? (
            <Button type="button" variant="ghost" size="sm" className="self-start" icon={<Plus />} onClick={() => set({ options: [...form.options, ""] })}>
              Add option
            </Button>
          ) : null}
        </fieldset>
      ) : null}

      {type === "TRUE_FALSE" ? (
        <fieldset className="flex gap-4">
          <legend className="mb-1 text-sm font-medium">Correct answer</legend>
          {(["TRUE", "FALSE"] as const).map((v) => (
            <label key={v} className="flex items-center gap-2 text-sm">
              <input type="radio" name="q-tf" checked={form.answer === v} onChange={() => set({ answer: v })} className="size-4 accent-[#4642ff]" />
              {v === "TRUE" ? "True" : "False"}
            </label>
          ))}
        </fieldset>
      ) : null}

      {type === "MATCH" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Pairs — Column B is shuffled when printed</legend>
          {form.pairs.map((pair, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input aria-label={`Column A, item ${i + 1}`} dir={dir} value={pair.left} placeholder={`A${i + 1}`} onChange={(e) => set({ pairs: form.pairs.map((p, j) => (j === i ? { ...p, left: e.target.value } : p)) })} />
              <span aria-hidden>↔</span>
              <Input aria-label={`Column B, match for item ${i + 1}`} dir={dir} value={pair.right} placeholder="Matching item" onChange={(e) => set({ pairs: form.pairs.map((p, j) => (j === i ? { ...p, right: e.target.value } : p)) })} />
              {form.pairs.length > 2 ? (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove pair ${i + 1}`} onClick={() => set({ pairs: form.pairs.filter((_, j) => j !== i) })}>
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          ))}
          {form.pairs.length < 10 ? (
            <Button type="button" variant="ghost" size="sm" className="self-start" icon={<Plus />} onClick={() => set({ pairs: [...form.pairs, { left: "", right: "" }] })}>
              Add pair
            </Button>
          ) : null}
        </fieldset>
      ) : null}

      {!NO_ANSWER_LINES.includes(type) ? (
        <div className="grid gap-4 md:grid-cols-[1fr_9rem]">
          <Field>
            <FieldLabel htmlFor="q-answer">{type === "FILL_BLANK" ? "Correct word(s)" : "Model answer (answer key only)"}</FieldLabel>
            <Textarea id="q-answer" rows={2} dir={dir} value={form.answer} onChange={(e) => set({ answer: e.target.value })} placeholder="Optional — printed only on the answer key" />
          </Field>
          {type !== "FILL_BLANK" ? (
            <Field>
              <FieldLabel htmlFor="q-lines">Answer lines</FieldLabel>
              <Input id="q-lines" type="number" min={0} max={40} value={form.lines} onChange={(e) => set({ lines: e.target.value })} />
            </Field>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field className="w-28">
          <FieldLabel htmlFor="q-marks">Marks</FieldLabel>
          <Input id="q-marks" type="number" min={0.5} step="0.5" value={form.marks} onChange={(e) => set({ marks: e.target.value })} />
        </Field>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{saveLabel}</Button>
        </div>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}
    </form>
  );
}

// Section card ------------------------------------------------------------------------------------------------------

export function SectionCard({
  section,
  index,
  total,
  canEdit,
  busy,
  run,
  onMove,
  onEditSection,
  paperRef,
  usedBankIds,
}: {
  section: PaperSectionRow;
  index: number;
  total: number;
  canEdit: boolean;
  busy: boolean;
  run: Run;
  onMove: (delta: number) => void;
  onEditSection: () => void;
  /** The paper's grade and subject; with it, questions can come from and go to the question bank. */
  paperRef?: PaperRef;
  /** Bank questions already used somewhere in this paper. */
  usedBankIds?: Set<string>;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const bankable = Boolean(paperRef) && section.type !== "COMPREHENSION";
  const info = QUESTION_TYPE_INFO[section.type];
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const lastMarks = section.questions[section.questions.length - 1]?.marks ?? info.defaultMarks;
  const ids = section.questions.map((q) => q.id);
  const swap = (i: number, delta: number) => {
    const next = [...ids];
    [next[i], next[i + delta]] = [next[i + delta], next[i]];
    return next;
  };
  const bulkAllowed = section.type !== "MCQ" && section.type !== "MATCH" && section.type !== "TRUE_FALSE";

  return (
    <article className="rounded-3xl bg-surface p-5" aria-labelledby={`sec-${section.id}`}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`sec-${section.id}`} className="font-display text-xl" dir={section.rtl ? "rtl" : "ltr"}>
            {section.title}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {info.label} · {section.questions.length} {section.questions.length === 1 ? "question" : "questions"} ·{" "}
            {section.attemptCount ? `attempt any ${section.attemptCount} → ` : ""}
            <span className="tabular-nums">{section.marks}</span> marks{section.rtl ? " · right-to-left" : ""}
          </p>
          {section.instructions ? <p className="mt-1 text-sm text-muted-foreground" dir={section.rtl ? "rtl" : "ltr"}>{section.instructions}</p> : null}
        </div>
        {canEdit ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon-sm" aria-label={`Move ${section.title} up`} disabled={busy || index === 0} onClick={() => onMove(-1)}>
              <ArrowUp />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Move ${section.title} down`} disabled={busy || index === total - 1} onClick={() => onMove(1)}>
              <ArrowDown />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${section.title}`} onClick={onEditSection}>
              <Pencil />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${section.title}`} onClick={() => setConfirmDelete(true)}>
              <Trash2 />
            </Button>
          </div>
        ) : null}
      </header>

      {section.type === "COMPREHENSION" && section.passage ? <p className="mt-3 whitespace-pre-line rounded-2xl bg-paper p-3 text-sm" dir={section.rtl ? "rtl" : "ltr"}>{section.passage}</p> : null}

      <ol className="mt-4 flex flex-col gap-2">
        {section.questions.map((q, i) =>
          editingId === q.id ? (
            <li key={q.id}>
              <QuestionForm
                type={section.type}
                rtl={section.rtl}
                question={q}
                defaultMarks={q.marks}
                saveLabel="Save question"
                onCancel={() => setEditingId(null)}
                onSave={(body) => {
                  setEditingId(null);
                  run(() => questionPapersApi.updateQuestion(q.id, body));
                }}
              />
            </li>
          ) : (
            <li key={q.id} className="flex items-start gap-3 rounded-2xl bg-paper px-3 py-2.5">
              <span className="w-7 shrink-0 pt-0.5 text-sm font-medium text-muted-foreground tabular-nums">{i + 1}.</span>
              <div className="min-w-0 flex-1" dir={section.rtl ? "rtl" : "ltr"}>
                <p className="whitespace-pre-line text-sm">{q.text}</p>
                {section.type === "MCQ" ? (
                  <ul className="mt-1 grid gap-x-4 text-xs text-muted-foreground sm:grid-cols-2">
                    {((q.options as unknown[]) ?? []).map((o, oi) =>
                      typeof o === "string" && o.trim() ? (
                        <li key={oi} className={String(oi) === q.answer ? "font-semibold text-success" : ""}>
                          {LETTERS[oi]}. {o}
                          {String(oi) === q.answer ? " ✓" : ""}
                        </li>
                      ) : null,
                    )}
                  </ul>
                ) : section.type === "MATCH" ? (
                  <ul className="mt-1 text-xs text-muted-foreground">
                    {((q.options as { left: string; right: string }[]) ?? []).map((p, pi) => (
                      <li key={pi}>
                        {p.left} ↔ {p.right}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">{questionPreview(q, section.type)}</p>
                )}
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">[{q.marks}]</span>
              {bankable ? (
                q.bankQuestionId ? (
                  <span className="flex shrink-0 items-center self-center text-success" title="This question is in the question bank">
                    <BookmarkCheck className="size-4" aria-label={`Question ${i + 1} is in the question bank`} />
                  </span>
                ) : (
                  <Button variant="ghost" size="icon-sm" aria-label={`Save question ${i + 1} to the question bank`} title="Save to the question bank" disabled={busy || !q.text.trim()} onClick={() => run(() => questionBankApi.fromQuestion({ questionId: q.id }), "Saved to the question bank.")}>
                    <BookmarkPlus />
                  </Button>
                )
              ) : null}
              {canEdit ? (
                <div className="flex shrink-0 items-center">
                  <Button variant="ghost" size="icon-sm" aria-label={`Move question ${i + 1} up`} disabled={busy || i === 0} onClick={() => run(() => questionPapersApi.reorderQuestions(section.id, swap(i, -1)))}>
                    <ArrowUp />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Move question ${i + 1} down`} disabled={busy || i === section.questions.length - 1} onClick={() => run(() => questionPapersApi.reorderQuestions(section.id, swap(i, 1)))}>
                    <ArrowDown />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit question ${i + 1}`} onClick={() => { setAdding(false); setEditingId(q.id); }}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete question ${i + 1}`} disabled={busy} onClick={() => run(() => questionPapersApi.removeQuestion(q.id))}>
                    <Trash2 />
                  </Button>
                </div>
              ) : null}
            </li>
          ),
        )}
        {!section.questions.length ? <li className="py-2 text-sm text-muted-foreground">No questions yet.</li> : null}
      </ol>

      {canEdit ? (
        adding ? (
          <div className="mt-3">
            <QuestionForm
              type={section.type}
              rtl={section.rtl}
              question={null}
              defaultMarks={lastMarks}
              saveLabel="Add question"
              onCancel={() => setAdding(false)}
              onSave={(body) => run(() => questionPapersApi.addQuestions(section.id, [body]))}
            />
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" icon={<Plus />} onClick={() => { setEditingId(null); setAdding(true); }}>
              Add question
            </Button>
            {bankable ? (
              <Button variant="outline" icon={<Library />} onClick={() => setPickerOpen(true)}>
                Add from bank
              </Button>
            ) : null}
            {bulkAllowed ? (
              <Button variant="ghost" icon={<ClipboardPaste />} onClick={() => setBulkOpen(true)}>
                Paste several
              </Button>
            ) : null}
          </div>
        )
      ) : null}

      <BulkSheet open={bulkOpen} section={section} defaultMarks={lastMarks} onClose={() => setBulkOpen(false)} run={run} />
      {paperRef && bankable ? <BankPickerSheet open={pickerOpen} section={section} paper={paperRef} usedBankIds={usedBankIds ?? new Set()} onClose={() => setPickerOpen(false)} run={run} /> : null}
      <Dialog
        open={confirmDelete}
        title={`Delete “${section.title}”?`}
        description={`Its ${section.questions.length} questions are removed too.`}
        confirmLabel="Delete section"
        danger
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          run(() => questionPapersApi.removeSection(section.id), "Section deleted.");
        }}
      />
    </article>
  );
}

/** Paste a list of questions (one per line) for short / long / translation / fill-in-the-blank sections. */
function BulkSheet({ open, section, defaultMarks, onClose, run }: { open: boolean; section: PaperSectionRow; defaultMarks: number; onClose: () => void; run: Run }) {
  const [text, setText] = useState("");
  const [marks, setMarks] = useState(String(defaultMarks));
  const titles = parseTopicList(text);
  const lines = QUESTION_TYPE_INFO[section.type].defaultLines;
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Paste several questions</SheetTitle>
          <SheetDescription>One question per line. Numbering and bullets are removed. They all get the same marks — you can edit any afterwards.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="flex-1 px-4">
          <Field>
            <FieldLabel htmlFor="bulk-text">Questions</FieldLabel>
            <Textarea id="bulk-text" rows={12} dir={section.rtl ? "rtl" : "ltr"} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
            <FieldDescription>{titles.length ? `${titles.length} questions ready.` : "Paste from a document or type one per line."}</FieldDescription>
          </Field>
          <Field className="w-32">
            <FieldLabel htmlFor="bulk-marks">Marks each</FieldLabel>
            <Input id="bulk-marks" type="number" min={0.5} step="0.5" value={marks} onChange={(e) => setMarks(e.target.value)} />
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button
            type="button"
            disabled={!titles.length || !(Number(marks) > 0)}
            onClick={() => {
              run(() => questionPapersApi.addQuestions(section.id, titles.map((t) => ({ text: t, marks: Number(marks), answerLines: lines }))), `${titles.length} questions added.`);
              setText("");
              onClose();
            }}
          >
            Add {titles.length || ""} questions
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

// Section sheet (add / edit) -------------------------------------------------------------------------------------------

export function SectionSheet({ open, section, nextLetter, onClose, run, paperId }: { open: boolean; section: PaperSectionRow | "new" | null; nextLetter: string; onClose: () => void; run: Run; paperId: string }) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">{section ? <SectionForm key={section === "new" ? "new" : section.id} section={section === "new" ? null : section} nextLetter={nextLetter} paperId={paperId} onClose={onClose} run={run} /> : null}</SheetContent>
    </Sheet>
  );
}

function SectionForm({ section, nextLetter, paperId, onClose, run }: { section: PaperSectionRow | null; nextLetter: string; paperId: string; onClose: () => void; run: Run }) {
  const [type, setType] = useState<QuestionType>(section?.type ?? "MCQ");
  const [title, setTitle] = useState(section?.title ?? `Section ${nextLetter}: ${QUESTION_TYPE_INFO.MCQ.defaultTitle}`);
  const [titleTouched, setTitleTouched] = useState(Boolean(section));
  const [instructions, setInstructions] = useState(section?.instructions ?? QUESTION_TYPE_INFO.MCQ.defaultInstructions);
  const [instructionsTouched, setInstructionsTouched] = useState(Boolean(section));
  const [passage, setPassage] = useState(section?.passage ?? "");
  const [rtl, setRtl] = useState(section?.rtl ?? false);
  const [attempt, setAttempt] = useState(section?.attemptCount ? String(section.attemptCount) : "");
  const [error, setError] = useState<string | null>(null);

  function pickType(next: QuestionType) {
    setType(next);
    const info = QUESTION_TYPE_INFO[next];
    if (!titleTouched) setTitle(`Section ${nextLetter}: ${info.defaultTitle}`);
    if (!instructionsTouched) setInstructions(info.defaultInstructions);
  }

  return (
    <form
      className="flex h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return setError("Name the section");
        const attemptCount = attempt ? Number(attempt) : null;
        if (attempt && !(attemptCount && attemptCount > 0)) return setError("Attempt count must be a number above 0");
        const payload = { title: title.trim(), instructions, passage, rtl, attemptCount };
        run(() => (section ? questionPapersApi.updateSection(section.id, payload) : questionPapersApi.createSection(paperId, { ...payload, type })), section ? "Section updated." : "Section added.");
        onClose();
      }}
    >
      <SheetHeader>
        <SheetTitle>{section ? "Edit section" : "Add a section"}</SheetTitle>
        <SheetDescription>{section ? "The question type can't change — delete the section and add a new one for that." : "Pick the kind of questions this section holds."}</SheetDescription>
      </SheetHeader>
      <FieldGroup className="flex-1 px-4">
        {!section ? (
          <Field>
            <FieldLabel id="sec-type-label">Question type</FieldLabel>
            <div role="radiogroup" aria-labelledby="sec-type-label" className="grid gap-2 sm:grid-cols-2">
              {QUESTION_TYPES.map((t) => (
                <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => pickType(t)} className={`rounded-xl border px-3 py-2 text-left text-sm ${type === t ? "border-indigo bg-indigo/10" : "border-line hover:bg-muted"}`}>
                  <span className="block font-medium">{QUESTION_TYPE_INFO[t].label}</span>
                  <span className="block text-xs text-muted-foreground">{QUESTION_TYPE_INFO[t].hint}</span>
                </button>
              ))}
            </div>
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="sec-title">Section title</FieldLabel>
          <Input id="sec-title" dir={rtl ? "rtl" : "ltr"} value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />
        </Field>
        <Field>
          <FieldLabel htmlFor="sec-instr">Instructions for students</FieldLabel>
          <Textarea id="sec-instr" rows={2} dir={rtl ? "rtl" : "ltr"} value={instructions} onChange={(e) => { setInstructions(e.target.value); setInstructionsTouched(true); }} />
        </Field>
        {type === "COMPREHENSION" ? (
          <Field>
            <FieldLabel htmlFor="sec-passage">Reading passage</FieldLabel>
            <Textarea id="sec-passage" rows={8} dir={rtl ? "rtl" : "ltr"} value={passage} onChange={(e) => setPassage(e.target.value)} />
          </Field>
        ) : null}
        <Field>
          <FieldLabel htmlFor="sec-attempt">Attempt any (optional)</FieldLabel>
          <Input id="sec-attempt" type="number" min={1} className="w-28" value={attempt} onChange={(e) => setAttempt(e.target.value)} placeholder="All" />
          <FieldDescription>For “attempt any 6 of 8”. Only the best-paying N questions count towards the section's marks.</FieldDescription>
        </Field>
        <div className="flex items-start justify-between gap-4">
          <div>
            <FieldLabel htmlFor="sec-rtl">Right-to-left (Urdu, Arabic)</FieldLabel>
            <FieldDescription>Questions in this section are written and printed right to left in a Nastaliq font.</FieldDescription>
          </div>
          <Switch id="sec-rtl" checked={rtl} onCheckedChange={setRtl} />
        </div>
        {error ? <FieldError>{error}</FieldError> : null}
      </FieldGroup>
      <SheetFooter>
        <Button type="submit">{section ? "Save section" : "Add section"}</Button>
      </SheetFooter>
    </form>
  );
}

