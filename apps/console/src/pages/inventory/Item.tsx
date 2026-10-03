import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ITEM_STATUSES, ITEM_STATUS_LABEL, MOVEMENT_LABEL, MOVEMENT_TYPES, type ItemStatus, type MovementType } from "@wellrun/shared";
import { Badge, Dialog, EmptyState, ErrorState, LoadingState } from "@wellrun/ui";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { day } from "@/components/finance/finance-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { financeApi, financeKeys, inventoryApi, inventoryKeys, type InventoryDetail } from "@/lib/finance-api";
import { pkr, todayIso } from "@/lib/format";

type Move = { type: MovementType; quantity: string; date: string; unitCost: string; supplier: string; issuedTo: string; note: string; accountId: string; recordExpense: boolean };

const MOVE_HELP: Record<MovementType, string> = {
  PURCHASE: "You bought more. The money spent is written into Accounts for you.",
  ISSUE: "Stock handed to a class, the office or a person.",
  RETURN: "Something given out earlier came back.",
  DAMAGE: "Broken, used up beyond repair, stolen or lost.",
  ADJUST: "Count what is really there and type the number. Stock is corrected to match.",
};

export function InventoryItemPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const today = todayIso();
  const [move, setMove] = useState<Move | null>(null);
  const [cancelling, setCancelling] = useState<{ id: string; reason: string } | null>(null);
  const [status, setStatus] = useState<ItemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const { data, isPending, isError, refetch } = useQuery({ queryKey: inventoryKeys.item(id), queryFn: () => inventoryApi.item(id) });
  const accounts = useQuery({ queryKey: financeKeys.accounts, queryFn: financeApi.accounts, enabled: move?.type === "PURCHASE" });

  const saved = (next: InventoryDetail, message: string) => {
    queryClient.setQueryData(inventoryKeys.item(id), next);
    void queryClient.invalidateQueries({ queryKey: inventoryKeys.root });
    void queryClient.invalidateQueries({ queryKey: financeKeys.root });
    setToast(message);
    setTimeout(() => setToast(null), 2400);
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save that");

  const record = useMutation({
    mutationFn: (m: Move) =>
      inventoryApi.addMovement(id, {
        type: m.type,
        quantity: Number(m.quantity),
        date: m.date,
        unitCostPkr: m.type === "PURCHASE" && m.unitCost !== "" ? Number(m.unitCost) : null,
        supplier: m.supplier,
        issuedTo: m.issuedTo,
        note: m.note,
        accountId: m.accountId || null,
        recordExpense: m.recordExpense,
      }),
    onSuccess: (next, m) => {
      setMove(null);
      saved(next, m.type === "PURCHASE" && m.recordExpense ? "Recorded, and the spending was added to Accounts" : "Recorded");
    },
    onError: fail,
  });
  const cancelPurchase = useMutation({
    mutationFn: (c: { id: string; reason: string }) => inventoryApi.voidMovement(c.id, c.reason),
    onSuccess: (next) => {
      setCancelling(null);
      saved(next, "Purchase cancelled");
    },
    onError: fail,
  });
  const changeStatus = useMutation({
    mutationFn: (value: ItemStatus) => inventoryApi.updateItem(id, { status: value }),
    onSuccess: () => {
      setStatus(null);
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.root });
      setToast("State updated");
      setTimeout(() => setToast(null), 2200);
    },
    onError: fail,
  });
  const toggleActive = useMutation({
    mutationFn: (active: boolean) => inventoryApi.updateItem(id, { active }),
    onSuccess: (_i, active) => {
      void queryClient.invalidateQueries({ queryKey: inventoryKeys.root });
      setToast(active ? "Item switched on" : "Item switched off");
      setTimeout(() => setToast(null), 2200);
    },
    onError: fail,
  });

  if (isPending) return <LoadingState variant="page" />;
  if (isError || !data) return <ErrorState title="Couldn't load this item" description="It may have been removed, or the connection dropped." onRetry={() => void refetch()} />;

  const { item, movements } = data;
  const start = (type: MovementType): Move => ({ type, quantity: type === "ADJUST" ? String(item.onHand) : "", date: today, unitCost: type === "PURCHASE" && item.unitCostPkr ? String(item.unitCostPkr) : "", supplier: "", issuedTo: "", note: "", accountId: "", recordExpense: true });
  const total = move?.type === "PURCHASE" ? (Number(move.quantity) || 0) * (Number(move.unitCost) || 0) : 0;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link to="/inventory" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Inventory
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl" dir="auto">{item.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{[item.kind === "ASSET" ? "Asset" : "Consumable", item.category, item.code, item.location].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex items-center gap-2">
            {item.low ? <Badge tone="warning">Running low</Badge> : null}
            {item.active ? null : <Badge tone="neutral">Switched off</Badge>}
          </div>
        </div>
      </div>

      <section aria-label="Stock" className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-sm text-muted-foreground">On hand</p>
          <p className={`font-display text-4xl tabular-nums ${item.low ? "text-orange" : ""}`}>{item.onHand.toLocaleString("en-PK")} <span className="text-base font-normal text-muted-foreground">{item.unit}</span></p>
          {item.reorderLevel !== null ? <p className="text-xs text-muted-foreground">Warns at {item.reorderLevel} or fewer</p> : null}
        </div>
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-sm text-muted-foreground">Cost of one</p>
          <p className="font-display text-3xl tabular-nums">{item.unitCostPkr ? pkr(item.unitCostPkr) : "—"}</p>
          <p className="text-xs text-muted-foreground">Latest price paid</p>
        </div>
        <div className="rounded-3xl bg-surface p-5">
          <p className="text-sm text-muted-foreground">Worth</p>
          <p className="font-display text-3xl tabular-nums">{item.valuePkr ? pkr(item.valuePkr) : "—"}</p>
        </div>
      </section>

      {item.active ? (
        <section aria-label="Record" className="flex flex-wrap gap-2">
          {MOVEMENT_TYPES.map((t) => (
            <Button key={t} variant={t === "PURCHASE" ? "default" : "outline"} onClick={() => { setError(null); setMove(start(t)); }}>
              {MOVEMENT_LABEL[t]}
            </Button>
          ))}
        </section>
      ) : null}

      <section className="flex flex-wrap items-end gap-3 rounded-3xl bg-surface p-5">
        <div className="w-56">
          <Label htmlFor="item-status">State</Label>
          <FormSelect id="item-status" value={status ?? item.status} onValueChange={(value) => value && setStatus(value as ItemStatus)} options={ITEM_STATUSES.map((s) => ({ value: s, label: ITEM_STATUS_LABEL[s] }))} />
        </div>
        {status && status !== item.status ? <Button onClick={() => changeStatus.mutate(status)} loading={changeStatus.isPending}>Save state</Button> : null}
        <Button variant="ghost" onClick={() => toggleActive.mutate(!item.active)} disabled={toggleActive.isPending}>{item.active ? "Switch this item off" : "Switch this item on"}</Button>
        {error && !move && !cancelling ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      </section>

      <section aria-labelledby="hist-h">
        <h2 id="hist-h" className="mb-3 font-display text-xl">History</h2>
        {movements.length ? (
          <div className="overflow-x-auto rounded-3xl bg-surface">
            <table className="w-full min-w-max text-sm">
              <caption className="sr-only">Stock movements for {item.name}</caption>
              <thead>
                <tr className="border-b border-line text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Date</th>
                  <th scope="col" className="px-4 py-3 font-medium">What happened</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Change</th>
                  <th scope="col" className="px-4 py-3 font-medium">Details</th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">Cost</th>
                  <th scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {movements.map((m) => (
                  <tr key={m.id} className={m.voided ? "text-muted-foreground line-through decoration-muted-foreground/60" : ""}>
                    <td className="px-4 py-2.5 whitespace-nowrap">{day(m.date)}</td>
                    <td className="px-4 py-2.5">{MOVEMENT_LABEL[m.type]}{m.voided ? <Badge tone="neutral" className="ml-2 no-underline">Cancelled</Badge> : null}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${m.delta > 0 ? "text-success" : "text-danger"}`}>{m.delta > 0 ? "+" : ""}{m.delta}</td>
                    <td className="max-w-xs truncate px-4 py-2.5" title={[m.supplier, m.issuedTo, m.note].filter(Boolean).join(": ")}>
                      {[m.supplier, m.issuedTo && `to ${m.issuedTo}`, m.note].filter(Boolean).join(" · ") || "—"}
                      {m.voucherNumber ? <span className="block text-xs text-muted-foreground">Voucher {m.voucherNumber}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{m.totalCostPkr ? pkr(m.totalCostPkr) : "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      {m.canVoid ? <Button size="sm" variant="ghost" onClick={() => { setError(null); setCancelling({ id: m.id, reason: "" }); }}>Cancel purchase</Button> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nothing recorded yet" description="Start with a stock count to say how many you have now." action={<Button onClick={() => { setError(null); setMove(start("ADJUST")); }}>Count stock</Button>} />
        )}
      </section>

      <Dialog
        open={Boolean(move)}
        title={move ? MOVEMENT_LABEL[move.type] : ""}
        description={move ? MOVE_HELP[move.type] : undefined}
        confirmLabel="Save"
        loading={record.isPending}
        onConfirm={() => move && record.mutate(move)}
        onClose={() => setMove(null)}
      >
        {move ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="m-qty">{move.type === "ADJUST" ? `How many are there? (${item.unit})` : `How many? (${item.unit})`}</Label>
                <Input id="m-qty" type="number" inputMode="numeric" min={0} step={1} value={move.quantity} onChange={(event) => setMove({ ...move, quantity: event.target.value })} autoFocus />
              </div>
              <div>
                <Label htmlFor="m-date">Date</Label>
                <DatePicker id="m-date" value={move.date} onChange={(value) => setMove({ ...move, date: value })} fromYear={2020} toYear={new Date().getFullYear()} />
              </div>
            </div>
            {move.type === "PURCHASE" ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="m-cost">Cost of one (Rs.)</Label>
                    <Input id="m-cost" type="number" inputMode="numeric" min={0} value={move.unitCost} onChange={(event) => setMove({ ...move, unitCost: event.target.value })} />
                  </div>
                  <div>
                    <Label htmlFor="m-supplier">Bought from</Label>
                    <Input id="m-supplier" value={move.supplier} maxLength={120} onChange={(event) => setMove({ ...move, supplier: event.target.value })} dir="auto" />
                  </div>
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={move.recordExpense} onChange={(event) => setMove({ ...move, recordExpense: event.target.checked })} />
                  <span>
                    Record the money spent{total > 0 ? ` (${pkr(total)})` : ""} in Accounts
                    <span className="block text-xs text-muted-foreground">Untick this for stock that was already paid for or donated.</span>
                  </span>
                </label>
                {move.recordExpense ? (
                  <div>
                    <Label htmlFor="m-account">Paid from</Label>
                    <FormSelect id="m-account" value={move.accountId} onValueChange={(value) => setMove({ ...move, accountId: value ?? "" })} options={(accounts.data ?? []).filter((a) => a.active).map((a) => ({ value: a.id, label: a.name }))} placeholder="Cash in hand (default)" />
                  </div>
                ) : null}
              </>
            ) : null}
            {move.type === "ISSUE" || move.type === "DAMAGE" ? (
              <div>
                <Label htmlFor="m-to">{move.type === "ISSUE" ? "Given to" : "Where was it?"}</Label>
                <Input id="m-to" value={move.issuedTo} maxLength={120} onChange={(event) => setMove({ ...move, issuedTo: event.target.value })} placeholder="A class, the office, a person" dir="auto" />
              </div>
            ) : null}
            <div>
              <Label htmlFor="m-note">Note (optional)</Label>
              <Textarea id="m-note" rows={2} maxLength={300} value={move.note} onChange={(event) => setMove({ ...move, note: event.target.value })} dir="auto" />
            </div>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(cancelling)}
        title="Cancel this purchase?"
        description="The stock goes back down and the voucher in Accounts is cancelled. This only works while that many are still on the shelf."
        confirmLabel="Cancel purchase"
        cancelLabel="Keep it"
        danger
        loading={cancelPurchase.isPending}
        onConfirm={() => cancelling && (cancelling.reason.trim().length >= 3 ? cancelPurchase.mutate(cancelling) : setError("Say why"))}
        onClose={() => setCancelling(null)}
      >
        <Label htmlFor="c-reason">Why?</Label>
        <Textarea id="c-reason" rows={2} maxLength={300} value={cancelling?.reason ?? ""} onChange={(event) => cancelling && setCancelling({ ...cancelling, reason: event.target.value })} dir="auto" />
        {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      </Dialog>
      <Toast message={toast} />
    </div>
  );
}
