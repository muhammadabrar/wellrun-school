import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BANK_TYPES, DIFFICULTIES, DIFFICULTY_LABEL, QUESTION_TYPE_INFO, type Difficulty, type QuestionType } from "@wellrun/shared";
import { Dialog, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { Archive, ArchiveRestore, Pencil, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { QuestionForm } from "@/components/question-papers/builder";
import { QuestionBody, QuestionMeta } from "@/components/question-papers/bank-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useClampPage } from "@/lib/paging";
import { bankKeys, questionBankApi, type BankChoices, type BankQuestionView } from "@/lib/question-bank-api";

const ALL = "all";

export function QuestionBankPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const gradeName = params.get("grade") ?? ALL;
  const subjectId = params.get("subject") ?? ALL;
  const type = params.get("type") ?? ALL;
  const difficulty = params.get("difficulty") ?? ALL;
  const topicId = params.get("topic") ?? ALL;
  const mine = params.get("mine") === "1";
  const archived = params.get("archived") === "1";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);
  const [editing, setEditing] = useState<BankQuestionView | "new" | null>(null);
  const [archiving, setArchiving] = useState<BankQuestionView | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key !== "page") next.delete("page");
          // A topic belongs to one grade and subject, so changing either clears it.
          if (key === "grade" || key === "subject") next.delete("topic");
          if (key === "grade") next.delete("subject");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => search.trim() !== q && setParam("q", search.trim() || null), 300);
    return () => window.clearTimeout(timer);
  }, [search, q, setParam]);

  const choices = useQuery({ queryKey: bankKeys.choices, queryFn: questionBankApi.choices });
  const subjectOptions = useMemo(() => {
    const grades = choices.data?.grades ?? [];
    const pool = gradeName === ALL ? grades.flatMap((g) => g.subjects) : (grades.find((g) => g.gradeName === gradeName)?.subjects ?? []);
    return [...new Map(pool.map((s) => [s.id, s])).values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [choices.data, gradeName]);
  const topics = useQuery({ queryKey: bankKeys.topics(gradeName, subjectId), queryFn: () => questionBankApi.topics(gradeName, subjectId), enabled: gradeName !== ALL && subjectId !== ALL });

  const query = {
    gradeName: gradeName === ALL ? undefined : gradeName,
    subjectId: subjectId === ALL ? undefined : subjectId,
    type: type === ALL ? undefined : type,
    difficulty: difficulty === ALL ? undefined : difficulty,
    topicId: topicId === ALL ? undefined : topicId,
    mine: mine ? "1" : undefined,
    archived: archived ? "1" : undefined,
    q: q || undefined,
    page: page > 1 ? page : undefined,
  };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: bankKeys.list(query), queryFn: () => questionBankApi.list(query), placeholderData: keepPreviousData });
  useClampPage(data, (next) => setParam("page", next > 1 ? String(next) : null));

  const flash = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  };
  const archive = useMutation({
    mutationFn: (item: BankQuestionView) => (item.active ? questionBankApi.archive(item.id) : questionBankApi.restore(item.id)),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: bankKeys.root });
      setArchiving(null);
      flash(item.active ? "Question restored" : "Question archived");
    },
    onError: (e) => {
      setArchiving(null);
      setError(e instanceof Error ? e.message : "Couldn't do that");
    },
  });

  const noChoices = choices.isSuccess && choices.data.grades.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Question bank"
        description="Questions kept for reuse. When you build a paper you can add them from here, or type new ones. A paper takes its own copy, so changing a question here never changes a paper that already exists."
        actions={
          <Button onClick={() => { setError(null); setEditing("new"); }} disabled={noChoices}>
            <Plus className="size-4" aria-hidden /> Add a question
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-44">
          <Label htmlFor="qb-grade">Grade</Label>
          <FormSelect id="qb-grade" value={gradeName} onValueChange={(value) => setParam("grade", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "All grades" }, ...(choices.data?.grades ?? []).map((g) => ({ value: g.gradeName, label: g.gradeName }))]} />
        </div>
        <div className="w-48">
          <Label htmlFor="qb-subject">Subject</Label>
          <FormSelect id="qb-subject" value={subjectId} onValueChange={(value) => setParam("subject", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "All subjects" }, ...subjectOptions.map((s) => ({ value: s.id, label: s.name }))]} />
        </div>
        <div className="w-48">
          <Label htmlFor="qb-type">Kind</Label>
          <FormSelect id="qb-type" value={type} onValueChange={(value) => setParam("type", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "All kinds" }, ...BANK_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_INFO[t].label }))]} />
        </div>
        <div className="w-40">
          <Label htmlFor="qb-diff">Difficulty</Label>
          <FormSelect id="qb-diff" value={difficulty} onValueChange={(value) => setParam("difficulty", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "Any" }, ...DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))]} />
        </div>
        {topics.data?.length ? (
          <div className="w-56">
            <Label htmlFor="qb-topic">Topic</Label>
            <FormSelect id="qb-topic" value={topicId} onValueChange={(value) => setParam("topic", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "Any topic" }, ...topics.data.map((t) => ({ value: t.id, label: t.title }))]} />
          </div>
        ) : null}
        <div className="w-56">
          <Label htmlFor="qb-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="qb-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Words in the question" className="pl-9" dir="auto" />
          </div>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={mine} onChange={(event) => setParam("mine", event.target.checked ? "1" : null)} /> Only mine
        </label>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={archived} onChange={(event) => setParam("archived", event.target.checked ? "1" : null)} /> Archived
        </label>
        <FetchingIndicator show={isFetching && !isPending} />
      </div>
      {error && !editing ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

      {isPending || choices.isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load the question bank" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : noChoices ? (
        <EmptyState title="No subjects to keep questions for yet" description="Questions are kept per grade and subject. Ask your school admin to set up classes and subjects, and to assign you to the ones you teach." />
      ) : !data.items.length ? (
        <EmptyState
          title={archived ? "Nothing archived" : q || type !== ALL || difficulty !== ALL || gradeName !== ALL || mine ? "No questions match" : "The bank is empty"}
          description={archived ? "Questions you archive appear here, and can be restored." : "Add a question here, or open a question paper and use Save to bank on any question you have written."}
          action={archived ? undefined : <Button onClick={() => { setError(null); setEditing("new"); }}>Add a question</Button>}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {data.items.map((item) => (
              <li key={item.id} className={`rounded-3xl bg-surface p-5 ${item.active ? "" : "opacity-70"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <QuestionMeta q={item} showGrade />
                  {item.canEdit ? (
                    <div className="flex items-center gap-1">
                      {item.active ? (
                        <Button variant="ghost" size="sm" onClick={() => { setError(null); setEditing(item); }}>
                          <Pencil className="size-3.5" aria-hidden /> Edit
                        </Button>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => (item.active ? setArchiving(item) : archive.mutate(item))} disabled={archive.isPending}>
                        {item.active ? <Archive className="size-3.5" aria-hidden /> : <ArchiveRestore className="size-3.5" aria-hidden />} {item.active ? "Archive" : "Restore"}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-3">
                  <QuestionBody q={item} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Used in {item.usageCount} {item.usageCount === 1 ? "paper" : "papers"}
                  {item.createdBy ? ` · added by ${item.mine ? "you" : item.createdBy}` : ""}
                </p>
              </li>
            ))}
          </ul>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="question" busy={isFetching} onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)} />
        </>
      )}

      <Sheet open={Boolean(editing)} onOpenChange={(next) => !next && setEditing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          {editing ? (
            <BankForm
              key={editing === "new" ? "new" : editing.id}
              item={editing === "new" ? null : editing}
              choices={choices.data}
              start={{ gradeName: gradeName === ALL ? "" : gradeName, subjectId: subjectId === ALL ? "" : subjectId }}
              onDone={(message) => {
                setEditing(null);
                void queryClient.invalidateQueries({ queryKey: bankKeys.root });
                flash(message);
              }}
            />
          ) : null}
        </SheetContent>
      </Sheet>

      <Dialog
        open={Boolean(archiving)}
        title="Archive this question?"
        description="It disappears from the list and from the picker when building papers. Papers that already use it are not changed, and you can restore it later."
        confirmLabel="Archive"
        loading={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving)}
        onClose={() => setArchiving(null)}
      />
      <Toast message={toast} />
    </div>
  );
}

function BankForm({ item, choices, start, onDone }: { item: BankQuestionView | null; choices: BankChoices | undefined; start: { gradeName: string; subjectId: string }; onDone: (message: string) => void }) {
  const grades = choices?.grades ?? [];
  const [grade, setGrade] = useState(item?.gradeName ?? start.gradeName ?? grades[0]?.gradeName ?? "");
  const subjects = grades.find((g) => g.gradeName === grade)?.subjects ?? [];
  const [subject, setSubject] = useState(item?.subjectId ?? (subjects.some((s) => s.id === start.subjectId) ? start.subjectId : ""));
  const [type, setType] = useState<QuestionType>(item?.type ?? "MCQ");
  const [difficulty, setDifficulty] = useState<Difficulty>(item?.difficulty ?? "MEDIUM");
  const [topic, setTopic] = useState(item?.topicId ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [rtl, setRtl] = useState(item?.rtl ?? false);
  const [error, setError] = useState<string | null>(null);

  const topics = useQuery({ queryKey: bankKeys.topics(grade, subject), queryFn: () => questionBankApi.topics(grade, subject), enabled: Boolean(grade && subject) });
  const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);

  const save = useMutation({
    mutationFn: (input: { text: string; marks: number; options?: unknown[]; answer?: string; answerLines?: number }) => {
      // The form builds options as strings (multiple choice) or pairs (matching); the shared schema checks them again.
      const body = { ...input, options: input.options as (string | { left: string; right: string })[] | undefined };
      return item
        ? questionBankApi.update(item.id, { ...body, difficulty, tags: tagList, topicId: topic || null, rtl })
        : questionBankApi.create({ ...body, subjectId: subject, gradeName: grade, type, difficulty, tags: tagList, topicId: topic || null, rtl });
    },
    onSuccess: () => onDone(item ? "Question updated" : "Added to the bank"),
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save the question"),
  });

  return (
    <div className="flex h-full flex-col">
      <SheetHeader>
        <SheetTitle>{item ? "Edit question" : "Add a question to the bank"}</SheetTitle>
        <SheetDescription>{item ? "The grade, subject and kind can't change. Papers that already use this question keep their own copy." : "Choose where it belongs, then write it."}</SheetDescription>
      </SheetHeader>
      <div className="flex flex-col gap-4 px-4 pb-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="bf-grade">Grade</Label>
            <FormSelect id="bf-grade" value={grade} disabled={Boolean(item)} onValueChange={(value) => { setGrade(value ?? ""); setSubject(""); setTopic(""); }} options={grades.map((g) => ({ value: g.gradeName, label: g.gradeName }))} placeholder="Choose a grade" />
          </div>
          <div>
            <Label htmlFor="bf-subject">Subject</Label>
            <FormSelect id="bf-subject" value={subject} disabled={Boolean(item)} onValueChange={(value) => { setSubject(value ?? ""); setTopic(""); }} options={subjects.map((s) => ({ value: s.id, label: s.name }))} placeholder={grade ? "Choose a subject" : "Choose a grade first"} />
          </div>
          <div>
            <Label htmlFor="bf-type">Kind of question</Label>
            <FormSelect id="bf-type" value={type} disabled={Boolean(item)} onValueChange={(value) => value && setType(value as QuestionType)} options={BANK_TYPES.map((t) => ({ value: t, label: QUESTION_TYPE_INFO[t].label }))} />
          </div>
          <div>
            <Label htmlFor="bf-diff">Difficulty</Label>
            <FormSelect id="bf-diff" value={difficulty} onValueChange={(value) => value && setDifficulty(value as Difficulty)} options={DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))} />
          </div>
          {topics.data?.length ? (
            <div className="sm:col-span-2">
              <Label htmlFor="bf-topic">Syllabus topic (optional)</Label>
              <FormSelect id="bf-topic" value={topic} onValueChange={(value) => setTopic(value ?? "")} options={[{ value: "", label: "No topic" }, ...topics.data.map((t) => ({ value: t.id, label: `${t.unit}: ${t.title}` }))]} />
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <Label htmlFor="bf-tags">Tags (optional, separated by commas)</Label>
            <Input id="bf-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="grammar, nouns" dir="auto" />
          </div>
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <Switch checked={rtl} onCheckedChange={setRtl} aria-label="Right-to-left" /> This question is in Urdu or another right-to-left language
          </label>
        </div>

        {!item && (!grade || !subject) ? <p className="rounded-2xl bg-paper px-4 py-3 text-sm text-muted-foreground">Choose a grade and subject to start writing.</p> : null}
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        {item || (grade && subject) ? (
          <QuestionForm
            key={`${type}-${item?.id ?? "new"}`}
            type={type}
            rtl={rtl}
            question={item ? { id: item.id, text: item.text, marks: item.marks, options: item.options, answer: item.answer, answerLines: item.answerLines, sortOrder: 0 } : null}
            defaultMarks={QUESTION_TYPE_INFO[type].defaultMarks}
            saveLabel={item ? "Save changes" : "Add to the bank"}
            onCancel={() => onDone("")}
            onSave={(body) => {
              setError(null);
              save.mutate(body);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
