import { useQuery } from "@tanstack/react-query";
import { LoadingState, PageHeader } from "@wellrun/ui";
import { FormEvent, useState } from "react";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query";

export function ProfilePage() {
  const { data, isPending } = useQuery({ queryKey: queryKeys.schoolProfile, queryFn: api.schoolProfile });
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (isPending || !data) return <LoadingState variant="form" />;

  const profile = (data.school.profile ?? {}) as Record<string, string | number>;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    try {
      await api.updateProfile({
        about: String(form.get("about")),
        location: String(form.get("location")),
        principal: String(form.get("principal")),
        whatsapp: String(form.get("whatsapp")),
        phone: String(form.get("phone")),
        website: String(form.get("website")),
        address: String(form.get("address")),
        area: String(form.get("area")),
        feeBand: String(form.get("feeBand")),
        feeNotes: String(form.get("feeNotes")),
      });
      setMessage("Public profile updated. Changes show on Discover.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Public profile" description={`This is what parents see on Discover for ${data.school.name}.`} />
      <Card className="mt-8 max-w-3xl">
        <CardContent className="pt-6">
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="about">About</FieldLabel>
                <Textarea id="about" name="about" defaultValue={String(profile.about ?? "")} rows={5} />
              </Field>
              <Field>
                <FieldLabel htmlFor="principal">Principal</FieldLabel>
                <Input id="principal" name="principal" defaultValue={String(profile.principal ?? "")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="location">Location</FieldLabel>
                <Input id="location" name="location" defaultValue={String(profile.location ?? "")} />
              </Field>
              <Field>
                <FieldLabel htmlFor="address">Address</FieldLabel>
                <Input id="address" name="address" defaultValue={data.school.address} />
              </Field>
              <Field>
                <FieldLabel htmlFor="area">Area</FieldLabel>
                <Input id="area" name="area" defaultValue={data.school.area} />
              </Field>
              <Field>
                <FieldLabel htmlFor="whatsapp">WhatsApp</FieldLabel>
                <Input id="whatsapp" name="whatsapp" defaultValue={data.school.whatsapp} />
              </Field>
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" name="phone" defaultValue={data.school.phone} />
              </Field>
              <Field>
                <FieldLabel htmlFor="website">Website</FieldLabel>
                <Input id="website" name="website" defaultValue={data.school.website} />
              </Field>
              <Field>
                <FieldLabel htmlFor="feeBand">Fee band</FieldLabel>
                <FormSelect
                  id="feeBand"
                  name="feeBand"
                  defaultValue={data.school.feeBand}
                  options={[
                    { value: "under_5k", label: "Under Rs. 5,000" },
                    { value: "5k_10k", label: "Rs. 5,000–10,000" },
                    { value: "10k_20k", label: "Rs. 10,000–20,000" },
                    { value: "20k_40k", label: "Rs. 20,000–40,000" },
                    { value: "40k_80k", label: "Rs. 40,000–80,000" },
                    { value: "80k_plus", label: "Rs. 80,000+" },
                    { value: "not_published", label: "Not published" },
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="feeNotes">Fee notes</FieldLabel>
                <Input id="feeNotes" name="feeNotes" defaultValue={String(profile.feeNotes ?? "")} />
              </Field>
              {message ? <p className="text-sm text-primary">{message}</p> : null}
              <Button type="submit" loading={saving}>
                Publish changes
              </Button>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
