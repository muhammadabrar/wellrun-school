import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { VOUCHER_METHODS, VOUCHER_TYPES, type VoucherType } from "@wellrun/shared";
import { LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Balance, TYPE_SHORT, typeLabel } from "@/components/finance/finance-ui";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { financeApi, financeKeys } from "@/lib/finance-api";
import { pkr, todayIso } from "@/lib/format";

const HELP: Record<VoucherType, string> = {
  PAYMENT: "Money the school paid out: rent, bills, repairs, supplies.",
  RECEIPT: "Money the school received other than fees: a donation, uniform sales.",
  TRANSFER: "Money moved between your own accounts, like cash taken to the bank. It is not income or spending.",
};

export function VoucherNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const today = todayIso();
  const initial = VOUCHER_TYPES.find((t) => t === params.get("type")) ?? "PAYMENT";
  const [type, setType] = useState<VoucherType>(initial);
  const [date, setDate] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [toAccountId, setToAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [method, setMethod] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: financeKeys.accounts, queryFn: financeApi.accounts });
  const categories = useQuery({ queryKey: financeKeys.categories, queryFn: financeApi.categories });

  const active = useMemo(() => (accounts.data ?? []).filter((a) => a.active), [accounts.data]);
  const wanted = type === "PAYMENT" ? "EXPENSE" : "INCOME";
  const categoryOptions = useMemo(() => (categories.data ?? []).filter((c) => c.kind === wanted && c.active && !c.system).map((c) => ({ value: c.id, label: c.name })), [categories.data, wanted]);
  const chosen = active.find((a) => a.id === (accountId || active[0]?.id));
  const amountNumber = Number(amount);
  const shortfall = chosen && type !== "RECEIPT" && amountNumber > 0 && chosen.balancePkr - amountNumber < 0;

  const create = useMutation({
    mutationFn: (form: { party: string; reference: string; note: string }) =>
      financeApi.createVoucher({
        type,
        date,
        amountPkr: amountNumber,
        accountId: chosen?.id ?? "",
        toAccountId: type === "TRANSFER" ? toAccountId || null : null,
        categoryId: type === "TRANSFER" ? null : categoryId || null,
        method,
        ...form,
      }),
    onSuccess: (voucher) => {
      void queryClient.invalidateQueries({ queryKey: financeKeys.root });
      navigate(`/finance/vouchers/${voucher.id}`, { replace: true });
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save the voucher"),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    if (!(amountNumber > 0)) return setError("Enter an amount above zero");
    create.mutate({ party: String(form.get("party") ?? ""), reference: String(form.get("reference") ?? ""), note: String(form.get("note") ?? "") });
  }

  if (accounts.isPending || categories.isPending) return <LoadingState variant="form" />;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <Link to="/finance/vouchers" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Vouchers
        </Link>
        <PageHeader title="New voucher" description={HELP[type]} />
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-3xl bg-surface p-6">
        <div role="group" aria-label="Kind of voucher" className="grid grid-cols-3 gap-2">
          {VOUCHER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={type === t}
              onClick={() => {
                setType(t);
                setCategoryId("");
                setError(null);
              }}
              className={`rounded-2xl px-3 py-3 text-sm font-medium ${type === t ? "bg-indigo text-white" : "bg-paper hover:bg-indigo/10"}`}
            >
              {t === "PAYMENT" ? "Money out" : t === "RECEIPT" ? "Money in" : "Move money"}
              <span className="block text-xs font-normal opacity-80">{TYPE_SHORT[t]}</span>
            </button>
          ))}
        </div>
        <p className="sr-only">{typeLabel(type)}</p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vn-date">Date</Label>
            <DatePicker id="vn-date" value={date} onChange={setDate} fromYear={2020} toYear={new Date().getFullYear()} />
          </div>
          <div>
            <Label htmlFor="vn-amount">Amount (Rs.)</Label>
            <Input id="vn-amount" type="number" inputMode="numeric" min={1} step={1} required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="vn-account">{type === "TRANSFER" ? "Take it from" : type === "PAYMENT" ? "Paid from" : "Paid into"}</Label>
            <FormSelect id="vn-account" value={chosen?.id ?? ""} onValueChange={(value) => value && setAccountId(value)} options={active.map((a) => ({ value: a.id, label: a.name }))} />
            {chosen ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Holds <Balance value={chosen.balancePkr} /> now
              </p>
            ) : null}
          </div>
          {type === "TRANSFER" ? (
            <div>
              <Label htmlFor="vn-to">Put it into</Label>
              <FormSelect id="vn-to" value={toAccountId} onValueChange={(value) => value && setToAccountId(value)} options={active.filter((a) => a.id !== chosen?.id).map((a) => ({ value: a.id, label: a.name }))} placeholder="Choose an account" />
            </div>
          ) : (
            <div>
              <Label htmlFor="vn-cat">{type === "PAYMENT" ? "What was it for?" : "Where did it come from?"}</Label>
              <FormSelect id="vn-cat" value={categoryId} onValueChange={(value) => value && setCategoryId(value)} options={categoryOptions} placeholder="Choose one" />
              <p className="mt-1 text-xs text-muted-foreground">
                Missing one? <Link to="/finance/settings" className="text-indigo underline">Add a category</Link>
              </p>
            </div>
          )}
        </div>

        {shortfall && chosen ? (
          <p role="status" className="rounded-2xl bg-orange/10 px-4 py-3 text-sm text-orange">
            {chosen.name} holds {pkr(chosen.balancePkr)}, so this would leave it below zero. You can still save it, for example if you have not recorded a deposit yet.
          </p>
        ) : null}

        {type !== "TRANSFER" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="vn-party">{type === "PAYMENT" ? "Paid to" : "Received from"}</Label>
              <Input id="vn-party" name="party" maxLength={120} dir="auto" placeholder={type === "PAYMENT" ? "Shop or person" : "Person or group"} />
            </div>
            <div>
              <Label htmlFor="vn-method">How</Label>
              <FormSelect id="vn-method" value={method} onValueChange={(value) => setMethod(value ?? "")} options={VOUCHER_METHODS.map((m) => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }))} placeholder="Optional" />
            </div>
          </div>
        ) : null}

        <div>
          <Label htmlFor="vn-ref">Cheque, bill or slip number (optional)</Label>
          <Input id="vn-ref" name="reference" maxLength={80} />
        </div>
        <div>
          <Label htmlFor="vn-note">Note (optional)</Label>
          <Textarea id="vn-note" name="note" rows={2} maxLength={500} dir="auto" />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" loading={create.isPending}>
            Save voucher
          </Button>
          <Button type="button" variant="outline" render={<Link to="/finance/vouchers" />}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
