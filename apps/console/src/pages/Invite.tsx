import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, setSession } from "../lib/api";

export function InvitePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    try {
      const session = await api.acceptInvite({
        token: params.get("token") ?? "",
        name: String(data.get("name") || ""),
        password: String(data.get("password") || ""),
      });
      setSession(session);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite is not valid");
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-[24px] bg-surface p-10">
        <h1 className="font-display text-3xl">Join your school</h1>
        <p className="mt-2 text-sm text-muted">Create a password if this is your first sign-in.</p>
        <label className="mt-8 block text-sm font-medium">
          Full name
          <input name="name" className="mt-2 h-12 w-full rounded-xl border border-line px-3" />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Password
          <input name="password" type="password" minLength={8} className="mt-2 h-12 w-full rounded-xl border border-line px-3" />
        </label>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <button type="submit" className="mt-6 h-12 w-full rounded-xl bg-indigo font-medium text-white">
          Accept invite
        </button>
      </form>
    </main>
  );
}
