import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, EmptyState, ErrorState, PageHeader, Skeleton } from "@wellrun/ui";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { FeeStatusBadge, InvoiceBreakdown, formatDate } from "@/components/fees/fee-ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCampus } from "@/hooks/use-campus";
import { api, type FeeGenerateResult, type GenerateFeesPayload } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { readSchoolContext, readYearId } from "@/lib/school-context";

const ALL = "all";

function monthLabel(period: string) {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function thisMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export function FeeGeneratePage() {
  const queryClient = useQueryClient();
  const { campuses, campusId: activeCampusId, years, currentYear } = useCampus();
  const [yearId, setYearId] = useState(readYearId() || currentYear?.id || "");
  const [campusId, setCampusId] = useState(activeCampusId);
  const [billingPeriod, setBillingPeriod] = useState(thisMonth());
  const [classId, setClassId] = useState(ALL);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<FeeGenerateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classes = useMemo(
    () =>
      (readSchoolContext()?.classes ?? []).filter(
        (cls) => cls.yearId === yearId && (!campusId || !cls.campusId || cls.campusId === campusId),
      ),
    [campusId, yearId],
  );
  const selectedClass = classes.find((cls) => cls.id === classId) ?? null;
  const payload: GenerateFeesPayload = {
    billingPeriod,
    academicYearId: yearId,
    campusId: campusId || undefined,
    className: selectedClass?.name,
    section: selectedClass?.section,
  };
  const ready = Boolean(yearId && /^\d{4}-\d{2}$/.test(billingPeriod));

  const preview = useQuery({
    queryKey: queryKeys.feePreview(payload),
    queryFn: () => api.previewFees(payload),
    enabled: ready,
  });
  const generate = useMutation({
    mutationFn: () => api.generateFees({ ...payload, confirm: true }),
    onSuccess: async (data) => {
      setResult(data);
      setConfirmOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["fees"] });
    },
    onError: (err) => {
      setConfirmOpen(false);
      setError(err instanceof Error ? err.message : "Could not generate invoices.");
    },
  });

  const scopeLabel = `${selectedClass ? `${selectedClass.name} ${selectedClass.section}`.trim() : "All classes"} · ${
    campuses.find((row) => row.id === campusId)?.name ?? "all campuses"
  }`;

  function changeFilter(update: () => void) {
    update();
    setResult(null);
    setError(null);
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Generate monthly fees"
        description="Create this month's invoices for every student with a fee structure. Students already invoiced for the month are skipped, so it's safe to run again."
      />

      <Card>
        <CardContent className="grid gap-4 pt-(--card-spacing) sm:grid-cols-2 lg:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="gen-year">Academic year</FieldLabel>
            <FormSelect
              id="gen-year"
              value={yearId || null}
              onValueChange={(value) => changeFilter(() => { setYearId(value ?? ""); setClassId(ALL); })}
              placeholder="Choose a year"
              options={years.map((year) => ({ value: year.id, label: year.name }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="gen-month">Month</FieldLabel>
            <Input id="gen-month" type="month" value={billingPeriod} onChange={(event) => changeFilter(() => setBillingPeriod(event.target.value))} required />
          </Field>
          <Field>
            <FieldLabel htmlFor="gen-campus">Campus</FieldLabel>
            <FormSelect
              id="gen-campus"
              value={campusId || null}
              onValueChange={(value) => changeFilter(() => { setCampusId(value ?? ""); setClassId(ALL); })}
              placeholder="Choose a campus"
              options={campuses.map((campus) => ({ value: campus.id, label: campus.name }))}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="gen-class">Class</FieldLabel>
            <FormSelect
              id="gen-class"
              value={classId}
              onValueChange={(value) => changeFilter(() => setClassId(value ?? ALL))}
              options={[{ value: ALL, label: "All classes" }, ...classes.map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}`.trim() }))]}
            />
          </Field>
        </CardContent>
      </Card>

      {!result ? (
        <Card>
          <CardHeader>
            <CardTitle>{monthLabel(billingPeriod)}</CardTitle>
            <CardDescription>{scopeLabel}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!ready ? (
              <p className="text-sm text-muted-foreground">Choose an academic year and month.</p>
            ) : preview.isPending ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            ) : preview.isError ? (
              <ErrorState title="Could not check this month" description="We couldn't work out who will be invoiced. Try again." onRetry={() => void preview.refetch()} />
            ) : (
              <>
                <dl className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-paper p-4">
                    <dt className="text-sm text-muted-foreground">New invoices</dt>
                    <dd className="font-display text-3xl tabular-nums">{preview.data.create}</dd>
                  </div>
                  <div className="rounded-2xl bg-paper p-4">
                    <dt className="text-sm text-muted-foreground">Total to bill</dt>
                    <dd className="font-display text-3xl tabular-nums">{pkr(preview.data.totalPkr)}</dd>
                  </div>
                  <div className="rounded-2xl bg-paper p-4">
                    <dt className="text-sm text-muted-foreground">Due date</dt>
                    <dd className="font-display text-3xl">{formatDate(preview.data.dueOn)}</dd>
                  </div>
                </dl>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {preview.data.skippedAlreadyBilled ? <li>{preview.data.skippedAlreadyBilled} student(s) already have an invoice for this month — skipped.</li> : null}
                  {preview.data.skippedZeroTotal ? <li>{preview.data.skippedZeroTotal} student(s) owe nothing after discounts — no invoice needed.</li> : null}
                  {preview.data.missingAssignment ? (
                    <li className="text-orange">
                      {preview.data.missingAssignment} student(s) have no fee structure assigned and won't be billed.{" "}
                      <Link to="/fees/structures" className="text-indigo">
                        Check fee structures
                      </Link>
                    </li>
                  ) : null}
                </ul>
                {error ? (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                ) : null}
                <Button type="button" size="lg" disabled={!preview.data.create} onClick={() => setConfirmOpen(true)}>
                  {preview.data.create ? `Generate ${preview.data.create} invoices` : "Nothing new to generate"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <GeneratedList result={result} period={billingPeriod} onReset={() => setResult(null)} />
      )}

      <Dialog
        open={confirmOpen}
        title={`Generate ${preview.data?.create ?? 0} invoices?`}
        description={`${monthLabel(billingPeriod)} · ${scopeLabel} · ${pkr(preview.data?.totalPkr ?? 0)} in total. Invoices are marked Unpaid until payment is collected.`}
        confirmLabel="Generate"
        loading={generate.isPending}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => generate.mutate()}
      />
    </div>
  );
}

function GeneratedList({ result, period, onReset }: { result: FeeGenerateResult; period: string; onReset: () => void }) {
  return (
    <section className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">
            {result.created} invoices created · {pkr(result.totalPkr)}
          </h2>
          <p className="text-sm text-muted-foreground">
            {monthLabel(period)}
            {result.skippedAlreadyBilled ? ` · ${result.skippedAlreadyBilled} already invoiced` : ""}
            {result.missingAssignment ? ` · ${result.missingAssignment} without a fee structure` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link to={`/fees/invoices?billingPeriod=${period}`} />}>
            View all invoices for the month
          </Button>
          <Button type="button" variant="ghost" onClick={onReset}>
            Generate another
          </Button>
        </div>
      </div>
      {!result.invoices.length ? (
        <EmptyState title="No new invoices" description="Everyone in this selection was already invoiced for the month." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.invoices.map((invoice) => (
            <Card key={invoice.id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div className="min-w-0">
                  <CardDescription>{invoice.invoiceNumber}</CardDescription>
                  <CardTitle className="truncate">
                    {invoice.student ? (
                      <Link to={`/students/${invoice.student.id}?tab=fees`} className="hover:text-indigo">
                        {invoice.student.name}
                      </Link>
                    ) : (
                      "Student"
                    )}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {invoice.student ? `${invoice.student.className} ${invoice.student.section}`.trim() : ""} · Due {formatDate(invoice.dueOn)}
                  </p>
                </div>
                <FeeStatusBadge status={invoice.status} />
              </CardHeader>
              <CardContent>
                <InvoiceBreakdown invoice={invoice} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
