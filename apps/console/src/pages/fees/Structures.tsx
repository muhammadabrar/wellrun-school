import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ChevronDownIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { classSortIndex } from "@wellrun/shared";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCampus } from "@/hooks/use-campus";
import { api, type FeeHead, type FeeStructureRow } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { readYearId } from "@/lib/school-context";

type DraftItem = { feeHeadId: string; name: string; amountPkr: number; isOptional: boolean };

export function FeeStructuresPage() {
  const { classes, campusId, currentYear } = useCampus();
  const yearId = readYearId() || currentYear?.id || "";
  const structures = useQuery({ queryKey: queryKeys.feeStructures, queryFn: api.feeStructures });
  const heads = useQuery({ queryKey: queryKeys.feeHeads, queryFn: api.feeHeads });

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
        description="One monthly structure per class for this campus and year. Open a class to edit. Edits save as you type and do not rewrite issued invoices."
      />
      {!classNames.length ? (
        <EmptyState title="No classes yet" description="Add classes in Academics, then set monthly fees for each grade here." />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {classNames.map((className) => (
            <ClassStructureCard
              key={className}
              className={className}
              yearId={yearId}
              campusId={campusId}
              structure={byClass.get(className) ?? null}
              heads={(heads.data ?? []).filter((head) => head.active)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClassStructureCard({
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
        name: `${className} monthly fee`,
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

  async function rename(feeHeadId: string, name: string) {
    const next = items.map((item) => (item.feeHeadId === feeHeadId ? { ...item, name } : item));
    itemsRef.current = next;
    setItems(next);
    try {
      await api.updateFeeHead(feeHeadId, { name });
      await queryClient.invalidateQueries({ queryKey: queryKeys.feeHeads });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename this fee");
    }
  }

  async function addExisting() {
    const head = heads.find((row) => row.id === addHeadId);
    if (!head) return;
    setAddHeadId(null);
    replace([...items, { feeHeadId: head.id, name: head.name, amountPkr: head.amountPkr, isOptional: false }]);
  }

  async function addNew() {
    const name = newName.trim();
    if (!name) return;
    setError(null);
    try {
      const head = await createHead.mutateAsync({
        name,
        amountPkr: Number(newAmount || 0),
        frequency: "MONTHLY",
        category: "tuition",
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.feeHeads });
      setNewName("");
      setNewAmount("");
      replace([...items, { feeHeadId: head.id, name: head.name, amountPkr: head.amountPkr, isOptional: false }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add this fee");
    }
  }

  const unusedHeads = heads.filter((head) => !items.some((item) => item.feeHeadId === head.id));
  const total = items.reduce((sum, item) => sum + item.amountPkr, 0);
  const summary = saving
    ? "Saving…"
    : items.length
      ? `${items.length} fees · ${pkr(total)}`
      : "Add the fees charged for this class.";

  return (
    <Collapsible defaultOpen={!items.length} className="group/class-card h-fit">
      <Card className="h-fit overflow-hidden">
        <CollapsibleTrigger className="w-full cursor-pointer border-0 bg-transparent p-0 text-left text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
            <div className="min-w-0">
              <CardTitle>{className} monthly fee</CardTitle>
              <CardDescription>{summary}</CardDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2 pt-0.5">
              <p className="font-display text-xl tabular-nums">{pkr(total)}</p>
              <ChevronDownIcon
                aria-hidden
                className="size-5 text-muted-foreground transition-transform duration-200 group-data-open/class-card:rotate-180 motion-reduce:transition-none"
              />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="flex flex-col gap-4 border-t border-line pt-(--card-spacing)">
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {!items.length ? (
              <EmptyState title={`No fees for ${className}`} description="Add a catalog fee or create a new one for this class." />
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li key={item.feeHeadId} className="flex flex-col gap-3 rounded-2xl bg-paper px-4 py-3">
                    <Field>
                      <FieldLabel htmlFor={`name-${className}-${item.feeHeadId}`}>Fee</FieldLabel>
                      <Input
                        id={`name-${className}-${item.feeHeadId}`}
                        value={item.name}
                        onChange={(event) => {
                          const name = event.target.value;
                          setItems((current) => current.map((row) => (row.feeHeadId === item.feeHeadId ? { ...row, name } : row)));
                        }}
                        onBlur={(event) => {
                          const name = event.target.value.trim();
                          if (!name) return;
                          void rename(item.feeHeadId, name);
                        }}
                      />
                    </Field>
                    <div className="grid grid-cols-[1fr_auto_auto] items-end gap-3">
                      <Field>
                        <FieldLabel htmlFor={`amount-${className}-${item.feeHeadId}`}>Amount (Rs.)</FieldLabel>
                        <Input
                          id={`amount-${className}-${item.feeHeadId}`}
                          type="number"
                          min={0}
                          step={1}
                          value={item.amountPkr}
                          onChange={(event) =>
                            replace(
                              items.map((row) =>
                                row.feeHeadId === item.feeHeadId ? { ...row, amountPkr: Number(event.target.value) || 0 } : row,
                              ),
                            )
                          }
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor={`optional-${className}-${item.feeHeadId}`}>Optional</FieldLabel>
                        <div className="flex h-10 items-center">
                          <Switch
                            id={`optional-${className}-${item.feeHeadId}`}
                            aria-label={`Optional ${item.name}`}
                            checked={item.isOptional}
                            onCheckedChange={(checked) =>
                              replace(items.map((row) => (row.feeHeadId === item.feeHeadId ? { ...row, isOptional: checked } : row)))
                            }
                          />
                        </div>
                      </Field>
                      <Button
                        type="button"
                        variant="ghost"
                        className="mb-0.5"
                        onClick={() => replace(items.filter((row) => row.feeHeadId !== item.feeHeadId))}
                      >
                        Remove
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-3 rounded-2xl border border-line p-4">
              {unusedHeads.length ? (
                <>
                  <Field>
                    <FieldLabel htmlFor={`add-existing-${className}`}>Add from catalog</FieldLabel>
                    <FormSelect
                      id={`add-existing-${className}`}
                      value={addHeadId}
                      onValueChange={setAddHeadId}
                      placeholder="Choose a fee head"
                      options={unusedHeads.map((head) => ({ value: head.id, label: `${head.name} (${pkr(head.amountPkr)})` }))}
                    />
                  </Field>
                  <Button type="button" variant="outline" disabled={!addHeadId} onClick={() => void addExisting()}>
                    Add fee
                  </Button>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">All catalog fees are already on this class. Add a new fee below.</p>
              )}
            </div>
            <div className="grid gap-3 rounded-2xl border border-line p-4">
              <Field>
                <FieldLabel htmlFor={`new-name-${className}`}>New fee name</FieldLabel>
                <Input
                  id={`new-name-${className}`}
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="Computer"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`new-amount-${className}`}>Amount (Rs.)</FieldLabel>
                <Input
                  id={`new-amount-${className}`}
                  type="number"
                  min={0}
                  step={1}
                  value={newAmount}
                  onChange={(event) => setNewAmount(event.target.value)}
                />
              </Field>
              <Button type="button" loading={createHead.isPending} disabled={!newName.trim() || !yearId} onClick={() => void addNew()}>
                Add new fee
              </Button>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

function toDraft(structure: FeeStructureRow | null): DraftItem[] {
  return (structure?.items ?? []).map((item) => ({
    feeHeadId: item.feeHeadId,
    name: item.feeHead?.name ?? "Fee",
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
