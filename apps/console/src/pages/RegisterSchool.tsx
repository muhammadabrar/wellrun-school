import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo, Button } from "@wellrun/ui";
import { api, setSession } from "../lib/api";

export function RegisterSchoolPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const session = await api.registerSchool({
        name: String(data.get("name")),
        email: String(data.get("email")),
        password: String(data.get("password")),
        confirm: String(data.get("confirm")),
        schoolName: String(data.get("schoolName")),
      });
      setSession(session);
      navigate("/setup");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create school");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-[24px] bg-surface p-10 shadow-[0_12px_40px_rgba(22,22,29,0.08)]">
        <BrandLogo size="md" />
        <h1 className="mt-3 font-display text-3xl">Register your school</h1>
        <p className="mt-2 text-sm text-muted">You become the super admin and finish setup in a few steps.</p>
        <input name="name" required placeholder="Your name" className="mt-6 h-12 w-full rounded-xl border border-line px-3" />
        <input name="schoolName" required placeholder="Institute title" className="mt-3 h-12 w-full rounded-xl border border-line px-3" />
        <input name="email" type="email" required placeholder="Work email" className="mt-3 h-12 w-full rounded-xl border border-line px-3" />
        <input name="password" type="password" minLength={8} required placeholder="Password (8+)" className="mt-3 h-12 w-full rounded-xl border border-line px-3" />
        <input name="confirm" type="password" minLength={8} required placeholder="Confirm password" className="mt-3 h-12 w-full rounded-xl border border-line px-3" />
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
        <Button type="submit" loading={pending} size="lg" className="mt-6 w-full">
          Start setup
        </Button>
        <p className="mt-4 text-sm">
          Already have an account?{" "}
          <Link to="/login" className="text-indigo">
            Sign in
          </Link>
        </p>
      </form>
    </main>
  );
}
