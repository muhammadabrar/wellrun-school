import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeStructureEditPage() {
  const { id } = useParams();
  const queryClient = useQueryClient();
  const structure = useQuery({
    queryKey: queryKeys.feeStructureDetail(id ?? ""),
    queryFn: () => api.feeStructureDetail(id!),
    enabled: Boolean(id),
  });
  const heads = useQuery({ queryKey: queryKeys.feeHeads, queryFn: api.feeHeads });
  const [error, setError] = useState<string | null>(null);
  const [addHeadId, setAddHeadId] = useState<string | null>(null);
  const [items, setItems] = useState<{ feeHeadId: string; amountPkr: number; isOptional: boolean }[] | null>(null);
  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.updateFeeStructure(id!, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.feeStructureDetail(id ?? "") }),
  });

  if (structure.isPending && !structure.data) return <LoadingState variant="form" />;
  if (structure.isError || !structure.data) {
    return <ErrorState title="Could not load this structure" description="It may have been removed." onRetry={() => void structure.refetch()} />;
  }

  const rows = items ?? structure.data.items.map((item) => ({ feeHeadId: item.feeHeadId, amountPkr: item.amountPkr, isOptional: item.isOptional }));
  const subtotal = rows.reduce((sum, row) => sum + row.amountPkr, 0);
  const unused = (heads.data ?? []).filter((head) => head.active && !rows.some((row) => row.feeHeadId === head.id));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader
        title={structure.data.name}
        description={structure.data.className || "Class fee structure"}
        actions={<Button variant="outline" render={<Link to="/fees/structures" />}>Back</Button>}
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((row, index) => {
          const head = heads.data?.find((item) => item.id === row.feeHeadId);
          return (
            <li key={`${row.feeHeadId}-${index}`} className="flex flex-wrap items-end gap-3 rounded-2xl bg-surface p-4">
              <Field className="min-w-48 flex-1">
                <FieldLabel>Fee head</FieldLabel>
                <p className="pt-2 text-sm font-medium">{head?.name ?? row.feeHeadId}</p>
              </Field>
              <Field>
                <FieldLabel htmlFor={`amount-${index}`}>Amount (Rs.)</FieldLabel>
                <Input
                  id={`amount-${index}`}
                  type="number"
                  min={0}
                  value={row.amountPkr}
                  onChange={(event) =>
                    setItems(rows.map((item, i) => (i === index ? { ...item, amountPkr: Number(event.target.value) } : item)))
                  }
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`optional-${index}`}>Optional</FieldLabel>
                <div className="flex h-10 items-center">
                  <Switch
                    id={`optional-${index}`}
                    checked={row.isOptional}
                    onCheckedChange={(checked) =>
                      setItems(rows.map((item, i) => (i === index ? { ...item, isOptional: checked } : item)))
                    }
                  />
                </div>
              </Field>
              <Button type="button" variant="ghost" onClick={() => setItems(rows.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-end gap-3">
        <Field className="min-w-56">
          <FieldLabel htmlFor="add-head">Add fee head</FieldLabel>
          <FormSelect
            id="add-head"
            value={addHeadId}
            onValueChange={(value) => {
              if (!value) return;
              const head = heads.data?.find((row) => row.id === value);
              setItems([...rows, { feeHeadId: value, amountPkr: head?.amountPkr ?? 0, isOptional: false }]);
              setAddHeadId(null);
            }}
            placeholder="Choose"
            options={unused.map((head) => ({ value: head.id, label: head.name }))}
            disabled={!unused.length}
          />
        </Field>
        <p className="text-sm text-muted-foreground">Subtotal {pkr(subtotal)}</p>
        <Button
          type="button"
          loading={save.isPending}
          onClick={async () => {
            setError(null);
            try {
              await save.mutateAsync({ items: rows.map((row, index) => ({ ...row, sortOrder: index })), section: "" });
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save this structure");
            }
          }}
        >
          Save structure
        </Button>
      </div>
    </div>
  );
}
