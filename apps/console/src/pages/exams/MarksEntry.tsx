import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EXAM_KIND_LABELS, MARK_ATTENDANCE } from "@wellrun/shared";
import { Dialog, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { CheckCircle2, ClipboardPaste, Download, FileUp, LockOpen, Search, Send, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PaperStatusBadge, fmtNum, formatDay, isExamAdmin, pct } from "@/components/exams/exam-ui";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { examKeys, examsApi, type GradeBand, type MarkAttendance, type MarksSheet, type MarksSheetRow } from "@/lib/exams-api";

const ATTENDANCE_LABEL: Record<MarkAttendance, string> = { PRESENT: "Present", ABSENT: "Absent", MEDICAL: "Medical", EXEMPT: "Exempt" };

type Entry = { marks: string; attendance: MarkAttendance; remark: string };

function gradeOf(p: number, bands: GradeBand[]) {
  return [...bands].sort((a, b) => b.minPct - a.minPct).find((b) => p >= b.minPct)?.grade ?? "";
}

export function MarksEntryPage() {
  const { paperId = "" } = useParams();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: examKeys.sheet(paperId), queryFn: () => examsApi.sheet(paperId), enabled: Boolean(paperId) });
  if (isPending) return <LoadingState variant="table" />;
  if (isError || !data) return <ErrorState title="Couldn't open this paper" description="It may have been removed, or it isn't one of your subjects." onRetry={() => void refetch()} />;
  return <Grid key={`${data.paper.id}:${data.paper.status}`} sheet={data} />;
}

function Grid({ sheet }: { sheet: MarksSheet }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const admin = isExamAdmin();
  const { paper, permissions } = sheet;
  const editable = permissions.canEdit;
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(sheet.rows.map((r) => [r.id, { marks: r.marks == null ? "" : String(r.marks), attendance: r.attendance, remark: r.remark }])),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [showRemarks, setShowRemarks] = useState(sheet.rows.some((r) => r.remark));
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"submit" | "return" | "reopen" | "paste" | "import" | null>(null);
  const [correctionFor, setCorrectionFor] = useState<MarksSheetRow | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const invalid = (e: Entry) => e.attendance === "PRESENT" && e.marks !== "" && (Number.isNaN(Number(e.marks)) || Number(e.marks) < 0 || Number(e.marks) > paper.maxMarks);
  const rows = sheet.rows.filter((r) => !filter || `${r.rollNo} ${r.name} ${r.admissionNo}`.toLowerCase().includes(filter.toLowerCase()));

  const payload = useCallback(
    (ids: string[]) =>
      ids.map((studentId) => {
        const e = entries[studentId];
        return { studentId, attendance: e.attendance, marks: e.attendance === "PRESENT" && e.marks !== "" ? Number(e.marks) : null, remark: e.remark };
      }),
    [entries],
  );

  const save = useMutation({
    mutationFn: (opts: { submit: boolean; ids: string[] }) => examsApi.saveMarks(paper.id, { rows: payload(opts.ids), submit: opts.submit }),
    onSuccess: async (_out, opts) => {
      setDirty((current) => {
        const next = new Set(current);
        opts.ids.forEach((id) => next.delete(id));
        return next;
      });
      setError(null);
      if (opts.submit) {
        await queryClient.invalidateQueries({ queryKey: examKeys.root });
        setToast("Marks submitted for verification.");
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't save marks"),
  });

  // Autosave drafts a moment after typing stops.
  useEffect(() => {
    if (!editable || !dirty.size || save.isPending) return;
    const ids = [...dirty];
    if (ids.some((id) => invalid(entries[id]))) return;
    const timer = window.setTimeout(() => save.mutate({ submit: false, ids }), 1200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, entries, editable]);

  // Warn before leaving with unsaved marks.
  useEffect(() => {
    if (!dirty.size) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty.size]);

  function update(studentId: string, patch: Partial<Entry>) {
    setEntries((current) => ({ ...current, [studentId]: { ...current[studentId], ...patch } }));
    setDirty((current) => new Set(current).add(studentId));
  }

  function onMarksKey(event: React.KeyboardEvent<HTMLInputElement>, index: number, studentId: string) {
    if (event.key === "Enter" || event.key === "ArrowDown") {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
      inputs.current[index + 1]?.select();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
      inputs.current[index - 1]?.select();
    } else if (event.key.toLowerCase() === "a" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      update(studentId, { attendance: "ABSENT", marks: "" });
      inputs.current[index + 1]?.focus();
    }
  }

  const stats = useMemo(() => {
    const present = sheet.rows.map((r) => entries[r.id]).filter((e) => e.attendance === "PRESENT" && e.marks !== "" && !Number.isNaN(Number(e.marks)));
    const pcts = present.map((e) => (Number(e.marks) / paper.maxMarks) * 100);
    const done = sheet.rows.filter((r) => entries[r.id].attendance !== "PRESENT" || entries[r.id].marks !== "").length;
    return {
      done,
      avg: pcts.length ? pcts.reduce((s, v) => s + v, 0) / pcts.length : null,
      high: present.length ? Math.max(...present.map((e) => Number(e.marks))) : null,
      low: present.length ? Math.min(...present.map((e) => Number(e.marks))) : null,
      fails: present.filter((e) => Number(e.marks) < paper.passMarks).length + sheet.rows.filter((r) => entries[r.id].attendance === "ABSENT").length,
    };
  }, [entries, sheet.rows, paper.maxMarks, paper.passMarks]);

  const review = useMutation({
    mutationFn: (input: { action: "APPROVE" | "RETURN"; note?: string }) => examsApi.review({ paperIds: [paper.id], ...input }),
    onSuccess: async (_o, input) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      setDialog(null);
      if (input.action === "APPROVE") navigate("/exams/marks/pending", { state: { toast: "Marks approved." } });
      else setToast("Returned to the teacher.");
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't update"),
  });

  function fillBlanks(attendance: MarkAttendance) {
    sheet.rows.forEach((r) => {
      const e = entries[r.id];
      if (e.attendance === "PRESENT" && e.marks === "") update(r.id, { attendance });
    });
  }

  const missing = sheet.rows.length - stats.done;
  const invalidCount = sheet.rows.filter((r) => invalid(entries[r.id])).length;

  return (
    <div className="flex flex-col gap-5">
      <Link to={`/exams/${paper.examId}?tab=papers`} className="text-sm text-indigo">
        {paper.examName}
      </Link>
      <PageHeader
        title={`${paper.subject} · ${paper.className}`}
        description={`${EXAM_KIND_LABELS[paper.kind]}: ${paper.examName}${paper.date ? ` · ${formatDay(paper.date)}` : ""} · Out of ${fmtNum(paper.maxMarks)} · Pass ${fmtNum(paper.passMarks)}`}
        actions={<PaperStatusBadge status={paper.status} />}
      />

      {paper.syllabus.length ? (
        <details className="rounded-2xl bg-paper p-3 text-sm print:hidden">
          <summary className="cursor-pointer font-medium">
            Syllabus covered ({paper.syllabus.length} {paper.syllabus.length === 1 ? "topic" : "topics"})
          </summary>
          <ul className="mt-2 columns-1 gap-6 text-muted-foreground md:columns-2">
            {paper.syllabus.map((t, i) => (
              <li key={i} className="break-inside-avoid">
                {t.title} <span className="text-xs">· {t.unit}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {paper.status === "RETURNED" && paper.reviewNote ? (
        <p className="rounded-2xl bg-danger/10 p-3 text-sm text-danger" role="status">
          Returned by the admin: “{paper.reviewNote}”. Fix the marks and submit again.
        </p>
      ) : null}
      {paper.status === "SUBMITTED" && !admin ? (
        <p className="rounded-2xl bg-orange/10 p-3 text-sm text-orange" role="status">
          Submitted — waiting for an admin to verify. You'll be able to edit again only if it's returned.
        </p>
      ) : null}
      {paper.status === "APPROVED" ? (
        <p className="rounded-2xl bg-success/10 p-3 text-sm text-success" role="status">
          Approved and locked. To change a mark, use “Request correction” on that student.
        </p>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-3xl bg-surface p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" aria-label="Find a student" className="pl-9" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find by name, roll or admission no" />
        </div>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <>
              <Button variant="outline" size="sm" icon={<ClipboardPaste />} onClick={() => setDialog("paste")}>
                Paste from Excel
              </Button>
              <Button variant="outline" size="sm" icon={<FileUp />} onClick={() => setDialog("import")}>
                Import file
              </Button>
              {missing ? (
                <Button variant="ghost" size="sm" onClick={() => fillBlanks("ABSENT")}>
                  Mark {missing} blank as absent
                </Button>
              ) : null}
            </>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => setShowRemarks((v) => !v)}>
            {showRemarks ? "Hide remarks" : "Add remarks"}
          </Button>
        </div>
      </div>

      {editable ? (
        <p className="text-xs text-muted-foreground">
          Type marks and press <kbd className="rounded bg-paper px-1">Enter</kbd> to move down. Press <kbd className="rounded bg-paper px-1">A</kbd> to mark absent. Drafts save automatically.
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-3xl bg-surface p-2">
        <table className="w-full text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th scope="col" className="w-14 px-3 py-3 font-medium">Roll</th>
              <th scope="col" className="px-3 py-3 font-medium">Student</th>
              <th scope="col" className="w-32 px-3 py-3 font-medium">Marks / {fmtNum(paper.maxMarks)}</th>
              <th scope="col" className="w-36 px-3 py-3 font-medium">Attendance</th>
              <th scope="col" className="w-24 px-3 py-3 font-medium">%</th>
              <th scope="col" className="w-16 px-3 py-3 font-medium">Grade</th>
              {showRemarks ? <th scope="col" className="px-3 py-3 font-medium">Remark</th> : null}
              {permissions.canRequestCorrection ? <th scope="col" className="px-3 py-3 font-medium"><span className="sr-only">Actions</span></th> : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const e = entries[row.id];
              const bad = invalid(e);
              const present = e.attendance === "PRESENT";
              const p = present && e.marks !== "" && !bad ? (Number(e.marks) / paper.maxMarks) * 100 : null;
              const failing = p != null && Number(e.marks) < paper.passMarks;
              return (
                <tr key={row.id} className={`border-t border-line ${dirty.has(row.id) ? "bg-indigo/5" : ""}`}>
                  <td className="px-3 py-1.5 tabular-nums text-muted-foreground">{row.rollNo || "—"}</td>
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.admissionNo}
                      {!row.enrolled ? " · left class" : ""}
                      {row.correctionPending ? " · correction pending" : ""}
                    </span>
                  </td>
                  <td className="px-3 py-1.5">
                    {editable ? (
                      <Input
                        ref={(el) => {
                          inputs.current[index] = el;
                        }}
                        aria-label={`Marks for ${row.name}`}
                        aria-invalid={bad || undefined}
                        inputMode="decimal"
                        className={`w-24 tabular-nums ${failing ? "text-danger" : ""}`}
                        value={present ? e.marks : ""}
                        placeholder={present ? "" : e.attendance === "ABSENT" ? "Abs" : "—"}
                        disabled={!present}
                        onChange={(ev) => update(row.id, { marks: ev.target.value.replace(/[^\d.]/g, "") })}
                        onKeyDown={(ev) => onMarksKey(ev, index, row.id)}
                        onFocus={(ev) => ev.target.select()}
                      />
                    ) : (
                      <span className={`tabular-nums ${failing ? "text-danger" : ""}`}>{present ? (e.marks || "—") : "—"}</span>
                    )}
                    {bad ? <span className="block text-xs text-danger">0 to {fmtNum(paper.maxMarks)}</span> : null}
                  </td>
                  <td className="px-3 py-1.5">
                    {editable ? (
                      <FormSelect
                        id={`att-${row.id}`}
                        value={e.attendance}
                        onValueChange={(v) => update(row.id, { attendance: (v ?? "PRESENT") as MarkAttendance, ...(v !== "PRESENT" ? { marks: "" } : {}) })}
                        options={MARK_ATTENDANCE.map((a) => ({ value: a, label: ATTENDANCE_LABEL[a] }))}
                      />
                    ) : (
                      ATTENDANCE_LABEL[e.attendance]
                    )}
                  </td>
                  <td className="px-3 py-1.5 tabular-nums">{pct(p)}</td>
                  <td className={`px-3 py-1.5 font-medium ${failing ? "text-danger" : ""}`}>{p != null ? gradeOf(p, sheet.bands) : e.attendance === "ABSENT" ? "Abs" : "—"}</td>
                  {showRemarks ? (
                    <td className="px-3 py-1.5">
                      {editable ? (
                        <Input aria-label={`Remark for ${row.name}`} value={e.remark} maxLength={200} onChange={(ev) => update(row.id, { remark: ev.target.value })} placeholder="Optional" />
                      ) : (
                        <span className="text-muted-foreground">{e.remark || "—"}</span>
                      )}
                    </td>
                  ) : null}
                  {permissions.canRequestCorrection ? (
                    <td className="px-3 py-1.5 text-right">
                      <Button size="sm" variant="ghost" disabled={row.correctionPending} onClick={() => setCorrectionFor(row)}>
                        {row.correctionPending ? "Pending" : "Request correction"}
                      </Button>
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!sheet.rows.length ? <p className="p-6 text-center text-sm text-muted-foreground">No students are enrolled in this class.</p> : null}
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-surface p-4 shadow-lg ring-1 ring-line">
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div>
            <dt className="inline text-muted-foreground">Entered </dt>
            <dd className="inline tabular-nums font-medium">
              {stats.done}/{sheet.rows.length}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Average </dt>
            <dd className="inline tabular-nums font-medium">{pct(stats.avg)}</dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">High / low </dt>
            <dd className="inline tabular-nums font-medium">
              {fmtNum(stats.high)} / {fmtNum(stats.low)}
            </dd>
          </div>
          <div>
            <dt className="inline text-muted-foreground">Below pass </dt>
            <dd className={`inline tabular-nums font-medium ${stats.fails ? "text-danger" : ""}`}>{stats.fails}</dd>
          </div>
          <div aria-live="polite" className="text-muted-foreground">
            {save.isPending ? "Saving…" : dirty.size ? `${dirty.size} unsaved` : editable ? "All changes saved" : ""}
          </div>
        </dl>
        <div className="flex flex-wrap gap-2">
          {editable ? (
            <Button variant="outline" disabled={!dirty.size || invalidCount > 0} loading={save.isPending && !save.variables?.submit} onClick={() => save.mutate({ submit: false, ids: [...dirty] })}>
              Save draft
            </Button>
          ) : null}
          {permissions.canSubmit ? (
            <Button icon={<Send />} disabled={invalidCount > 0} onClick={() => setDialog("submit")}>
              Submit for verification
            </Button>
          ) : null}
          {permissions.canReview ? (
            <>
              <Button variant="outline" icon={<Undo2 />} onClick={() => setDialog("return")}>
                Return to teacher
              </Button>
              <Button icon={<CheckCircle2 />} loading={review.isPending} disabled={dirty.size > 0} onClick={() => review.mutate({ action: "APPROVE" })}>
                Approve marks
              </Button>
            </>
          ) : null}
          {permissions.canReopen ? (
            <Button variant="outline" icon={<LockOpen />} onClick={() => setDialog("reopen")}>
              Reopen for editing
            </Button>
          ) : null}
        </div>
      </div>
      {error ? <FieldError>{error}</FieldError> : null}

      <Dialog
        open={dialog === "submit"}
        title="Submit marks for verification?"
        description={
          missing
            ? `${missing} students still have no marks. Enter their marks or mark them absent first.`
            : `All ${sheet.rows.length} students are done. After submitting, an admin verifies the marks; you can't edit them unless they're returned.`
        }
        confirmLabel="Submit"
        loading={save.isPending}
        onClose={() => setDialog(null)}
        onConfirm={() => {
          if (missing) return setDialog(null);
          save.mutate({ submit: true, ids: sheet.rows.map((r) => r.id) }, { onSettled: () => setDialog(null) });
        }}
      />
      <ReturnDialog open={dialog === "return"} loading={review.isPending} onClose={() => setDialog(null)} onConfirm={(note) => review.mutate({ action: "RETURN", note })} />
      <ReopenDialog paperId={paper.id} open={dialog === "reopen"} onClose={() => setDialog(null)} onDone={() => setToast("Paper reopened for editing.")} />
      <PasteSheet open={dialog === "paste"} rows={sheet.rows} maxMarks={paper.maxMarks} onClose={() => setDialog(null)} onApply={(patch) => { Object.entries(patch).forEach(([id, p]) => update(id, p)); setToast(`${Object.keys(patch).length} marks filled in.`); }} />
      <ImportSheet open={dialog === "import"} sheet={sheet} onClose={() => setDialog(null)} onApply={(patch) => { Object.entries(patch).forEach(([id, p]) => update(id, p)); setToast(`${Object.keys(patch).length} marks imported.`); }} />
      <CorrectionSheet paperId={paper.id} maxMarks={paper.maxMarks} row={correctionFor} onClose={() => setCorrectionFor(null)} onDone={() => setToast("Correction requested — an admin will review it.")} />
      <Toast message={toast} />
    </div>
  );
}

function ReturnDialog({ open, loading, onClose, onConfirm }: { open: boolean; loading: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (
    <Dialog open={open} title="Return to the teacher" description="They'll see your note and can fix and resubmit." confirmLabel="Return" loading={loading} onClose={onClose} onConfirm={() => note.trim() && onConfirm(note.trim())}>
      <Field>
        <FieldLabel htmlFor="return-note">What needs fixing?</FieldLabel>
        <Textarea id="return-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Roll 12 and 15 look swapped" />
      </Field>
    </Dialog>
  );
}

function ReopenDialog({ paperId, open, onClose, onDone }: { paperId: string; open: boolean; onClose: () => void; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const reopen = useMutation({
    mutationFn: () => examsApi.reopen(paperId, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      onClose();
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't reopen"),
  });
  return (
    <Dialog open={open} title="Reopen approved marks?" description="The paper goes back to the teacher for editing and must be verified again. This is logged." confirmLabel="Reopen" loading={reopen.isPending} onClose={onClose} onConfirm={() => reopen.mutate()}>
      <Field>
        <FieldLabel htmlFor="reopen-reason">Reason</FieldLabel>
        <Input id="reopen-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        {error ? <FieldError>{error}</FieldError> : null}
      </Field>
    </Dialog>
  );
}

function parseCell(raw: string, maxMarks: number): Partial<Entry> | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^(a|ab|abs|absent)$/i.test(value)) return { attendance: "ABSENT", marks: "" };
  if (/^(m|med|medical)$/i.test(value)) return { attendance: "MEDICAL", marks: "" };
  if (/^(e|ex|exempt)$/i.test(value)) return { attendance: "EXEMPT", marks: "" };
  const n = Number(value);
  if (Number.isNaN(n) || n < 0 || n > maxMarks) return null;
  return { attendance: "PRESENT", marks: String(n) };
}

/** Paste one column of marks copied from a spreadsheet, in the same roll-number order as this list. */
function PasteSheet({ open, rows, maxMarks, onClose, onApply }: { open: boolean; rows: MarksSheetRow[]; maxMarks: number; onClose: () => void; onApply: (patch: Record<string, Partial<Entry>>) => void }) {
  const [text, setText] = useState("");
  const lines = text.split(/\r?\n/).map((l) => l.split("\t").pop() ?? "");
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const skipped = lines.filter((l) => l.trim() && !parseCell(l, maxMarks)).length;
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Paste marks from Excel</SheetTitle>
          <SheetDescription>Copy the marks column (in roll-number order) and paste it here. Use “A” for absent.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-4">
          <Field>
            <FieldLabel htmlFor="paste-area">Marks, one per line</FieldLabel>
            <Textarea id="paste-area" rows={12} value={text} onChange={(e) => setText(e.target.value)} className="font-mono" placeholder={"45\n38\nA\n41"} />
            <FieldDescription>
              {lines.length} lines for {rows.length} students{skipped ? ` · ${skipped} can't be read and will be skipped` : ""}.
            </FieldDescription>
          </Field>
        </FieldGroup>
        <SheetFooter>
          <Button
            type="button"
            disabled={!lines.length}
            onClick={() => {
              const patch: Record<string, Partial<Entry>> = {};
              lines.slice(0, rows.length).forEach((line, i) => {
                const parsed = parseCell(line, maxMarks);
                if (parsed) patch[rows[i].id] = parsed;
              });
              onApply(patch);
              setText("");
              onClose();
            }}
          >
            Fill in marks
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/** CSV / Excel file with an Admission No (or Roll No) column and a Marks column. */
function ImportSheet({ open, sheet, onClose, onApply }: { open: boolean; sheet: MarksSheet; onClose: () => void; onApply: (patch: Record<string, Partial<Entry>>) => void }) {
  const [result, setResult] = useState<{ patch: Record<string, Partial<Entry>>; matched: number; unmatched: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function downloadTemplate() {
    const header = "Roll No,Admission No,Student,Marks";
    const body = sheet.rows.map((r) => [r.rollNo, r.admissionNo, `"${r.name.replace(/"/g, "'")}"`, ""].join(","));
    const blob = new Blob([[header, ...body].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheet.paper.className}-${sheet.paper.subject}-marks.csv`.replace(/\s+/g, "_");
    a.click();
    URL.revokeObjectURL(url);
  }

  async function read(file: File) {
    setError(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const table = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const key = (row: Record<string, unknown>, pattern: RegExp) => Object.keys(row).find((k) => pattern.test(k.trim()));
      const byAdm = new Map(sheet.rows.map((r) => [r.admissionNo.trim().toLowerCase(), r.id]));
      const byRoll = new Map(sheet.rows.filter((r) => r.rollNo).map((r) => [r.rollNo.trim(), r.id]));
      const patch: Record<string, Partial<Entry>> = {};
      let unmatched = 0;
      for (const row of table) {
        const admKey = key(row, /admission/i);
        const rollKey = key(row, /roll/i);
        const marksKey = key(row, /^(marks|score|obtained)/i);
        if (!marksKey) throw new Error("Add a column named “Marks”.");
        const id = (admKey && byAdm.get(String(row[admKey]).trim().toLowerCase())) || (rollKey && byRoll.get(String(row[rollKey]).trim()));
        const parsed = parseCell(String(row[marksKey]), sheet.paper.maxMarks);
        if (!id) unmatched += 1;
        else if (parsed) patch[id] = parsed;
      }
      setResult({ patch, matched: Object.keys(patch).length, unmatched });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read this file");
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Import marks</SheetTitle>
          <SheetDescription>Upload a CSV or Excel file with an Admission No or Roll No column and a Marks column.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-4">
          <Button type="button" variant="outline" icon={<Download />} onClick={() => void downloadTemplate()}>
            Download a ready template
          </Button>
          <Field>
            <FieldLabel htmlFor="import-file">File</FieldLabel>
            <Input id="import-file" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => e.target.files?.[0] && void read(e.target.files[0])} />
          </Field>
          {result ? (
            <p className="text-sm" role="status">
              {result.matched} students matched{result.unmatched ? ` · ${result.unmatched} rows didn't match any student` : ""}.
            </p>
          ) : null}
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <SheetFooter>
          <Button
            type="button"
            disabled={!result?.matched}
            onClick={() => {
              if (result) onApply(result.patch);
              setResult(null);
              onClose();
            }}
          >
            Use these marks
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function CorrectionSheet({ paperId, maxMarks, row, onClose, onDone }: { paperId: string; maxMarks: number; row: MarksSheetRow | null; onClose: () => void; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [marks, setMarks] = useState("");
  const [attendance, setAttendance] = useState<MarkAttendance>("PRESENT");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setMarks(row?.marks == null ? "" : String(row.marks));
    setAttendance(row?.attendance ?? "PRESENT");
    setReason("");
    setError(null);
  }, [row]);
  const request = useMutation({
    mutationFn: () => examsApi.requestCorrection({ paperId, studentId: row!.id, newMarks: attendance === "PRESENT" ? Number(marks) : null, newAttendance: attendance, reason }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: examKeys.root });
      onClose();
      onDone();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Couldn't request"),
  });
  return (
    <Sheet open={Boolean(row)} onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Request a correction</SheetTitle>
          <SheetDescription>
            {row?.name} currently has {row?.attendance === "PRESENT" ? `${fmtNum(row?.marks)} / ${fmtNum(maxMarks)}` : ATTENDANCE_LABEL[row?.attendance ?? "PRESENT"].toLowerCase()}. An admin approves the change.
          </SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-4">
          <Field>
            <FieldLabel htmlFor="corr-att">Attendance</FieldLabel>
            <FormSelect id="corr-att" value={attendance} onValueChange={(v) => setAttendance((v ?? "PRESENT") as MarkAttendance)} options={MARK_ATTENDANCE.map((a) => ({ value: a, label: ATTENDANCE_LABEL[a] }))} />
          </Field>
          {attendance === "PRESENT" ? (
            <Field>
              <FieldLabel htmlFor="corr-marks">Correct marks</FieldLabel>
              <Input id="corr-marks" inputMode="decimal" value={marks} onChange={(e) => setMarks(e.target.value)} className="w-28" />
            </Field>
          ) : null}
          <Field>
            <FieldLabel htmlFor="corr-reason">Reason</FieldLabel>
            <Textarea id="corr-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Totalling error on page 3" />
          </Field>
          {error ? <FieldError>{error}</FieldError> : null}
        </FieldGroup>
        <SheetFooter>
          <Button type="button" loading={request.isPending} disabled={reason.trim().length < 5} onClick={() => request.mutate()}>
            Send request
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
