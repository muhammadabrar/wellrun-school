import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query";

export function CampusesPage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: queryKeys.campuses, queryFn: api.campuses });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function reload() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.campuses });
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await api.addCampus({
        name: String(form.get("name")),
        code: String(form.get("code")),
        address: String(form.get("address")),
        phone: String(form.get("phone")),
        principal: String(form.get("principal")),
      });
      event.currentTarget.reset();
      setMessage("Campus added.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add campus");
    }
  }

  async function onEdit(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await api.updateCampus(id, {
        name: String(form.get("name")),
        code: String(form.get("code")),
        address: String(form.get("address")),
        phone: String(form.get("phone")),
        principal: String(form.get("principal")),
      });
      setMessage("Campus updated.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update campus");
    }
  }

  if (isPending || !data) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-4xl">Campuses</h1>
      <p className="mt-2 text-sm text-muted">The main campus was created during setup. Add branches here.</p>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-indigo">{message}</p> : null}
      <div className="mt-8 space-y-4">
        {data.campuses.map((campus) => (
          <form key={campus.id} onSubmit={(event) => onEdit(campus.id, event)} className="grid grid-cols-2 gap-3 rounded-3xl bg-surface p-6">
            <p className="col-span-2 text-sm text-muted">{campus.isMain ? "Main campus" : "Branch"}</p>
            <input name="name" defaultValue={campus.name} required className="h-11 rounded-xl border border-line px-3" />
            <input name="code" defaultValue={campus.code} className="h-11 rounded-xl border border-line px-3" />
            <input name="address" defaultValue={campus.address} className="h-11 rounded-xl border border-line px-3" />
            <input name="phone" defaultValue={campus.phone} className="h-11 rounded-xl border border-line px-3" />
            <input name="principal" defaultValue={campus.principal} className="h-11 rounded-xl border border-line px-3" />
            <button type="submit" className="h-11 rounded-xl bg-paper">
              Save
            </button>
          </form>
        ))}
        <form onSubmit={onAdd} className="grid grid-cols-2 gap-3 rounded-3xl bg-surface p-6">
          <h2 className="col-span-2 font-display text-xl">Add campus</h2>
          <input name="name" required placeholder="Campus name" className="h-11 rounded-xl border border-line px-3" />
          <input name="code" placeholder="BRANCH" className="h-11 rounded-xl border border-line px-3" />
          <input name="address" placeholder="Address" className="h-11 rounded-xl border border-line px-3" />
          <input name="phone" placeholder="Phone" className="h-11 rounded-xl border border-line px-3" />
          <input name="principal" placeholder="Principal" className="h-11 rounded-xl border border-line px-3" />
          <button type="submit" className="col-span-2 h-11 rounded-xl bg-indigo text-white">
            Add campus
          </button>
        </form>
      </div>
    </div>
  );
}
