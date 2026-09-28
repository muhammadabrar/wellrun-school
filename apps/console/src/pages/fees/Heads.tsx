import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { FeeTitleSelect, frequencyLabel } from "@/components/fees/fee-title-select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

const frequencyOptions = [
  { value: "MONTHLY", label: "Monthly — every month" },
  { value: "QUARTERLY", label: "Quarterly — once every 3 months" },
  { value: "ANNUAL", label: "Once a year" },
  { value: "ONE_TIME", label: "One time — e.g. at admission" },
];

export function FeeHeadsPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feeHeads, queryFn: api.feeHeads });
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [amountPkr, setAmountPkr] = useState("0");
  const [frequency, setFrequency] = useState("MONTHLY");
  const [tab, setTab] = useState("active");
  const create = useMutation({
    mutationFn: api.createFeeHead,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.feeSetupStatus });
      return queryClient.invalidateQueries({ queryKey: queryKeys.feeHeads });
    },
  });
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) => api.updateFeeHead(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.feeHeads }),
  });

  if (isPending && !data) return <LoadingState variant="form" />;
  if (isError) return <ErrorState title="Could not load fee heads" description="Try again." onRetry={() => void refetch()} />;

  const active = (data ?? []).filter((head) => head.active);
  const archived = (data ?? []).filter((head) => !head.active);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Choose or type a fee title.");
      return;
    }
    try {
      await create.mutateAsync({
        name,
        amountPkr: Number(amountPkr || 0),
        frequency,
      });
      setName("");
      setAmountPkr("0");
      setFrequency("MONTHLY");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create this fee head");
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <PageHeader
        title="Fee Heads"
        description="Every type of fee your school charges — tuition, admission, exams — with its usual amount. Class fee structures are built from these."
      />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <form onSubmit={(event) => void onCreate(event)} className="rounded-3xl bg-surface p-6">
        <FieldGroup className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="head-name">Fee title</FieldLabel>
            <FeeTitleSelect
              id="head-name"
              value={name}
              existingTitles={active.map((head) => head.name)}
              onChange={(title, suggested) => {
                setName(title);
                if (suggested) setFrequency(suggested);
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="head-amount">Default amount (Rs.)</FieldLabel>
            <Input
              id="head-amount"
              name="amountPkr"
              type="number"
              min={0}
              step={1}
              value={amountPkr}
              onChange={(event) => setAmountPkr(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="head-frequency">How often it's charged</FieldLabel>
            <FormSelect
              id="head-frequency"
              value={frequency}
              onValueChange={(value) => setFrequency(value || "MONTHLY")}
              options={frequencyOptions}
            />
          </Field>
        </FieldGroup>
        <Button type="submit" className="mt-4" loading={create.isPending}>
          Add fee
        </Button>
      </form>
      <Tabs value={tab} onValueChange={(value) => setTab(value || "active")}>
        <TabsList size="default" className="h-12">
          <TabsTrigger value="active" className="px-4 text-base">
            Active ({active.length})
          </TabsTrigger>
          <TabsTrigger value="archived" className="px-4 text-base">
            Archived ({archived.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-4">
          <HeadList
            rows={active}
            emptyTitle="No active fee heads"
            emptyDescription="Add tuition, transport, or one-time charges here."
            actionLabel="Archive"
            pending={update.isPending}
            onToggle={(id) => void update.mutateAsync({ id, payload: { active: false } })}
          />
        </TabsContent>
        <TabsContent value="archived" className="mt-4">
          <HeadList
            rows={archived}
            emptyTitle="No archived fee heads"
            emptyDescription="Archived heads stay in history and can be restored."
            actionLabel="Restore"
            pending={update.isPending}
            onToggle={(id) => void update.mutateAsync({ id, payload: { active: true } })}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HeadList({
  rows,
  emptyTitle,
  emptyDescription,
  actionLabel,
  pending,
  onToggle,
}: {
  rows: { id: string; name: string; code: string; frequency: string; amountPkr: number }[];
  emptyTitle: string;
  emptyDescription: string;
  actionLabel: string;
  pending: boolean;
  onToggle: (id: string) => void;
}) {
  if (!rows.length) return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((head) => (
        <Card key={head.id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div>
              <p className="font-medium">{head.name}</p>
              <p className="text-sm text-muted-foreground">
                {frequencyLabel(head.frequency)} · {pkr(head.amountPkr)}
              </p>
            </div>
            <Button type="button" variant="outline" loading={pending} onClick={() => onToggle(head.id)}>
              {actionLabel}
            </Button>
          </CardContent>
        </Card>
      ))}
    </ul>
  );
}
