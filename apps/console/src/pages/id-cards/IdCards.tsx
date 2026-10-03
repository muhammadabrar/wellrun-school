import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Tabs } from "@wellrun/ui";
import { Camera, Printer } from "lucide-react";
import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useCampus } from "@/hooks/use-campus";
import { documentKeys, idCardsApi } from "@/lib/documents-api";

const ALL = "all";

export function IdCardsPage() {
  const { classes } = useCampus();
  const [params, setParams] = useSearchParams();
  const kind = params.get("kind") === "staff" ? "staff" : "student";
  const classId = params.get("classId") ?? ALL;
  const [sides, setSides] = useState<"both" | "front">("both");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key === "kind") next.delete("classId");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const query = { kind, classId: kind === "student" && classId !== ALL ? classId : undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: documentKeys.idCards(query), queryFn: () => idCardsApi.people(query), placeholderData: keepPreviousData });

  async function print() {
    setBusy(true);
    setError(null);
    try {
      window.open(await idCardsApi.pdf({ ...query, sides }), "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't make the cards");
    } finally {
      setBusy(false);
    }
  }

  const people = data?.people ?? [];
  const sheets = Math.ceil(people.length / 8);

  return (
    <div className="space-y-6">
      <PageHeader title="ID cards" description="Credit-card sized cards with a photo, name, number and a QR code. They print eight to an A4 page: the fronts on one page and the backs on the next, lined up for double-sided printing." />

      <div className="flex flex-wrap items-end gap-3">
        <Tabs value={kind} onChange={(id) => setParam("kind", id === "staff" ? "staff" : null)} items={[{ id: "student", label: "Students" }, { id: "staff", label: "Staff" }]} />
        {kind === "student" ? (
          <div className="w-52">
            <Label htmlFor="ic-class">Class</Label>
            <FormSelect id="ic-class" value={classId} onValueChange={(v) => setParam("classId", v && v !== ALL ? v : null)} options={[{ value: ALL, label: "All classes" }, ...classes.map((c) => ({ value: c.id, label: `${c.name} ${c.section}` }))]} />
          </div>
        ) : null}
        <div className="w-52">
          <Label htmlFor="ic-sides">Print</Label>
          <FormSelect id="ic-sides" value={sides} onValueChange={(v) => v && setSides(v as "both" | "front")} options={[{ value: "both", label: "Front and back" }, { value: "front", label: "Fronts only" }]} />
        </div>
        <Button onClick={() => void print()} loading={busy} disabled={!people.length}>
          <Printer className="size-4" aria-hidden /> Make the cards (PDF)
        </Button>
        <FetchingIndicator show={isFetching && !isPending} />
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

      {isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load the list" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !people.length ? (
        <EmptyState title="Nobody to make cards for" description={kind === "student" ? "No students are enrolled in this class this year." : "No active staff yet."} />
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {data.label}: <strong>{people.length}</strong> {people.length === 1 ? "card" : "cards"}, {sheets} {sheets === 1 ? "sheet" : "sheets"}
            {sides === "both" ? " (front and back)" : ""}
            {data.validUntil ? `. Student cards say "valid until" the end of this academic year.` : "."}
          </p>
          {data.withoutPhoto ? (
            <p role="status" className="flex items-start gap-2 rounded-2xl bg-orange/10 px-4 py-3 text-sm text-orange">
              <Camera className="mt-0.5 size-4 shrink-0" aria-hidden />
              {data.withoutPhoto} of {people.length} have no photo and will show their first letter instead. Add a photo on {kind === "student" ? "the student's page" : "the staff member's page"}. JPG and PNG photos print on the card.
            </p>
          ) : null}
          <div className="overflow-x-auto rounded-3xl bg-surface">
            <table className="w-full min-w-max text-sm">
              <caption className="sr-only">People who will get a card</caption>
              <thead>
                <tr className="border-b border-line text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Name</th>
                  <th scope="col" className="px-4 py-3 font-medium">{kind === "student" ? "Class" : "Job"}</th>
                  <th scope="col" className="px-4 py-3 font-medium">{kind === "student" ? "Admission no." : "Employee no."}</th>
                  <th scope="col" className="px-4 py-3 font-medium">Photo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5">
                      <Link to={kind === "student" ? `/students/${p.id}` : `/staff/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                    </td>
                    <td className="px-4 py-2.5">{p.subtitle || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{p.number}</td>
                    <td className="px-4 py-2.5">{p.hasPhoto ? <Badge tone="success">Has a photo</Badge> : <Badge tone="warning">No photo</Badge>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
