import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BrandLogo } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandLogo size="md" />
          <CardTitle className="font-display text-3xl">Choose a new password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="password">New password</FieldLabel>
                <Input id="password" name="password" type="password" minLength={8} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
                <Input id="confirm" name="confirm" type="password" minLength={8} required />
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              {message ? <p className="text-sm text-success">{message}</p> : null}
              <Button type="submit" size="lg" className="w-full" loading={pending}>
                Update password
              </Button>
            </FieldGroup>
          </form>
          <Link to="/login" className="mt-4 inline-block text-sm text-primary">
            Sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
