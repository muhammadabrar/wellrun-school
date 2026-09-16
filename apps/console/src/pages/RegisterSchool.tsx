import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BrandLogo } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
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
      <Card className="w-full max-w-md">
        <CardHeader>
          <BrandLogo size="md" />
          <CardTitle className="font-display text-3xl">Register your school</CardTitle>
          <CardDescription>You become the super admin and finish setup in a few steps.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="name">Your name</FieldLabel>
                <Input id="name" name="name" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="schoolName">Institute title</FieldLabel>
                <Input id="schoolName" name="schoolName" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Work email</FieldLabel>
                <Input id="email" name="email" type="email" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input id="password" name="password" type="password" minLength={8} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm">Confirm password</FieldLabel>
                <Input id="confirm" name="confirm" type="password" minLength={8} required />
              </Field>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button type="submit" size="lg" className="w-full" loading={pending}>
                Start setup
              </Button>
            </FieldGroup>
          </form>
          <p className="mt-4 text-sm">
            Already have an account?{" "}
            <Link to="/login" className="text-primary">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
