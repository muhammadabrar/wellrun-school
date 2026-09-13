import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, setSession } from "../lib/api";

export function LoginPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const session = await api.login(String(data.get("email")), String(data.get("password")));
      if (session.user.role === "PARENT") {
        setError("This account is for Discover. Open http://localhost:3001 to browse schools.");
        return;
      }
      setSession(session);
      navigate(session.user.role === "PLATFORM_ADMIN" ? "/admin" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email or password is incorrect.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-[24px] bg-surface p-10 shadow-[0_12px_40px_rgba(22,22,29,0.08)]">
        <p className="font-display text-xs font-semibold tracking-[0.18em] text-indigo uppercase">
          Wellrun School
        </p>
        <h1 className="mt-3 font-display text-3xl">Sign in to your school</h1>
        <p className="mt-2 text-sm text-muted">Demo: admin@greenfield.school / school123</p>
        <label className="mt-8 block text-sm font-medium">
          Email
          <input
            name="email"
            type="email"
            required
            defaultValue="admin@greenfield.school"
            className="mt-2 h-12 w-full rounded-xl border border-line px-3"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            required
            defaultValue="school123"
            className="mt-2 h-12 w-full rounded-xl border border-line px-3"
          />
        </label>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="mt-8 h-12 w-full rounded-xl bg-indigo font-medium text-white"
        >
          {pending ? "Signing in…" : "Continue"}
        </button>
        <p className="mt-4 text-sm">
          <Link className="text-indigo" to="/forgot-password">
            Forgot password
          </Link>
          {" · "}
          <Link className="text-indigo" to="/register">
            Register a school
          </Link>
        </p>
      </form>
    </main>
  );
}
