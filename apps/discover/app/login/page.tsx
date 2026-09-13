"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { client, getSession, setSession } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const next = params.get("next") ?? "/";

  useEffect(() => {
    if (getSession()) router.replace(next);
  }, [next, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const session = await client.login(String(data.get("email")), String(data.get("password")));
      setSession(session);
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email or password is incorrect");
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full rounded-[24px] bg-surface p-8">
      <Link href="/" className="text-sm text-indigo">
        Back
      </Link>
      <h1 className="mt-3 font-serif text-3xl">Sign in</h1>
      <input name="email" type="email" required placeholder="Email" className="mt-6 h-12 w-full rounded-xl border border-line px-3" />
      <input name="password" type="password" required placeholder="Password" className="mt-3 h-12 w-full rounded-xl border border-line px-3" />
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <button type="submit" className="mt-6 h-12 w-full rounded-xl bg-indigo font-medium text-white">
        Continue
      </button>
      <p className="mt-4 text-sm">
        <Link href="/forgot-password" className="text-indigo">
          Forgot password
        </Link>
      </p>
      <p className="mt-2 text-sm">
        New here?{" "}
        <Link href="/signup" className="text-indigo">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
