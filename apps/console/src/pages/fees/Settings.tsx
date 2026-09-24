import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";

export function FeeSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feeSettings, queryFn: api.feeSettings });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [lateFeeMode, setLateFeeMode] = useState<string | null>(null);
  const [fbrEnvironment, setFbrEnvironment] = useState<string | null>(null);
  const [showTax, setShowTax] = useState<boolean | null>(null);
  const [fbrEnabled, setFbrEnabled] = useState<boolean | null>(null);
  const save = useMutation({
    mutationFn: api.saveFeeSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.feeSettings }),
  });

  if (isPending && !data) return <LoadingState variant="form" />;
  if (isError || !data) {
    return <ErrorState title="Could not load fee settings" description="Try again." onRetry={() => void refetch()} />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data) return;
    const settings = data;
    const form = new FormData(event.currentTarget);
    const credentials = String(form.get("fbrCredentials") || "");
    setError(null);
    setMessage(null);
    try {
      await save.mutateAsync({
        defaultDueDay: Number(form.get("defaultDueDay")),
        graceDays: Number(form.get("graceDays")),
        lateFeeMode: lateFeeMode || settings.lateFeeMode,
        lateFeeAmountPkr: Number(form.get("lateFeeAmountPkr")),
        lateFeePercent: Number(form.get("lateFeePercent")),
        lateFeeCapPkr: Number(form.get("lateFeeCapPkr")),
        invoicePrefix: String(form.get("invoicePrefix")),
        paymentPrefix: String(form.get("paymentPrefix")),
        receiptPrefix: String(form.get("receiptPrefix")),
        receiptHeader: String(form.get("receiptHeader")),
        receiptFooter: String(form.get("receiptFooter")),
        showTaxOnReceipt: showTax ?? settings.showTaxOnReceipt,
        taxNumber: String(form.get("taxNumber")),
        ntn: String(form.get("ntn")),
        strn: String(form.get("strn")),
        primaryColor: String(form.get("primaryColor")),
        fbrEnabled: fbrEnabled ?? settings.fbrEnabled,
        fbrEnvironment: fbrEnvironment || settings.fbrEnvironment,
        ...(credentials ? { fbrCredentials: credentials } : {}),
      });
      setMessage("Fee settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Fee settings" description="Due dates, late fees, receipt branding, and FBR-ready credentials. Credentials are write-only." />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {message ? <p className="text-sm text-primary">{message}</p> : null}
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-6 rounded-3xl bg-surface p-6">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="due-day">Default due day</FieldLabel>
            <Input id="due-day" name="defaultDueDay" type="number" min={1} max={28} defaultValue={data.defaultDueDay} />
          </Field>
          <Field>
            <FieldLabel htmlFor="grace">Grace days</FieldLabel>
            <Input id="grace" name="graceDays" type="number" min={0} max={31} defaultValue={data.graceDays} />
          </Field>
          <Field>
            <FieldLabel htmlFor="late-mode">Late fee</FieldLabel>
            <FormSelect
              id="late-mode"
              value={lateFeeMode || data.lateFeeMode}
              onValueChange={(value) => setLateFeeMode(value || "NONE")}
              options={[
                { value: "NONE", label: "None" },
                { value: "FIXED", label: "Fixed" },
                { value: "DAILY", label: "Daily" },
                { value: "PERCENT", label: "Percent" },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="late-amount">Late fee amount (Rs.)</FieldLabel>
            <Input id="late-amount" name="lateFeeAmountPkr" type="number" min={0} defaultValue={data.lateFeeAmountPkr} />
          </Field>
          <Field>
            <FieldLabel htmlFor="late-percent">Late fee percent</FieldLabel>
            <Input id="late-percent" name="lateFeePercent" type="number" min={0} max={100} defaultValue={data.lateFeePercent} />
          </Field>
          <Field>
            <FieldLabel htmlFor="late-cap">Late fee cap (Rs.)</FieldLabel>
            <Input id="late-cap" name="lateFeeCapPkr" type="number" min={0} defaultValue={data.lateFeeCapPkr} />
          </Field>
        </FieldGroup>
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="inv-prefix">Invoice prefix</FieldLabel>
            <Input id="inv-prefix" name="invoicePrefix" defaultValue={data.invoicePrefix} />
          </Field>
          <Field>
            <FieldLabel htmlFor="pay-prefix">Payment prefix</FieldLabel>
            <Input id="pay-prefix" name="paymentPrefix" defaultValue={data.paymentPrefix} />
          </Field>
          <Field>
            <FieldLabel htmlFor="rec-prefix">Receipt prefix</FieldLabel>
            <Input id="rec-prefix" name="receiptPrefix" defaultValue={data.receiptPrefix} />
          </Field>
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor="header">Receipt header</FieldLabel>
          <Textarea id="header" name="receiptHeader" rows={2} defaultValue={data.receiptHeader} />
        </Field>
        <Field>
          <FieldLabel htmlFor="footer">Receipt footer</FieldLabel>
          <Textarea id="footer" name="receiptFooter" rows={2} defaultValue={data.receiptFooter} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={showTax ?? data.showTaxOnReceipt}
            onCheckedChange={(checked) => setShowTax(checked === true)}
          />
          Show tax on receipts
        </label>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="tax">Tax number</FieldLabel>
            <Input id="tax" name="taxNumber" defaultValue={data.taxNumber} />
          </Field>
          <Field>
            <FieldLabel htmlFor="ntn">NTN</FieldLabel>
            <Input id="ntn" name="ntn" defaultValue={data.ntn} />
          </Field>
          <Field>
            <FieldLabel htmlFor="strn">STRN</FieldLabel>
            <Input id="strn" name="strn" defaultValue={data.strn} />
          </Field>
          <Field>
            <FieldLabel htmlFor="color">Primary color</FieldLabel>
            <Input id="color" name="primaryColor" defaultValue={data.primaryColor} />
          </Field>
        </FieldGroup>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={fbrEnabled ?? data.fbrEnabled}
            onCheckedChange={(checked) => setFbrEnabled(checked === true)}
          />
          Enable FBR e-invoicing (not live yet)
        </label>
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="fbr-env">FBR environment</FieldLabel>
            <FormSelect
              id="fbr-env"
              value={fbrEnvironment || data.fbrEnvironment}
              onValueChange={(value) => setFbrEnvironment(value || "sandbox")}
              options={[
                { value: "sandbox", label: "Sandbox" },
                { value: "production", label: "Production" },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="fbr-cred">FBR credentials</FieldLabel>
            <Input id="fbr-cred" name="fbrCredentials" type="password" placeholder={data.fbrCredentialsSet ? "Saved — leave blank to keep" : "Write-only"} autoComplete="new-password" />
          </Field>
        </FieldGroup>
        <Button type="submit" loading={save.isPending}>
          Save settings
        </Button>
      </form>
    </div>
  );
}
