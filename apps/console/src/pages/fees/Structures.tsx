import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Dialog, EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo, useRef, useState } from "react";
import { classSortIndex } from "@wellrun/shared";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FeeTitleSelect, frequencyLabel, type FeeFrequency } from "@/components/fees/fee-title-select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCampus } from "@/hooks/use-campus";
import { api, type FeeHead, type FeeStructureRow } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { readYearId } from "@/lib/school-context";

type DraftItem = { feeHeadId: string; name: string; frequency: string; amountPkr: number; isOptional: boolean };

export function FeeStructuresPage() {
  const { classes, campusId, currentYear } = useCampus();
  const yearId = readYearId() || currentYear?.id || "";
  const structures = useQuery({ queryKey: queryKeys.feeStructures, queryFn: api.feeStructures });
  const heads = useQuery({ queryKey: queryKeys.feeHeads, queryFn: api.feeHeads });
  const queryClient = useQueryClient();
  const [copyOpen, setCopyOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const syncFees = useMutation({
    mutationFn: api.syncFeesFromAdmission,
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["fees"] });
      setCopyMessage(
        result.updated
          ? `Admission fees applied to ${result.updated} student(s): ${result.students.join(", ")}. Invoices already issued are unchanged — cancel and regenerate any that used the class amounts.`
          : "Every admitted student already uses their admission fees.",
      );
    },
    onError: (err) => setCopyMessage(err instanceof Error ? err.message : "Could not apply admission fees."),
  });
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [classSearch, setClassSearch] = useState("");
  const [catalogVersion, setCatalogVersion] = useState(0);
  const activeHeads = (heads.data ?? []).filter((head) => head.active);
  const copyableHeads = activeHeads.filter((head) => head.frequency !== "ONE_TIME");
  const applyCatalog = useMutation({
    mutationFn: () => api.applyFeeCatalog({ academicYearId: yearId, campusId: campusId || null, classNames }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.feeStructures });
      setCatalogVersion((value) => value + 1);
      setCopyMessage(
        result.created || result.updated
          ? `Fee heads added: ${result.created} new class structure(s), ${result.updated} updated. Open a class to change its amounts.`
          : "Every class already has all catalog fee heads.",
      );
    },
    onError: (err) => setCopyMessage(err instanceof Error ? err.message : "Could not copy the fee heads."),
  });

  const classNames = useMemo(() => {
    const names = new Set<string>();
    for (const cls of classes) if (cls.yearId === yearId || !yearId) names.add(cls.name);
    for (const row of structures.data ?? []) if (row.className) names.add(row.className);
    return [...names].sort((a, b) => classSortIndex(a) - classSortIndex(b) || a.localeCompare(b));
  }, [classes, structures.data, yearId]);

  const byClass = useMemo(() => {
    const map = new Map<string, FeeStructureRow>();
    for (const row of structures.data ?? []) {
      if (!row.className) continue;
      const current = map.get(row.className);
      if (!current) {
        map.set(row.className, row);
        continue;
      }
      const score = (item: FeeStructureRow) => (item.status === "ACTIVE" ? 2 : 0) + (item.section ? 0 : 1);
      if (score(row) > score(current)) map.set(row.className, row);
    }
    return map;
  }, [structures.data]);

  // Selected class lives in the URL; default to the first class still missing fees.
  const selectedClass =
    (params.get("class") && classNames.includes(params.get("class")!) ? params.get("class") : null) ??
    classNames.find((name) => !byClass.get(name)?.items.length) ??
    classNames[0] ??
    null;
  function selectClass(name: string) {
    const next = new URLSearchParams(params);
    next.set("class", name);
    setParams(next, { replace: true });
  }

  if (structures.isPending && !structures.data) return <LoadingState variant="table" />;
  if (structures.isError) {
    return (
      <ErrorState title="Could not load fee structures" description="Try again." onRetry={() => void structures.refetch()} />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Fee structures"
        description="The monthly fee for each class on this campus and year. Open a class to change amounts — edits save as you type and never change invoices already issued."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={!classNames.length || !copyableHeads.length || !yearId} onClick={() => setCopyOpen(true)}>
              Copy fee heads to all classes
            </Button>
            <Button type="button" variant="outline" onClick={() => setSyncOpen(true)}>
              Apply admission fees to existing students
            </Button>
          </div>
        }
      />
      {copyMessage ? (
        <p className="text-sm text-primary" role="status">
          {copyMessage}
        </p>
      ) : null}
      <Dialog
        open={syncOpen}
        title="Apply admission fees to existing students?"
        description="Students admitted through a new application will be billed monthly at the fees agreed in their admission (custom amounts, discounts, optional fees) instead of the class list price. Only students without custom fees are changed. Invoices already issued are not changed."
        confirmLabel="Apply"
        loading={syncFees.isPending}
        onClose={() => setSyncOpen(false)}
        onConfirm={() => {
          setCopyMessage(null);
          void syncFees.mutateAsync().finally(() => setSyncOpen(false));
        }}
      />
      <Dialog
        open={copyOpen}
        title="Copy all fee heads to every class?"
        description={`Adds ${copyableHeads.length} fee head(s) (${copyableHeads.map((head) => head.name).join(", ")}) at their catalog amounts to ${classNames.length} class(es). Classes keep the fees and amounts they already have — only missing ones are added. One-time fees such as admission are left out; they are charged at admission.`}
        confirmLabel="Copy to all classes"
        loading={applyCatalog.isPending}
        onClose={() => setCopyOpen(false)}
        onConfirm={() => {
          setCopyMessage(null);
          void applyCatalog.mutateAsync().finally(() => setCopyOpen(false));
        }}
      />
      {!classNames.length ? (
        <EmptyState title="No classes yet" description="Add classes in Classes & subjects, then set the monthly fee for each class here." />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[18rem_1fr]">
          <nav aria-label="Classes" className="rounded-3xl bg-surface p-2 lg:sticky lg:top-4">
            <Input
              value={classSearch}
              onChange={(event) => setClassSearch(event.target.value)}
              placeholder="Find a class"
              aria-label="Find a class"
              className="mb-2"
            />
            <ul className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
              {classNames
                .filter((name) => name.toLowerCase().includes(classSearch.trim().toLowerCase()))
                .map((name) => {
                  const structure = byClass.get(name);
                  const count = structure?.items.length ?? 0;
                  const isSelected = name === selectedClass;
                  return (
                    <li key={name}>
                      <button
                        type="button"
                        aria-current={isSelected ? "page" : undefined}
                        onClick={() => selectClass(name)}
                        className={`flex w-full items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ${
                          isSelected ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium">{name}</span>
                          <span className={`block text-xs ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                            {count ? `${count} fee${count === 1 ? "" : "s"}` : "No fees yet"}
                          </span>
                        </span>
                        {count ? (
                          <span className="shrink-0 tabular-nums">{pkr(structure?.subtotalPkr ?? 0)}</span>
                        ) : (
                          <Badge tone="warning" className={isSelected ? "bg-white text-orange" : undefined}>
                            Not set
                          </Badge>
                        )}
                      </button>
                    </li>
                  );
                })}
            </ul>
          </nav>
          {selectedClass ? (
            <ClassStructurePanel
              key={`${selectedClass}-${catalogVersion}`}
              className={selectedClass}
              yearId={yearId}
              campusId={campusId}
              structure={byClass.get(selectedClass) ?? null}
              heads={activeHeads}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ClassStructurePanel({
  className,
  yearId,
  campusId,
  structure,
  heads,
}: {
  className: string;
  yearId: string;
  campusId: string;
  structure: FeeStructureRow | null;
  heads: FeeHead[];
}) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<DraftItem[]>(() => toDraft(structure));
  const [addHeadId, setAddHeadId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newFrequency, setNewFrequency] = useState<FeeFrequency>("MONTHLY");
  const [savedOnce, setSavedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const itemsRef = useRef(items);
  const structureIdRef = useRef(structure?.id ?? null);
  itemsRef.current = items;
  structureIdRef.current = structure?.id ?? null;

  const createHead = useMutation({ mutationFn: api.createFeeHead });
  const persist = useDebouncedCallback(async () => {
    if (!yearId) {
      setError("Choose an academic year in the switcher.");
      return;
    }
    const current = itemsRef.current;
    setError(null);
    setSaving(true);
    try {
      const payload = {
        name: className,
        academicYearId: yearId,
        campusId: campusId || null,
        className,
        section: "",
        frequency: "MONTHLY",
        status: "ACTIVE",
        items: current.map((item, index) => ({
          feeHeadId: item.feeHeadId,
          amountPkr: item.amountPkr,
          isOptional: item.isOptional,
          sortOrder: index,
        })),
      };
      if (!structureIdRef.current) {
        if (!current.length) return;
        const created = await api.createFeeStructure(payload);
        structureIdRef.current = created.id;
      } else {
        await api.updateFeeStructure(structureIdRef.current, payload);
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.feeStructures });
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeSetupStatus });
      setSavedOnce(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this class fee");
    } finally {
      setSaving(false);
    }
  }, 450);

  function replace(next: DraftItem[]) {
    itemsRef.current = next;
    setItems(next);
    persist();
  }

  function addExisting() {
    const head = heads.find((row) => row.id === addHeadId);
    if (!head) return;
    setAddHeadId(null);
    replace([...items, { feeHeadId: head.id, name: head.name, frequency: head.frequency, amountPkr: head.amountPkr, isOptional: false }]);
  }

  async function addNew() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const head = await createHead.mutateAsync({ name, amountPkr: Number(newAmount || 0), frequency: newFrequency });
      await queryClient.invalidateQueries({ queryKey: queryKeys.feeHeads });
      setNewName("");
      setNewAmount("");
      setNewFrequency("MONTHLY");
      replace([...items, { feeHeadId: head.id, name: head.name, frequency: head.frequency, amountPkr: head.amountPkr, isOptional: false }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this fee");
    }
  }

  const unusedHeads = heads.filter((head) => !items.some((item) => item.feeHeadId === head.id));
  const monthlyTotal = items.filter((item) => item.frequency !== "ONE_TIME").reduce((sum, item) => sum + item.amountPkr, 0);
  const oneTimeTotal = items.filter((item) => item.frequency === "ONE_TIME").reduce((sum, item) => sum + item.amountPkr, 0);

  return (
    <Card className="h-fit">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-2xl">{className}</CardTitle>
          <CardDescription>Fees charged to every student in {className}. Changes save automatically and never alter invoices already issued.</CardDescription>
        </div>
        <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
          {saving ? "Saving…" : savedOnce ? "Saved ✓" : ""}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {!items.length ? (
          <EmptyState title={`No fees for ${className} yet`} description="Add fees from your Fee Heads below, or create a new fee title." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="pb-2 font-medium">Fee</th>
                  <th className="pb-2 font-medium">Charged</th>
                  <th className="pb-2 font-medium">Amount (Rs.)</th>
                  <th className="pb-2 font-medium">Optional</th>
                  <th className="pb-2">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.feeHeadId} className="border-t border-line">
                    <td className="py-2 pr-3 font-medium">{item.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{frequencyLabel(item.frequency)}</td>
                    <td className="w-40 py-2 pr-3">
                      <Input
                        aria-label={`${item.name} amount`}
                        type="number"
                        min={0}
                        step={1}
                        value={item.amountPkr}
                        onChange={(event) =>
                          replace(items.map((row) => (row.feeHeadId === item.feeHeadId ? { ...row, amountPkr: Number(event.target.value) || 0 } : row)))
                        }
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <Switch
                        aria-label={`${item.name} is optional`}
                        checked={item.isOptional}
                        onCheckedChange={(checked) => replace(items.map((row) => (row.feeHeadId === item.feeHeadId ? { ...row, isOptional: checked } : row)))}
                      />
                    </td>
                    <td className="py-2 text-right">
                      <Button type="button" variant="ghost" size="sm" onClick={() => replace(items.filter((row) => row.feeHeadId !== item.feeHeadId))}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line font-medium">
                  <td className="pt-3" colSpan={2}>
                    Monthly total
                  </td>
                  <td className="pt-3 tabular-nums" colSpan={3}>
                    {pkr(monthlyTotal)}
                    {oneTimeTotal ? <span className="ml-2 text-xs font-normal text-muted-foreground">+ {pkr(oneTimeTotal)} one-time at admission</span> : null}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="grid gap-4 rounded-2xl border border-line p-4 md:grid-cols-2">
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Add from Fee Heads</p>
            {unusedHeads.length ? (
              <>
                <FormSelect
                  id={`add-existing-${className}`}
                  value={addHeadId}
                  onValueChange={setAddHeadId}
                  placeholder="Choose a fee"
                  options={unusedHeads.map((head) => ({ value: head.id, label: `${head.name} · ${pkr(head.amountPkr)}` }))}
                />
                <Button type="button" variant="outline" disabled={!addHeadId} onClick={addExisting}>
                  Add to {className}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Every fee head is already on this class.</p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium">Or a new fee</p>
            <FeeTitleSelect
              value={newName}
              existingTitles={heads.map((head) => head.name)}
              onChange={(title, suggested) => {
                setNewName(title);
                if (suggested) setNewFrequency(suggested);
              }}
            />
            <div className="flex gap-2">
              <Input
                aria-label="New fee amount"
                type="number"
                min={0}
                step={1}
                placeholder="Amount (Rs.)"
                value={newAmount}
                onChange={(event) => setNewAmount(event.target.value)}
              />
              <Button type="button" loading={createHead.isPending} disabled={!newName.trim() || !yearId} onClick={() => void addNew()}>
                Add
              </Button>
            </div>
            {newName ? <p className="text-xs text-muted-foreground">Charged: {frequencyLabel(newFrequency)}. Also added to Fee Heads.</p> : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function toDraft(structure: FeeStructureRow | null): DraftItem[] {
  return (structure?.items ?? []).map((item) => ({
    feeHeadId: item.feeHeadId,
    name: item.feeHead?.name ?? "Fee",
    frequency: item.feeHead?.frequency ?? "MONTHLY",
    amountPkr: item.amountPkr,
    isOptional: item.isOptional,
  }));
}

function useDebouncedCallback(fn: () => void | Promise<void>, wait: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timer = useRef<number>(0);
  return useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      void fnRef.current();
    }, wait);
  }, [wait]);
}
