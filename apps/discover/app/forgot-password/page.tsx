"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { client } from "@/lib/client";

export default function ForgotPage() {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const res = await client.forgot(String(data.get("email")));
    setMessage(res.message);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <form onSubmit={onSubmit} className="w-full rounded-[24px] bg-surface p-8">
        <h1 className="font-serif text-3xl">Reset password</h1>
        <input name="email" type="email" required placeholder="Email" className="mt-6 h-12 w-full rounded-xl border border-line px-3" />
        {message ? <p className="mt-3 text-sm">{message}</p> : null}
        <button type="submit" className="mt-6 h-12 w-full rounded-xl bg-indigo text-white">
          Send link
        </button>
        <Link href="/login" className="mt-4 inline-block text-sm text-indigo">
          Sign in
        </Link>
      </form>
    </main>
  );
}
