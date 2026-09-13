import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function ForgotPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    try {
      const res = await api.forgot(String(data.get("email")));
      setMessage(res.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-[24px] bg-surface p-10">
        <h1 className="font-display text-3xl">Reset password</h1>
        <p className="mt-2 text-sm text-muted">We will email a link if the account exists.</p>
        <label className="mt-8 block text-sm font-medium">
          Email
          <input name="email" type="email" required className="mt-2 h-12 w-full rounded-xl border border-line px-3" />
        </label>
        {message ? <p className="mt-3 text-sm text-success">{message}</p> : null}
        <button type="submit" disabled={pending} className="mt-6 h-12 w-full rounded-xl bg-indigo font-medium text-white">
          Send link
        </button>
        <Link to="/login" className="mt-4 inline-block text-sm text-indigo">
          Back to sign in
        </Link>
      </form>
    </main>
  );
}
