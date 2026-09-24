import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeDiscountsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feeDiscounts, queryFn: api.feeDiscounts });
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState("FIXED");
  const [value, setValue] = useState("");
  const [discountId, setDiscountId] = useState<string | null>(null);
  const [studentId, setStudentId] = useState("");
  const create = useMutation({
    mutationFn: api.createFeeDiscount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.feeDiscounts }),
  });
  const assign = useMutation({ mutationFn: api.assignStudentDiscount });

  if (isPending && !data) return <LoadingState variant="form" />;
  if (isError) return <ErrorState title="Could not load discounts" description="Try again." onRetry={() => void refetch()} />;

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ name, type, value: Number(value) });
      setName("");
      setType("FIXED");
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this discount");
    }
  }

  async function onAssign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const discount = data?.find((row) => row.id === discountId);
    if (!discount) return;
    setError(null);
    try {
      await assign.mutateAsync({
        studentId,
        discountId: discount.id,
        name: discount.name,
        type: discount.type,
        value: discount.value,
      });
      setStudentId("");
      setDiscountId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not assign this discount");
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="Discounts" description="Discounts apply when invoices are generated. They never change the catalog amount on a structure." />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <form onSubmit={(event) => void onCreate(event)} className="rounded-3xl bg-surface p-6">
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="disc-name">Name</FieldLabel>
            <Input id="disc-name" value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="disc-type">Type</FieldLabel>
            <FormSelect
              id="disc-type"
              value={type}
              onValueChange={(next) => setType(next || "FIXED")}
              options={[
                { value: "FIXED", label: "Fixed (Rs.)" },
                { value: "PERCENT", label: "Percent" },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="disc-value">Value</FieldLabel>
            <Input id="disc-value" type="number" min={0} step={1} value={value} onChange={(event) => setValue(event.target.value)} required />
          </Field>
        </FieldGroup>
        <Button type="submit" className="mt-4" loading={create.isPending}>
          Add discount
        </Button>
      </form>
      {!data?.length ? (
        <EmptyState title="No discounts" description="Create a sibling, staff, or scholarship discount." />
      ) : (
        <ul className="space-y-2">
          {data.map((row) => (
            <li key={row.id} className="flex justify-between rounded-2xl bg-surface px-5 py-3 text-sm">
              <span>{row.name}</span>
              <span>{row.type === "PERCENT" ? `${row.value}%` : pkr(row.value)}</span>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={(event) => void onAssign(event)} className="rounded-3xl bg-surface p-6">
        <h2 className="font-display text-2xl">Assign to a student</h2>
        <FieldGroup className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="disc-student">Student id</FieldLabel>
            <Input id="disc-student" value={studentId} onChange={(event) => setStudentId(event.target.value)} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="disc-pick">Discount</FieldLabel>
            <FormSelect
              id="disc-pick"
              value={discountId}
              onValueChange={setDiscountId}
              placeholder="Choose"
              options={(data ?? []).filter((row) => row.active).map((row) => ({ value: row.id, label: row.name }))}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" className="mt-4" loading={assign.isPending}>
          Assign discount
        </Button>
      </form>
    </div>
  );
}
