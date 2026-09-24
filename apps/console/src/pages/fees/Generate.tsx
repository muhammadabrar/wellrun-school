import { useMutation } from "@tanstack/react-query";
import { EmptyState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@wellrun/ui";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api, type FeePreview } from "@/lib/api";
import { pkr } from "@/lib/format";
import { readYearId } from "@/lib/school-context";

export function FeeGeneratePage() {
  const [preview, setPreview] = useState<FeePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [filters, setFilters] = useState({ billingPeriod: currentPeriod(), className: "", section: "" });
  const previewMut = useMutation({ mutationFn: api.previewFees });
  const generate = useMutation({ mutationFn: api.generateFees });

  async function onPreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const next = {
      billingPeriod: String(form.get("billingPeriod")),
      className: String(form.get("className")),
      section: String(form.get("section")),
      academicYearId: readYearId(),
    };
    setFilters(next);
    setError(null);
    try {
      setPreview(await previewMut.mutateAsync(next));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not preview invoices");
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader title="Generate fees" description="Create invoices for the current campus and year. Running the same period twice skips students who already have an invoice." />
      <form onSubmit={(event) => void onPreview(event)} className="rounded-3xl bg-surface p-6">
        <FieldGroup className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="period">Billing period</FieldLabel>
            <Input id="period" name="billingPeriod" type="month" defaultValue={filters.billingPeriod} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="gen-class">Class</FieldLabel>
            <Input id="gen-class" name="className" placeholder="All classes" />
          </Field>
          <Field>
            <FieldLabel htmlFor="gen-section">Section</FieldLabel>
            <Input id="gen-section" name="section" placeholder="All sections" />
          </Field>
        </FieldGroup>
        <Button type="submit" className="mt-4" loading={previewMut.isPending}>
          Preview
        </Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {preview ? (
        <div className="rounded-3xl bg-surface p-6">
          <p className="text-sm text-muted-foreground">
            {preview.create} invoices · {pkr(preview.totalPkr)} · {preview.skipped} already billed
          </p>
          {!preview.students.length ? (
            <div className="mt-4">
              <EmptyState title="Nothing to generate" description="Assign an active structure to enrolled students first." />
            </div>
          ) : (
            <ul className="mt-4 space-y-2 text-sm">
              {preview.students.map((row) => (
                <li key={row.id} className="flex justify-between">
                  <span>
                    {row.name} <span className="text-muted-foreground">{row.admissionNo}</span>
                  </span>
                  <span>{pkr(row.amountPkr)}</span>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" className="mt-6" disabled={!preview.create} onClick={() => setConfirmOpen(true)}>
            Generate {preview.create} invoices
          </Button>
        </div>
      ) : null}
      <Dialog
        open={confirmOpen}
        title="Generate invoices?"
        description="This writes invoices for the previewed students. Existing invoices for the same period are left unchanged."
        confirmLabel="Generate"
        loading={generate.isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          void generate.mutateAsync({ ...filters, confirm: true }).then(() => {
            setConfirmOpen(false);
            setPreview(null);
          });
        }}
      />
    </div>
  );
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
