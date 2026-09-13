import { useEffect, useState } from "react";
import { api } from "../lib/api";

export function FeeStructurePage() {
  const [items, setItems] = useState<{ name: string; amountPkr: number; enabled: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api.setup().then((next) => {
      setItems(
        next.feeItems.length
          ? next.feeItems
          : next.templates.feeItems.map((name) => ({ name, amountPkr: 0, enabled: true })),
      );
    });
  }, []);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-4xl">Fee structure</h1>
      <p className="mt-2 text-sm text-muted">These are the fee heads for invoices. Collecting payments stays on Fees.</p>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-indigo">{message}</p> : null}
      <section className="mt-8 rounded-3xl bg-surface p-6">
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li key={`${item.name}-${index}`} className="flex items-center gap-2">
              <input
                value={item.name}
                onChange={(e) => setItems((rows) => rows.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)))}
                className="h-11 flex-1 rounded-xl border border-line px-3"
              />
              <input
                type="number"
                value={item.amountPkr}
                onChange={(e) =>
                  setItems((rows) => rows.map((row, i) => (i === index ? { ...row, amountPkr: Number(e.target.value) } : row)))
                }
                className="h-11 w-32 rounded-xl border border-line px-3"
              />
              <button type="button" className="text-sm text-danger" onClick={() => setItems((rows) => rows.filter((_, i) => i !== index))}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="mt-3 text-sm text-indigo"
          onClick={() => setItems((rows) => [...rows, { name: "New fee", amountPkr: 0, enabled: true }])}
        >
          Add fee
        </button>
        <button
          type="button"
          className="mt-6 block h-11 rounded-xl bg-indigo px-4 text-white"
          onClick={async () => {
            setError(null);
            try {
              await api.saveFees({ items });
              setMessage("Fee structure saved.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save fees");
            }
          }}
        >
          Save fee structure
        </button>
      </section>
    </div>
  );
}
