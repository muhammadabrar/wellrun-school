"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { BrandLogo, Button } from "@wellrun/ui";
import { client } from "@/lib/client";

export default function ForgotPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    try {
      const res = await client.forgot(String(data.get("email")));
      setMessage(res.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <form onSubmit={onSubmit} className="w-full rounded-[24px] bg-surface p-8">
        <BrandLogo size="md" />
        <h1 className="mt-3 font-serif text-3xl">Reset password</h1>
        <label className="mt-6 block text-sm font-medium">
          Email
          <input name="email" type="email" required autoComplete="email" className="mt-2 h-12 w-full rounded-xl border border-line px-3" />
        </label>
        <p className="mt-1 text-sm text-muted">We’ll email a reset link if this account exists.</p>
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
        <Button type="submit" loading={pending} size="lg" className="mt-6 w-full">
          Send link
        </Button>
        <Link href="/login" className="mt-4 inline-block text-sm text-indigo">
          Sign in
        </Link>
      </form>
    </main>
  );
}
