import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/form/form-select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Mail, UserPlus } from "lucide-react";
import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query";

export function TeachersPage() {
  const queryClient = useQueryClient();
  const { data: staff, isPending: staffPending } = useQuery({ queryKey: queryKeys.staff, queryFn: api.staff });
  const { data: classes = [] } = useQuery({ queryKey: queryKeys.classes, queryFn: api.classes });
  const { data: invites = [] } = useQuery({ queryKey: queryKeys.invites, queryFn: api.invites });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.staff }),
      queryClient.invalidateQueries({ queryKey: queryKeys.invites }),
    ]);
  }

  async function onStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("staff");
    try {
      await api.createStaff({
        name: String(data.get("name")),
        title: String(data.get("title") || "Teacher"),
        email: String(data.get("email") || ""),
            classId: String(data.get("classId") || "") === "later" ? undefined : String(data.get("classId") || "") || undefined,
        subject: String(data.get("subject") || ""),
      });
      event.currentTarget.reset();
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function assign(staffId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(`assign-${staffId}`);
    try {
      await api.assignStaff(staffId, {
        classId: String(data.get("classId")),
        subject: String(data.get("subject") || ""),
      });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    setBusy("invite");
    try {
      const invite = await api.invite({
        email: String(data.get("email")),
        role: String(data.get("role")),
        name: String(data.get("name") || ""),
      });
      setInviteUrl(invite.acceptUrl);
      event.currentTarget.reset();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invite");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-4xl">Staff</h1>
      <div className="mt-8 grid grid-cols-2 gap-4">
        <form onSubmit={onStaff} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="font-display text-xl">Add teacher record</h2>
          <FieldGroup className="mt-4">
            <Field>
              <FieldLabel htmlFor="staff-name">Name</FieldLabel>
              <Input id="staff-name" name="name" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="staff-title">Title</FieldLabel>
              <Input id="staff-title" name="title" defaultValue="Teacher" />
            </Field>
            <Field>
              <FieldLabel htmlFor="staff-email">Login email</FieldLabel>
              <Input id="staff-email" name="email" type="email" />
            </Field>
            <Field>
              <FieldLabel htmlFor="staff-subject">Subject</FieldLabel>
              <Input id="staff-subject" name="subject" />
            </Field>
            <Field>
              <FieldLabel htmlFor="staff-class">Class</FieldLabel>
              <FormSelect
                id="staff-class"
                name="classId"
                placeholder="Assign class later"
                options={[{ value: "later", label: "Assign class later" }, ...classes.map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}` }))]}
              />
            </Field>
            <Button type="submit" loading={busy === "staff"} icon={<UserPlus data-icon="inline-start" />}>
              Save teacher
            </Button>
          </FieldGroup>
        </form>
        <form onSubmit={onInvite} className="rounded-xl bg-card p-6 ring-1 ring-foreground/10">
          <h2 className="font-display text-xl">Invite login</h2>
          <FieldGroup className="mt-4">
            <Field>
              <FieldLabel htmlFor="invite-name">Name</FieldLabel>
              <Input id="invite-name" name="name" />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-email">Email</FieldLabel>
              <Input id="invite-email" name="email" type="email" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="invite-role">Role</FieldLabel>
              <FormSelect
                id="invite-role"
                name="role"
                defaultValue="TEACHER"
                options={[
                  { value: "TEACHER", label: "Teacher" },
                  { value: "SCHOOL_ADMIN", label: "School admin" },
                ]}
              />
            </Field>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            {inviteUrl ? <p className="break-all text-sm text-primary">{inviteUrl}</p> : null}
            <Button type="submit" variant="secondary" loading={busy === "invite"} icon={<Mail data-icon="inline-start" />}>
              Create invite
            </Button>
          </FieldGroup>
        </form>
      </div>
      <div className="mt-6 space-y-3">
        {staffPending && !staff ? <LoadingState variant="list" /> : null}
        {(staff ?? []).map((person) => (
          <section key={person.id} className="rounded-3xl bg-surface p-6">
            <p className="font-medium">{person.name}</p>
            <p className="text-sm text-muted-foreground">
              {person.title} {person.email ? `· ${person.email}` : ""}
            </p>
            <p className="mt-2 text-sm">
              {person.assignments.map((a) => `${a.class.name} ${a.class.section}${a.subject ? ` (${a.subject})` : ""}`).join(", ") ||
                "No classes assigned"}
            </p>
            <form onSubmit={(e) => assign(person.id, e)} className="mt-3 flex gap-2">
              <FormSelect
                name="classId"
                options={classes.map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}` }))}
              />
              <Input name="subject" placeholder="Subject" />
              <Button type="submit" variant="outline" loading={busy === `assign-${person.id}`}>
                Assign
              </Button>
            </form>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">{invites.length} invite(s) sent.</p>
    </div>
  );
}
