import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState } from "@wellrun/ui";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { FeeTitleSelect, frequencyLabel, type FeeFrequency } from "./fee-title-select";

type Row = { feeHeadId: string; name: string; frequency: string; amountPkr: number; include: boolean };

/**
 * Creates a class's fee structure on the spot — used in the admission wizard when the admin is
 * admitting into a class nobody has set fees for yet.
 */
export function InlineClassFeeSetup({
  className,
  academicYearId,
  campusId,
}: {
  className: string;
  academicYearId: string;
  campusId: string | null;
}) {
  const queryClient = useQueryClient();
  const heads = useQuery({ queryKey: queryKeys.feeHeads, queryFn: api.feeHeads });
  const [edits, setEdits] = useState<Record<string, { amountPkr?: number; include?: boolean }>>({});
  const [newTitle, setNewTitle] = useState("");
  const [newFrequency, setNewFrequency] = useState<FeeFrequency>("MONTHLY");
  const [newAmount, setNewAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const rows: Row[] = (heads.data ?? [])
    .filter((head) => head.active)
    .map((head) => ({
      feeHeadId: head.id,
      name: head.name,
      frequency: head.frequency,
      amountPkr: edits[head.id]?.amountPkr ?? head.amountPkr,
      include: edits[head.id]?.include ?? true,
    }));
  const included = rows.filter((row) => row.include);

  const addHead = useMutation({
    mutationFn: () => api.createFeeHead({ name: newTitle.trim(), amountPkr: Number(newAmount || 0), frequency: newFrequency }),
    onSuccess: async () => {
      setNewTitle("");
      setNewAmount("");
      setNewFrequency("MONTHLY");
      await queryClient.invalidateQueries({ queryKey: queryKeys.feeHeads });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not add this fee"),
  });
  const save = useMutation({
    mutationFn: () =>
      api.createFeeStructure({
        name: className,
        className,
        section: "",
        academicYearId,
        campusId,
        frequency: "MONTHLY",
        status: "ACTIVE",
        items: included.map((row, index) => ({ feeHeadId: row.feeHeadId, amountPkr: row.amountPkr, sortOrder: index })),
      }),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeSetupStatus });
      await queryClient.invalidateQueries({ queryKey: queryKeys.feeStructures });
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Could not save the fee structure"),
  });

  function edit(feeHeadId: string, patch: { amountPkr?: number; include?: boolean }) {
    setEdits((current) => ({ ...current, [feeHeadId]: { ...current[feeHeadId], ...patch } }));
  }

  if (heads.isPending) return <LoadingState variant="form" />;

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-indigo/20 bg-indigo/5 p-4">
      <div>
        <p className="font-medium">Set up fees for {className}</p>
        <p className="text-sm text-muted-foreground">
          {className} has no fee structure yet. Choose the fees every {className} student pays — this becomes the class fee structure, and you can adjust this student's amounts next.
        </p>
      </div>
      {rows.length ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.feeHeadId} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface px-3 py-2">
              <label className="flex min-w-40 flex-1 cursor-pointer items-center gap-2 text-sm">
                <Checkbox checked={row.include} onCheckedChange={(checked) => edit(row.feeHeadId, { include: checked === true })} />
                <span>
                  <span className="block font-medium">{row.name}</span>
                  <span className="block text-xs text-muted-foreground">{frequencyLabel(row.frequency)}</span>
                </span>
              </label>
              <Input
                aria-label={`${row.name} amount`}
                type="number"
                min={0}
                step={1}
                className="w-32"
                disabled={!row.include}
                value={row.amountPkr}
                onChange={(event) => edit(row.feeHeadId, { amountPkr: Number(event.target.value) || 0 })}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No fees added yet. Add the first one below.</p>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
        <FeeTitleSelect
          value={newTitle}
          existingTitles={rows.map((row) => row.name)}
          onChange={(title, suggested) => {
            setNewTitle(title);
            if (suggested) setNewFrequency(suggested);
          }}
          placeholder="Add another fee"
        />
        <Input aria-label="Amount" type="number" min={0} step={1} placeholder="Amount" value={newAmount} onChange={(event) => setNewAmount(event.target.value)} />
        <Button type="button" variant="outline" loading={addHead.isPending} disabled={!newTitle.trim()} onClick={() => addHead.mutate()}>
          Add fee
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-indigo/10 pt-3">
        <p className="text-sm">
          {included.length} fee{included.length === 1 ? "" : "s"} ·{" "}
          <span className="font-medium">{pkr(included.filter((row) => row.frequency !== "ONE_TIME").reduce((sum, row) => sum + row.amountPkr, 0))}</span> a month
        </p>
        <Button type="button" loading={save.isPending} disabled={!included.length || !academicYearId} onClick={() => { setError(null); save.mutate(); }}>
          Save fees for {className}
        </Button>
      </div>
    </div>
  );
}
