import { useQuery } from "@tanstack/react-query";
import { LoadingState } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query";

export function FeeStructurePage() {
  const { data, isPending } = useQuery({ queryKey: queryKeys.feeStructure, queryFn: api.feeStructure });
  const [draft, setDraft] = useState<{ name: string; amountPkr: number; enabled: boolean }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const items =
    draft ??
    (data
      ? data.feeItems.length
        ? data.feeItems
        : data.templates.feeItems.map((name) => ({ name, amountPkr: 0, enabled: true }))
      : []);

  if (isPending && !data) return <LoadingState variant="form" />;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl">Fee structure</h1>
      <p className="mt-2 text-sm text-muted-foreground">These are the fee heads for invoices. Collecting payments stays on Fees.</p>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-indigo">{message}</p> : null}
      <section className="mt-8 rounded-3xl bg-surface p-6">
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex items-center gap-2">
              <Input
                value={item.name}
                onChange={(e) => setDraft(items.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)))}
                className="flex-1"
              />
              <Input
                type="number"
                value={item.amountPkr}
                onChange={(e) =>
                  setDraft(items.map((row, i) => (i === index ? { ...row, amountPkr: Number(e.target.value) } : row)))
                }
                className="w-32"
              />
              <Button type="button" variant="ghost" className="text-destructive" onClick={() => setDraft(items.filter((_, i) => i !== index))}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="link"
          className="mt-3 px-0"
          onClick={() => setDraft([...items, { name: "New fee", amountPkr: 0, enabled: true }])}
        >
          Add fee
        </Button>
        <Button
          type="button"
          className="mt-6"
          loading={saving}
          onClick={async () => {
            setError(null);
            setSaving(true);
            try {
              await api.saveFees({ items });
              setMessage("Fee structure saved.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save fees");
            } finally {
              setSaving(false);
            }
          }}
        >
          Save fee structure
        </Button>
      </section>
    </div>
  );
}
