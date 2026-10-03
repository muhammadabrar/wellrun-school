import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AccountKind, CategoryKind } from "@wellrun/shared";
import { Badge, Dialog, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { Landmark, Lock, Plus, Wallet } from "lucide-react";
import { useState } from "react";
import { Balance, day } from "@/components/finance/finance-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { financeApi, financeKeys, type FinanceAccountView, type FinanceCategoryView } from "@/lib/finance-api";
import { todayIso } from "@/lib/format";

type AccountDraft = { id: string | null; name: string; kind: AccountKind; opening: string; openingOn: string };

export function FinanceSettingsPage() {
  const queryClient = useQueryClient();
  const today = todayIso();
  const accounts = useQuery({ queryKey: financeKeys.accounts, queryFn: financeApi.accounts });
  const categories = useQuery({ queryKey: financeKeys.categories, queryFn: financeApi.categories });
  const [draft, setDraft] = useState<AccountDraft | null>(null);
  const [newCategory, setNewCategory] = useState<{ name: string; kind: CategoryKind } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const done = (message: string) => {
    void queryClient.invalidateQueries({ queryKey: financeKeys.root });
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  };
  const fail = (e: unknown) => setError(e instanceof Error ? e.message : "Couldn't save that");

  const saveAccount = useMutation({
    mutationFn: (d: AccountDraft) => {
      const payload = { name: d.name, openingBalancePkr: Number(d.opening) || 0, openingOn: d.openingOn };
      return d.id ? financeApi.updateAccount(d.id, payload) : financeApi.createAccount({ ...payload, kind: d.kind });
    },
    onSuccess: () => {
      setDraft(null);
      done("Account saved");
    },
    onError: fail,
  });
  const toggleAccount = useMutation({
    mutationFn: (a: FinanceAccountView) => financeApi.updateAccount(a.id, { active: !a.active }),
    onSuccess: (a) => done(a.active ? "Account switched on" : "Account switched off"),
    onError: fail,
  });
  const addCategory = useMutation({
    mutationFn: (c: { name: string; kind: CategoryKind }) => financeApi.createCategory(c),
    onSuccess: () => {
      setNewCategory(null);
      done("Category added");
    },
    onError: fail,
  });
  const updateCategory = useMutation({
    mutationFn: (v: { id: string; name?: string; active?: boolean }) => financeApi.updateCategory(v.id, { name: v.name, active: v.active }),
    onSuccess: () => {
      setRenaming(null);
      done("Saved");
    },
    onError: fail,
  });

  const loading = accounts.isPending || categories.isPending;
  const failed = accounts.isError || categories.isError;

  const categoryList = (kind: CategoryKind, title: string) => (
    <section aria-label={title} className="rounded-3xl bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg">{title}</h3>
        <Button size="sm" variant="outline" onClick={() => { setError(null); setNewCategory({ name: "", kind }); }}>
          <Plus className="size-3.5" aria-hidden /> Add
        </Button>
      </div>
      <ul className="divide-y divide-line text-sm">
        {(categories.data ?? []).filter((c: FinanceCategoryView) => c.kind === kind).map((c) => (
          <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 py-2.5 ${c.active ? "" : "opacity-60"}`}>
            <span className="min-w-0 flex-1">
              {c.name}
              {c.system ? (
                <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3" aria-hidden /> filled in by {kind === "INCOME" ? "fees" : "payroll"}
                </span>
              ) : null}
              {!c.active ? <Badge tone="neutral" className="ml-2">Off</Badge> : null}
            </span>
            {c.system ? null : (
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => { setError(null); setRenaming({ id: c.id, name: c.name }); }}>Rename</Button>
                <Button size="sm" variant="ghost" onClick={() => updateCategory.mutate({ id: c.id, active: !c.active })} disabled={updateCategory.isPending}>
                  {c.active ? "Switch off" : "Switch on"}
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Accounts and categories" description="The cash box and bank accounts the school keeps money in, and the headings money is sorted under." />

      {loading ? (
        <LoadingState variant="page" />
      ) : failed ? (
        <ErrorState title="Couldn't load settings" description="Check your connection and try again." onRetry={() => { void accounts.refetch(); void categories.refetch(); }} />
      ) : (
        <>
          <section aria-labelledby="acc-h" className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 id="acc-h" className="font-display text-xl">Accounts</h2>
              <Button onClick={() => { setError(null); setDraft({ id: null, name: "", kind: "BANK", opening: "0", openingOn: today }); }}>
                <Plus className="size-4" aria-hidden /> Add account
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Fee payments and paid salaries are counted in your first cash account (for cash) and your first bank account (for everything else). An account's balance starts from its opening balance on its opening date; nothing earlier counts.
            </p>
            <ul className="space-y-3">
              {(accounts.data ?? []).map((a) => (
                <li key={a.id} className={`flex flex-wrap items-center gap-4 rounded-3xl bg-surface p-5 ${a.active ? "" : "opacity-60"}`}>
                  <span className="grid size-11 place-items-center rounded-2xl bg-indigo/10 text-indigo">{a.kind === "CASH" ? <Wallet className="size-5" aria-hidden /> : <Landmark className="size-5" aria-hidden />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{a.name} {a.active ? null : <Badge tone="neutral">Off</Badge>}</span>
                    <span className="block text-xs text-muted-foreground">Started with Rs. {a.openingBalancePkr.toLocaleString("en-PK")} on {day(a.openingOn)}</span>
                  </span>
                  <span className="font-display text-xl tabular-nums"><Balance value={a.balancePkr} /></span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => { setError(null); setDraft({ id: a.id, name: a.name, kind: a.kind, opening: String(a.openingBalancePkr), openingOn: a.openingOn }); }}>Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setError(null); toggleAccount.mutate(a); }} disabled={toggleAccount.isPending}>{a.active ? "Switch off" : "Switch on"}</Button>
                  </span>
                </li>
              ))}
            </ul>
            {error && !draft && !newCategory && !renaming ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </section>

          <section aria-labelledby="cat-h" className="space-y-3">
            <h2 id="cat-h" className="font-display text-xl">Categories</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {categoryList("EXPENSE", "Money out: what it was spent on")}
              {categoryList("INCOME", "Money in: where it came from")}
            </div>
          </section>
        </>
      )}

      <Dialog
        open={Boolean(draft)}
        title={draft?.id ? "Edit account" : "Add an account"}
        confirmLabel="Save"
        loading={saveAccount.isPending}
        onConfirm={() => draft && saveAccount.mutate(draft)}
        onClose={() => setDraft(null)}
      >
        {draft ? (
          <div className="space-y-4">
            <div>
              <Label htmlFor="acc-name">Name</Label>
              <Input id="acc-name" value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="For example: Meezan savings" />
            </div>
            {draft.id ? null : (
              <div>
                <Label htmlFor="acc-kind">Kind</Label>
                <FormSelect id="acc-kind" value={draft.kind} onValueChange={(value) => value && setDraft({ ...draft, kind: value as AccountKind })} options={[{ value: "BANK", label: "Bank account" }, { value: "CASH", label: "Cash box" }]} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="acc-open">Held at the start (Rs.)</Label>
                <Input id="acc-open" type="number" inputMode="numeric" step={1} value={draft.opening} onChange={(event) => setDraft({ ...draft, opening: event.target.value })} />
              </div>
              <div>
                <Label htmlFor="acc-on">On this date</Label>
                <DatePicker id="acc-on" value={draft.openingOn} onChange={(value) => setDraft({ ...draft, openingOn: value })} fromYear={2020} toYear={new Date().getFullYear()} />
              </div>
            </div>
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={Boolean(newCategory)}
        title={newCategory?.kind === "EXPENSE" ? "Add a spending category" : "Add an income category"}
        confirmLabel="Add"
        loading={addCategory.isPending}
        onConfirm={() => newCategory && addCategory.mutate(newCategory)}
        onClose={() => setNewCategory(null)}
      >
        <Label htmlFor="cat-name">Name</Label>
        <Input id="cat-name" value={newCategory?.name ?? ""} maxLength={80} onChange={(event) => newCategory && setNewCategory({ ...newCategory, name: event.target.value })} dir="auto" />
        {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      </Dialog>

      <Dialog
        open={Boolean(renaming)}
        title="Rename category"
        confirmLabel="Save"
        loading={updateCategory.isPending}
        onConfirm={() => renaming && updateCategory.mutate({ id: renaming.id, name: renaming.name })}
        onClose={() => setRenaming(null)}
      >
        <Label htmlFor="cat-rename">Name</Label>
        <Input id="cat-rename" value={renaming?.name ?? ""} maxLength={80} onChange={(event) => renaming && setRenaming({ ...renaming, name: event.target.value })} dir="auto" />
        {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      </Dialog>
      <Toast message={toast} />
    </div>
  );
}
