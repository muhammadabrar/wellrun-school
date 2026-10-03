import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ITEM_KINDS, ITEM_KIND_LABEL, ITEM_STATUSES, ITEM_STATUS_LABEL, type ItemKind } from "@wellrun/shared";
import { Badge, Dialog, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination, Tabs } from "@wellrun/ui";
import { Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { financeKeys, inventoryApi, inventoryKeys } from "@/lib/finance-api";
import { pkr } from "@/lib/format";
import { useClampPage } from "@/lib/paging";

const ALL = "all";

type Draft = { name: string; kind: ItemKind; category: string; unit: string; location: string; reorderLevel: string; unitCost: string; code: string };
const blank: Draft = { name: "", kind: "CONSUMABLE", category: "", unit: "pcs", location: "", reorderLevel: "", unitCost: "", code: "" };

export function InventoryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") ?? ALL;
  const status = params.get("status") ?? ALL;
  const low = params.get("low") === "1";
  const inactive = params.get("inactive") === "1";
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key !== "page") next.delete("page");
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

  const summary = useQuery({ queryKey: inventoryKeys.summary, queryFn: inventoryApi.summary });
  const query = { kind: kind === ALL ? undefined : kind, status: status === ALL ? undefined : status, low: low ? "1" : undefined, inactive: inactive ? "1" : undefined, q: q || undefined, page: page > 1 ? page : undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: inventoryKeys.items(query), queryFn: () => inventoryApi.items(query), placeholderData: keepPreviousData });
  useClampPage(data, (next) => setParam("page", next > 1 ? String(next) : null));

  const create = useMutation({
    mutationFn: (d: Draft) =>
      inventoryApi.createItem({ name: d.name, code: d.code, kind: d.kind, category: d.category, unit: d.unit || "pcs", location: d.location, reorderLevel: d.kind === "CONSUMABLE" && d.reorderLevel !== "" ? Number(d.reorderLevel) : null, unitCostPkr: Number(d.unitCost) || 0 }),
    onSuccess: (item) => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.root });
      void queryClient.invalidateQueries({ queryKey: financeKeys.root });
      setDraft(null);
      navigate(`/inventory/${item.id}`);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't add the item"),
  });

  const s = summary.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Furniture, equipment and supplies. Record what you buy, give out or lose; what you spend on purchases goes into Accounts by itself."
        actions={
          <Button onClick={() => { setError(null); setDraft(blank); }}>
            <Plus className="size-4" aria-hidden /> Add an item
          </Button>
        }
      />

      <section aria-label="Summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-sm text-muted-foreground">Items</p>
          <p className="font-display text-3xl tabular-nums">{s ? s.items.toLocaleString("en-PK") : "—"}</p>
          <p className="text-xs text-muted-foreground">{s ? `${s.assets} assets, ${s.consumables} consumables` : ""}</p>
        </div>
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-sm text-muted-foreground">Worth now</p>
          <p className="font-display text-3xl tabular-nums">{s ? pkr(s.valuePkr) : "—"}</p>
          <p className="text-xs text-muted-foreground">At the latest price paid</p>
        </div>
        <button type="button" onClick={() => setParam("low", low ? null : "1")} aria-pressed={low} className={`rounded-3xl p-5 text-left ${low ? "bg-orange/15 ring-2 ring-orange/40" : "bg-surface"}`}>
          <p className="text-sm text-muted-foreground">Running low</p>
          <p className={`font-display text-3xl tabular-nums ${s && s.lowStock ? "text-orange" : ""}`}>{s ? s.lowStock : "—"}</p>
          <p className="text-xs text-muted-foreground">{low ? "Showing these only. Tap to show all." : "Tap to see them"}</p>
        </button>
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-sm text-muted-foreground">Bought this month</p>
          <p className="font-display text-3xl tabular-nums">{s ? pkr(s.boughtThisMonthPkr) : "—"}</p>
          <p className="text-xs text-muted-foreground">
            Recorded in <Link to="/finance/vouchers" className="text-indigo underline">Accounts</Link>
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={kind} onChange={(id) => setParam("kind", id === ALL ? null : id)} items={[{ id: ALL, label: "Everything" }, { id: "ASSET", label: "Assets" }, { id: "CONSUMABLE", label: "Consumables" }]} />
        <div className="w-52">
          <Label htmlFor="i-status">State</Label>
          <FormSelect id="i-status" value={status} onValueChange={(value) => setParam("status", value && value !== ALL ? value : null)} options={[{ value: ALL, label: "Any state" }, ...ITEM_STATUSES.map((st) => ({ value: st, label: ITEM_STATUS_LABEL[st] }))]} />
        </div>
        <div className="w-60">
          <Label htmlFor="i-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="i-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, place or category" className="pl-9" />
          </div>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={inactive} onChange={(event) => setParam("inactive", event.target.checked ? "1" : null)} /> Include switched-off items
        </label>
        <FetchingIndicator show={isFetching && !isPending} />
      </div>

      {isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load inventory" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data.items.length ? (
        <EmptyState title={q || low || kind !== ALL || status !== ALL ? "Nothing matches" : "No items yet"} description={q || low || kind !== ALL || status !== ALL ? "Clear a filter or search for something else." : "Add the things your school owns or uses up, then record what you buy and give out."} action={<Button onClick={() => { setError(null); setDraft(blank); }}>Add an item</Button>} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl bg-surface">
            <table className="w-full min-w-max text-sm">
              <caption className="sr-only">Inventory items</caption>
              <thead>
                <tr className="border-b border-line text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Item</th>
                  <th scope="col" className="px-4 py-3 font-medium">Kind</th>
                  <th scope="col" className="px-4 py-3 font-medium">Where</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">On hand</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Cost of one</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Worth</th>
                  <th scope="col" className="px-4 py-3 font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((item) => (
                  <tr key={item.id} className={item.active ? "" : "opacity-60"}>
                    <td className="px-4 py-2.5">
                      <Link to={`/inventory/${item.id}`} className="font-medium text-indigo hover:underline">{item.name}</Link>
                      <span className="block text-xs text-muted-foreground">{[item.category, item.code].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="px-4 py-2.5">{item.kind === "ASSET" ? "Asset" : "Consumable"}</td>
                    <td className="px-4 py-2.5">{item.location || "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {item.onHand.toLocaleString("en-PK")} <span className="text-muted-foreground">{item.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{item.unitCostPkr ? pkr(item.unitCostPkr) : "—"}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{item.valuePkr ? pkr(item.valuePkr) : "—"}</td>
                    <td className="px-4 py-2.5">
                      {item.low ? <Badge tone="warning">Running low</Badge> : item.active ? <Badge tone={item.status === "IN_USE" ? "success" : item.status === "REPAIR" ? "warning" : "neutral"}>{ITEM_STATUS_LABEL[item.status]}</Badge> : <Badge tone="neutral">Off</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="item" busy={isFetching} onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)} />
        </>
      )}

      <Dialog open={Boolean(draft)} title="Add an item" confirmLabel="Add item" loading={create.isPending} onConfirm={() => draft && create.mutate(draft)} onClose={() => setDraft(null)}>
        {draft ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="n-name">Name</Label>
              <Input id="n-name" value={draft.name} maxLength={100} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="For example: A4 paper" dir="auto" />
            </div>
            <div>
              <Label htmlFor="n-kind">Kind</Label>
              <FormSelect id="n-kind" value={draft.kind} onValueChange={(value) => value && setDraft({ ...draft, kind: value as ItemKind })} options={ITEM_KINDS.map((k) => ({ value: k, label: ITEM_KIND_LABEL[k] }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="n-cat">Category</Label>
                <Input id="n-cat" value={draft.category} maxLength={60} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Stationery" />
              </div>
              <div>
                <Label htmlFor="n-unit">Counted in</Label>
                <Input id="n-unit" value={draft.unit} maxLength={20} onChange={(event) => setDraft({ ...draft, unit: event.target.value })} placeholder="pcs, box, ream" />
              </div>
              <div>
                <Label htmlFor="n-loc">Kept in</Label>
                <Input id="n-loc" value={draft.location} maxLength={80} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder="Store room" />
              </div>
              <div>
                <Label htmlFor="n-cost">Cost of one (Rs.)</Label>
                <Input id="n-cost" type="number" inputMode="numeric" min={0} value={draft.unitCost} onChange={(event) => setDraft({ ...draft, unitCost: event.target.value })} />
              </div>
              {draft.kind === "CONSUMABLE" ? (
                <div className="col-span-2">
                  <Label htmlFor="n-reorder">Warn me when it falls to</Label>
                  <Input id="n-reorder" type="number" inputMode="numeric" min={0} value={draft.reorderLevel} onChange={(event) => setDraft({ ...draft, reorderLevel: event.target.value })} placeholder="Leave empty for no warning" />
                </div>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">You add the stock you already have on the next screen, with a stock count.</p>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
