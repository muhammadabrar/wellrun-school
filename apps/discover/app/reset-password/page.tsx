"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { client } from "@/lib/client";

function ResetForm() {
  const params = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const res = await client.reset(params.get("token") ?? "", String(data.get("password")), String(data.get("confirm")));
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset");
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full rounded-[24px] bg-surface p-8">
      <h1 className="font-serif text-3xl">New password</h1>
      <input name="password" type="password" minLength={8} required placeholder="New password" className="mt-6 h-12 w-full rounded-xl border border-line px-3" />
      <input name="confirm" type="password" minLength={8} required placeholder="Confirm" className="mt-3 h-12 w-full rounded-xl border border-line px-3" />
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-3 text-sm">{message}</p> : null}
      <button type="submit" className="mt-6 h-12 w-full rounded-xl bg-indigo text-white">
        Update password
      </button>
      <Link href="/login" className="mt-4 inline-block text-sm text-indigo">
        Sign in
      </Link>
    </form>
  );
}

export default function ResetPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Suspense>
        <ResetForm />
      </Suspense>
    </main>
  );
}
