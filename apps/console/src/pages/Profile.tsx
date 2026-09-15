import { useQuery } from "@tanstack/react-query";
import { Button, LoadingState } from "@wellrun/ui";
import { FormEvent, useState } from "react";
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
      <h1 className="font-display text-4xl">Public profile</h1>
      <p className="mt-2 text-muted">This is what parents see on Discover for {data.school.name}.</p>
      <form onSubmit={onSubmit} className="mt-8 grid max-w-3xl gap-3 rounded-3xl bg-surface p-6">
        <textarea name="about" defaultValue={String(profile.about ?? "")} rows={5} className="rounded-xl border border-line p-3" />
        <input name="principal" defaultValue={String(profile.principal ?? "")} placeholder="Principal" className="h-11 rounded-xl border border-line px-3" />
        <input name="location" defaultValue={String(profile.location ?? "")} placeholder="Location" className="h-11 rounded-xl border border-line px-3" />
        <input name="address" defaultValue={data.school.address} placeholder="Address" className="h-11 rounded-xl border border-line px-3" />
        <input name="area" defaultValue={data.school.area} placeholder="Area" className="h-11 rounded-xl border border-line px-3" />
        <input name="whatsapp" defaultValue={data.school.whatsapp} placeholder="WhatsApp" className="h-11 rounded-xl border border-line px-3" />
        <input name="phone" defaultValue={data.school.phone} placeholder="Phone" className="h-11 rounded-xl border border-line px-3" />
        <input name="website" defaultValue={data.school.website} placeholder="Website" className="h-11 rounded-xl border border-line px-3" />
        <select name="feeBand" defaultValue={data.school.feeBand} className="h-11 rounded-xl border border-line px-3">
          <option value="under_5k">Under Rs. 5,000</option>
          <option value="5k_10k">Rs. 5,000–10,000</option>
          <option value="10k_20k">Rs. 10,000–20,000</option>
          <option value="20k_40k">Rs. 20,000–40,000</option>
          <option value="40k_80k">Rs. 40,000–80,000</option>
          <option value="80k_plus">Rs. 80,000+</option>
          <option value="not_published">Not published</option>
        </select>
        <input name="feeNotes" defaultValue={String(profile.feeNotes ?? "")} placeholder="Fee notes" className="h-11 rounded-xl border border-line px-3" />
        {message ? <p className="text-sm text-indigo">{message}</p> : null}
        <Button type="submit" loading={saving}>
          Publish changes
        </Button>
      </form>
    </div>
  );
}
