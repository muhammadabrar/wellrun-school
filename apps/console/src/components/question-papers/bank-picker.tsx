import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DIFFICULTIES, DIFFICULTY_LABEL, QUESTION_TYPE_INFO, type QuestionType } from "@wellrun/shared";
import { Badge, EmptyState, ErrorState, FetchingIndicator, LoadingState, Pagination } from "@wellrun/ui";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { FormSelect } from "@/components/form/form-select";
import { QuestionBody, QuestionMeta } from "@/components/question-papers/bank-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { bankKeys, questionBankApi } from "@/lib/question-bank-api";

export type PaperRef = { gradeName: string; subjectId: string; subjectName: string };

type Run = (fn: () => Promise<unknown>, done?: string) => void;

const ANY = "any";

/** Pick questions from the bank for one section. The picker only shows what fits: this paper's grade and subject, and the section's kind. */
export function BankPickerSheet({ open, section, paper, usedBankIds, onClose, run }: { open: boolean; section: { id: string; title: string; type: QuestionType }; paper: PaperRef; usedBankIds: Set<string>; onClose: () => void; run: Run }) {
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="flex w-full flex-col overflow-hidden sm:max-w-2xl">{open ? <Picker section={section} paper={paper} usedBankIds={usedBankIds} onClose={onClose} run={run} /> : null}</SheetContent>
    </Sheet>
  );
}

function Picker({ section, paper, usedBankIds, onClose, run }: { section: { id: string; title: string; type: QuestionType }; paper: PaperRef; usedBankIds: Set<string>; onClose: () => void; run: Run }) {
  const [difficulty, setDifficulty] = useState(ANY);
  const [topic, setTopic] = useState(ANY);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const topics = useQuery({ queryKey: bankKeys.topics(paper.gradeName, paper.subjectId), queryFn: () => questionBankApi.topics(paper.gradeName, paper.subjectId) });
  const query = { gradeName: paper.gradeName, subjectId: paper.subjectId, type: section.type, difficulty: difficulty === ANY ? undefined : difficulty, topicId: topic === ANY ? undefined : topic, q: q || undefined, page: page > 1 ? page : undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: bankKeys.list(query), queryFn: () => questionBankApi.list(query), placeholderData: keepPreviousData });

  const toggle = (id: string) => setPicked((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  const typeLabel = QUESTION_TYPE_INFO[section.type].label.toLowerCase();

  return (
    <>
      <SheetHeader>
        <SheetTitle>Add from the question bank</SheetTitle>
        <SheetDescription>
          {paper.gradeName} {paper.subjectName}, {typeLabel} questions for "{section.title}". The paper gets its own copy of each one.
        </SheetDescription>
      </SheetHeader>
      <div className="flex flex-wrap items-end gap-3 px-4">
        <div className="w-36">
          <Label htmlFor="bp-diff">Difficulty</Label>
          <FormSelect id="bp-diff" value={difficulty} onValueChange={(value) => { setDifficulty(value ?? ANY); setPage(1); }} options={[{ value: ANY, label: "Any" }, ...DIFFICULTIES.map((d) => ({ value: d, label: DIFFICULTY_LABEL[d] }))]} />
        </div>
        {topics.data?.length ? (
          <div className="w-48">
            <Label htmlFor="bp-topic">Topic</Label>
            <FormSelect id="bp-topic" value={topic} onValueChange={(value) => { setTopic(value ?? ANY); setPage(1); }} options={[{ value: ANY, label: "Any topic" }, ...topics.data.map((t) => ({ value: t.id, label: t.title }))]} />
          </div>
        ) : null}
        <div className="min-w-40 flex-1">
          <Label htmlFor="bp-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="bp-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Words in the question" className="pl-9" dir="auto" />
          </div>
        </div>
        <FetchingIndicator show={isFetching && !isPending} />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {isPending ? (
          <LoadingState variant="page" />
        ) : isError || !data ? (
          <ErrorState title="Couldn't load the bank" description="Check your connection and try again." onRetry={() => void refetch()} />
        ) : !data.items.length ? (
          <EmptyState title={q || difficulty !== ANY || topic !== ANY ? "Nothing matches" : `No ${typeLabel} questions in the bank yet`} description="Write one in the section and use Save to bank, or add some from the Question bank page." />
        ) : (
          <ul className="space-y-2">
            {data.items.map((item) => {
              const used = usedBankIds.has(item.id);
              const on = picked.includes(item.id);
              return (
                <li key={item.id}>
                  <label className={`flex gap-3 rounded-2xl border p-3 ${used ? "border-line bg-paper opacity-60" : on ? "cursor-pointer border-indigo bg-indigo/5" : "cursor-pointer border-line hover:bg-paper"}`}>
                    <input type="checkbox" className="mt-1 size-4 accent-[#4642ff]" checked={on} disabled={used} onChange={() => toggle(item.id)} aria-label={`Add: ${item.text.slice(0, 60)}`} />
                    <span className="min-w-0 flex-1 space-y-2">
                      <QuestionMeta q={item} />
                      <QuestionBody q={item} />
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        Used in {item.usageCount} {item.usageCount === 1 ? "paper" : "papers"}
                        {used ? <Badge tone="neutral">Already in this paper</Badge> : null}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="question" busy={isFetching} onPageChange={setPage} /> : null}
      </div>

      <SheetFooter className="flex-row items-center justify-between gap-3 border-t border-line">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {picked.length ? `${picked.length} selected` : "Tick the questions you want"}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            type="button"
            disabled={!picked.length}
            onClick={() => {
              run(() => questionBankApi.addToPaper(section.id, picked), `Added ${picked.length} ${picked.length === 1 ? "question" : "questions"} from the bank.`);
              onClose();
            }}
          >
            Add {picked.length || ""} {picked.length === 1 ? "question" : "questions"}
          </Button>
        </div>
      </SheetFooter>
    </>
  );
}
