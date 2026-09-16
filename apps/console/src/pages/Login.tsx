import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { api, setSession } from "@/lib/api";

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
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandLogo size="md" />
          <CardTitle className="font-display text-3xl">Sign in to your school</CardTitle>
          <CardDescription>Demo: admin@greenfield.school / school123</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" required defaultValue="admin@greenfield.school" />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" name="password" type="password" required defaultValue="school123" />
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" size="lg" className="w-full" disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                Continue
              </Button>
            </FieldGroup>
          </form>
          <p className="mt-4 text-sm">
            <Link className="text-primary" to="/forgot-password">
              Forgot password
            </Link>
            {" · "}
            <Link className="text-primary" to="/register">
              Register a school
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
