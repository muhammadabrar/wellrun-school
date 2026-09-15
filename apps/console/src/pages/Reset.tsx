import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BrandLogo, Button } from "@wellrun/ui";
import { api } from "../lib/api";

export function ResetPage() {
  const [params] = useSearchParams();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    setPending(true);
    try {
      const res = await api.reset(params.get("token") ?? "", String(data.get("password")), String(data.get("confirm")));
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-[24px] bg-surface p-10">
        <BrandLogo size="md" />
        <h1 className="mt-3 font-display text-3xl">Choose a new password</h1>
        <label className="mt-8 block text-sm font-medium">
          New password
          <input name="password" type="password" minLength={8} required className="mt-2 h-12 w-full rounded-xl border border-line px-3" />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Confirm password
          <input name="confirm" type="password" minLength={8} required className="mt-2 h-12 w-full rounded-xl border border-line px-3" />
        </label>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        {message ? <p className="mt-3 text-sm text-success">{message}</p> : null}
        <Button type="submit" loading={pending} size="lg" className="mt-6 w-full">
          Update password
        </Button>
        <Link to="/login" className="mt-4 inline-block text-sm text-indigo">
          Sign in
        </Link>
      </form>
    </main>
  );
}
