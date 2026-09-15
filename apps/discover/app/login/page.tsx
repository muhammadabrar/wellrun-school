"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { BrandLogo, Button } from "@wellrun/ui";
import { client, getSession, setSession } from "@/lib/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const next = params.get("next") ?? "/";

  useEffect(() => {
    if (getSession()) router.replace(next);
  }, [next, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const session = await client.login(String(data.get("email")), String(data.get("password")));
      setSession(session);
      router.push(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email or password is incorrect");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full rounded-[24px] bg-surface p-8">
      <Link href="/" className="inline-flex" aria-label="WellRun School home">
        <BrandLogo size="md" />
      </Link>
      <h1 className="mt-3 font-serif text-3xl">Sign in</h1>
      <label className="mt-6 block text-sm font-medium">
        Email
        <input name="email" type="email" required autoComplete="email" className="mt-2 h-12 w-full rounded-xl border border-line px-3" />
      </label>
      <label className="mt-3 block text-sm font-medium">
        Password
        <input name="password" type="password" required autoComplete="current-password" className="mt-2 h-12 w-full rounded-xl border border-line px-3" />
      </label>
      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      <Button type="submit" loading={pending} size="lg" className="mt-6 w-full">
        Continue
      </Button>
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
