"use client";

import { Button } from "@wellrun/ui";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { client, getSession } from "@/lib/client";

export function ClaimForm({ slug, claimed }: { slug: string; claimed: boolean }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [mine, setMine] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const session = getSession();
    setLoggedIn(Boolean(session));
    if (session) {
      client.myClaims().then((rows) => {
        const row = rows.find((r) => r.school.slug === slug);
        if (row) setMine(row.status);
      }).catch(() => undefined);
    }
  }, [slug]);

  if (claimed) return null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      await client.claim({
        slug,
        roleAtSchool: String(data.get("roleAtSchool")),
        whatsapp: String(data.get("whatsapp")),
        note: String(data.get("note") || ""),
      });
      setMine("PENDING");
      setMessage("Claim submitted. We will review it and email you.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit claim");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="mt-8 rounded-2xl bg-surface p-4">
      <h2 className="font-display text-lg font-semibold">Work at this school?</h2>
      {mine === "PENDING" || message ? (
        <p className="mt-2 text-sm text-muted">{message ?? "Your claim is pending review."}</p>
      ) : !loggedIn ? (
        <p className="mt-2 text-sm text-muted">
          <Link href={`/login?next=/schools/${slug}`} className="text-indigo">
            Sign in
          </Link>{" "}
          to claim this profile.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-3 grid gap-2">
          <select name="roleAtSchool" className="h-11 rounded-xl border border-line px-3">
            <option value="principal">Principal</option>
            <option value="owner">Owner</option>
            <option value="admin">Admin</option>
          </select>
          <input name="whatsapp" required placeholder="Official WhatsApp 03…" className="h-11 rounded-xl border border-line px-3" />
          <input name="note" placeholder="Optional note" className="h-11 rounded-xl border border-line px-3" />
          {error ? <p className="text-sm text-danger">{error}</p> : null}
          <Button type="submit" variant="ink" loading={pending}>
            Claim this school
          </Button>
        </form>
      )}
    </section>
  );
}
