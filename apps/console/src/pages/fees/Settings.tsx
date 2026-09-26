import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { queryKeys } from "@/lib/query";

export function FeeSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feeSettings, queryFn: api.feeSettings });
  const [autoGenerate, setAutoGenerate] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const save = useMutation({
    mutationFn: api.saveFeeSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.feeSettings }),
  });

  if (isPending) return <LoadingState variant="form" />;
  if (isError || !data) {
    return <ErrorState title="Could not load fee settings" description="We couldn't load your fee settings. Try again." onRetry={() => void refetch()} />;
  }
  const settings = data;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage(null);
    try {
      await save.mutateAsync({
        defaultDueDay: Number(form.get("defaultDueDay")),
        autoGenerateEnabled: autoGenerate ?? settings.autoGenerateEnabled,
        receiptHeader: String(form.get("receiptHeader") ?? ""),
        receiptFooter: String(form.get("receiptFooter") ?? ""),
      });
      setMessage({ tone: "ok", text: "Fee settings saved." });
    } catch (err) {
      setMessage({ tone: "error", text: err instanceof Error ? err.message : "Could not save settings." });
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Fee settings" description="When fees are due and what's printed on receipts." />
      <form onSubmit={(event) => void onSubmit(event)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Monthly invoices</CardTitle>
            <CardDescription>Used by Generate monthly fees.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field>
              <FieldLabel htmlFor="due-day">Due day of the month</FieldLabel>
              <Input id="due-day" name="defaultDueDay" type="number" min={1} max={28} required defaultValue={settings.defaultDueDay} className="max-w-32" />
              <FieldDescription>Invoices for September with due day 10 are due on 10 September.</FieldDescription>
            </Field>
            <div className="flex items-start justify-between gap-4">
              <div>
                <FieldLabel htmlFor="auto-generate">Generate automatically</FieldLabel>
                <FieldDescription>Each month's invoices are created on the 1st without anyone clicking Generate. Students already invoiced are never billed twice.</FieldDescription>
              </div>
              <Switch id="auto-generate" checked={autoGenerate ?? settings.autoGenerateEnabled} onCheckedChange={(checked) => setAutoGenerate(checked)} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Receipts</CardTitle>
            <CardDescription>
              School name, logo, address, phone and registration number come from your{" "}
              <Link to="/profile" className="text-indigo">
                school profile
              </Link>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <Field>
              <FieldLabel htmlFor="header">Note under the school name</FieldLabel>
              <Textarea id="header" name="receiptHeader" rows={2} defaultValue={settings.receiptHeader} />
              <FieldDescription>Optional, e.g. "Affiliated with BISE Lahore".</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="footer">Footer message</FieldLabel>
              <Textarea id="footer" name="receiptFooter" rows={2} defaultValue={settings.receiptFooter} />
              <FieldDescription>Printed at the bottom of every receipt, e.g. "Fee once paid is non-refundable."</FieldDescription>
            </Field>
          </CardContent>
        </Card>
        {message ? (
          <p className={message.tone === "ok" ? "text-sm text-primary" : "text-sm text-destructive"} role="status">
            {message.text}
          </p>
        ) : null}
        <Button type="submit" loading={save.isPending}>
          Save settings
        </Button>
      </form>
    </div>
  );
}
