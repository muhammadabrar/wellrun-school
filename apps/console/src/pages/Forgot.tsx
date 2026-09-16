import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandLogo size="md" />
          <CardTitle className="font-display text-3xl">Reset password</CardTitle>
          <CardDescription>We will email a link if the account exists.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" required />
              </Field>
              {message ? <p className="text-sm text-success">{message}</p> : null}
              <Button type="submit" size="lg" className="w-full" loading={pending}>
                Send link
              </Button>
            </FieldGroup>
          </form>
          <Link to="/login" className="mt-4 inline-block text-sm text-primary">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
