import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query";

export function CampusesPage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: queryKeys.campuses, queryFn: api.campuses });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    await queryClient.invalidateQueries({ queryKey: queryKeys.campuses });
  }

  async function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setBusy("add");
    try {
      await api.addCampus({
        name: String(form.get("name")),
        code: String(form.get("code")),
        address: String(form.get("address")),
        phone: String(form.get("phone")),
        principal: String(form.get("principal")),
      });
      event.currentTarget.reset();
      setMessage("Campus added.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add campus");
    } finally {
      setBusy(null);
    }
  }

  async function onEdit(id: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setBusy(id);
    try {
      await api.updateCampus(id, {
        name: String(form.get("name")),
        code: String(form.get("code")),
        address: String(form.get("address")),
        phone: String(form.get("phone")),
        principal: String(form.get("principal")),
      });
      setMessage("Campus updated.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update campus");
    } finally {
      setBusy(null);
    }
  }

  if (isPending || !data) return <LoadingState variant="form" />;

  return (
    <div className="max-w-4xl">
      <PageHeader title="Campuses" description="The main campus was created during setup. Add branches here." />
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-primary">{message}</p> : null}
      <div className="mt-8 space-y-4">
        {data.campuses.map((campus) => (
          <Card key={campus.id}>
            <CardHeader>
              <CardDescription>{campus.isMain ? "Main campus" : "Branch"}</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={(event) => onEdit(campus.id, event)}>
                <FieldGroup className="grid grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor={`${campus.id}-name`}>Name</FieldLabel>
                    <Input id={`${campus.id}-name`} name="name" defaultValue={campus.name} required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${campus.id}-code`}>Code</FieldLabel>
                    <Input id={`${campus.id}-code`} name="code" defaultValue={campus.code} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${campus.id}-address`}>Address</FieldLabel>
                    <Input id={`${campus.id}-address`} name="address" defaultValue={campus.address} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${campus.id}-phone`}>Phone</FieldLabel>
                    <Input id={`${campus.id}-phone`} name="phone" defaultValue={campus.phone} />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`${campus.id}-principal`}>Principal</FieldLabel>
                    <Input id={`${campus.id}-principal`} name="principal" defaultValue={campus.principal} />
                  </Field>
                  <Button type="submit" variant="outline" loading={busy === campus.id}>
                    Save
                  </Button>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle>Add campus</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onAdd}>
              <FieldGroup className="grid grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="new-name">Campus name</FieldLabel>
                  <Input id="new-name" name="name" required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-code">Code</FieldLabel>
                  <Input id="new-code" name="code" placeholder="BRANCH" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-address">Address</FieldLabel>
                  <Input id="new-address" name="address" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-phone">Phone</FieldLabel>
                  <Input id="new-phone" name="phone" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-principal">Principal</FieldLabel>
                  <Input id="new-principal" name="principal" />
                </Field>
                <Button type="submit" loading={busy === "add"} className="col-span-2">
                  Add campus
                </Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
