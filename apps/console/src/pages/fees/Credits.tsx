import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeCreditsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feeCredits, queryFn: () => api.feeCredits() });
  const [error, setError] = useState<string | null>(null);
  const apply = useMutation({
    mutationFn: api.applyFeeCredit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fees"] }),
  });

  if (isPending && !data) return <LoadingState variant="table" />;
  if (isError) return <ErrorState title="Could not load credits" description="Try again." onRetry={() => void refetch()} />;

  async function onApply(event: FormEvent<HTMLFormElement>, creditId: string, studentId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await apply.mutateAsync({
        creditId,
        studentId,
        invoiceId: String(form.get("invoiceId") || "") || undefined,
        amountPkr: Number(form.get("amountPkr") || 0) || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not apply this credit");
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Student credits" description="Overpayments stay as credit until you apply them to an open invoice." />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {!data?.length ? (
        <EmptyState title="No unused credit" description="Credit appears when a payment is larger than the invoices it covers." />
      ) : (
        <ul className="space-y-4">
          {data.map((row) => (
            <li key={row.id} className="rounded-3xl bg-surface p-5">
              <div className="flex justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"}
                  </p>
                  <p className="text-sm text-muted-foreground">{row.reason || "Overpayment"}</p>
                </div>
                <p>{pkr(row.remainingAmountPkr)} left</p>
              </div>
              {row.student ? (
                <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(event) => void onApply(event, row.id, row.student!.id)}>
                  <Field>
                    <FieldLabel htmlFor={`credit-amount-${row.id}`}>Amount (Rs.)</FieldLabel>
                    <Input id={`credit-amount-${row.id}`} name="amountPkr" type="number" min={1} defaultValue={row.remainingAmountPkr} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`credit-invoice-${row.id}`}>Invoice id (optional)</FieldLabel>
                    <Input id={`credit-invoice-${row.id}`} name="invoiceId" />
                  </Field>
                  <Button type="submit" loading={apply.isPending}>
                    Apply credit
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
