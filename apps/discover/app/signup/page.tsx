"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { client, getSession, setSession } from "@/lib/client";

export default function SignupPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (getSession()) router.replace("/");
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!data.get("terms")) {
      setError("Please accept the terms to continue.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const session = await client.signup({
        name: String(data.get("name")),
        email: String(data.get("email")),
        password: String(data.get("password")),
        confirm: String(data.get("confirm")),
      });
      setSession(session);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md items-center px-4">
      <form onSubmit={onSubmit} className="w-full rounded-[24px] bg-surface p-8">
        <Link href="/" className="text-sm text-indigo">
          Back
        </Link>
        <h1 className="mt-3 font-serif text-3xl">Create an account</h1>
        <p className="mt-2 text-sm text-muted">Parents start here. School staff are invited or claim a profile.</p>
        <input name="name" required placeholder="Full name" className="mt-6 h-12 w-full rounded-xl border border-line px-3" />
        <input name="email" type="email" required placeholder="Email" className="mt-3 h-12 w-full rounded-xl border border-line px-3" />
        <input name="password" type="password" minLength={8} required placeholder="Password (8+ characters)" className="mt-3 h-12 w-full rounded-xl border border-line px-3" />
        <input name="confirm" type="password" minLength={8} required placeholder="Confirm password" className="mt-3 h-12 w-full rounded-xl border border-line px-3" />
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input name="terms" type="checkbox" className="mt-1" />
          I agree to the terms and privacy notice.
        </label>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <button type="submit" disabled={pending} className="mt-6 h-12 w-full rounded-xl bg-indigo font-medium text-white">
          {pending ? "Creating…" : "Create account"}
        </button>
        <p className="mt-4 text-sm">
          Already have an account?{" "}
          <Link href="/login" className="text-indigo">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
