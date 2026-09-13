import { FormEvent, useEffect, useState } from "react";
import { api, type Invite, type SchoolClass, type Staff } from "../lib/api";

export function TeachersPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.staff().then(setStaff);
    api.classes().then(setClasses);
    api.invites().then(setInvites);
  }

  useEffect(() => {
    load();
  }, []);

  async function onStaff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await api.createStaff({
      name: String(data.get("name")),
      title: String(data.get("title") || "Teacher"),
      email: String(data.get("email") || ""),
      classId: String(data.get("classId") || "") || undefined,
      subject: String(data.get("subject") || ""),
    });
    event.currentTarget.reset();
    load();
  }

  async function assign(staffId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await api.assignStaff(staffId, {
      classId: String(data.get("classId")),
      subject: String(data.get("subject") || ""),
    });
    load();
  }

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    try {
      const invite = await api.invite({
        email: String(data.get("email")),
        role: String(data.get("role")),
        name: String(data.get("name") || ""),
      });
      setInviteUrl(invite.acceptUrl);
      event.currentTarget.reset();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not invite");
    }
  }

  return (
    <div>
      <h1 className="font-display text-4xl">Staff</h1>
      <div className="mt-8 grid grid-cols-2 gap-4">
        <form onSubmit={onStaff} className="rounded-3xl bg-surface p-6">
          <h2 className="font-display text-xl">Add teacher record</h2>
          <input name="name" required placeholder="Name" className="mt-4 h-11 w-full rounded-xl border border-line px-3" />
          <input name="title" placeholder="Title" defaultValue="Teacher" className="mt-3 h-11 w-full rounded-xl border border-line px-3" />
          <input name="email" type="email" placeholder="Login email" className="mt-3 h-11 w-full rounded-xl border border-line px-3" />
          <input name="subject" placeholder="Subject" className="mt-3 h-11 w-full rounded-xl border border-line px-3" />
          <select name="classId" className="mt-3 h-11 w-full rounded-xl border border-line px-3">
            <option value="">Assign class later</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name} {cls.section}
              </option>
            ))}
          </select>
          <button type="submit" className="mt-4 h-11 rounded-xl bg-indigo px-4 text-white">
            Save teacher
          </button>
        </form>
        <form onSubmit={onInvite} className="rounded-3xl bg-surface p-6">
          <h2 className="font-display text-xl">Invite login</h2>
          <input name="name" placeholder="Name" className="mt-4 h-11 w-full rounded-xl border border-line px-3" />
          <input name="email" type="email" required placeholder="Email" className="mt-3 h-11 w-full rounded-xl border border-line px-3" />
          <select name="role" className="mt-3 h-11 w-full rounded-xl border border-line px-3">
            <option value="TEACHER">Teacher</option>
            <option value="SCHOOL_ADMIN">School admin</option>
          </select>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          {inviteUrl ? (
            <p className="mt-3 break-all text-sm text-indigo">{inviteUrl}</p>
          ) : null}
          <button type="submit" className="mt-4 h-11 rounded-xl bg-ink px-4 text-white">
            Create invite
          </button>
        </form>
      </div>
      <div className="mt-6 space-y-3">
        {staff.map((person) => (
          <section key={person.id} className="rounded-3xl bg-surface p-6">
            <p className="font-medium">{person.name}</p>
            <p className="text-sm text-muted">
              {person.title} {person.email ? `· ${person.email}` : ""}
            </p>
            <p className="mt-2 text-sm">
              {person.assignments.map((a) => `${a.class.name} ${a.class.section}${a.subject ? ` (${a.subject})` : ""}`).join(", ") ||
                "No classes assigned"}
            </p>
            <form onSubmit={(e) => assign(person.id, e)} className="mt-3 flex gap-2">
              <select name="classId" className="h-11 rounded-xl border border-line px-3">
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} {cls.section}
                  </option>
                ))}
              </select>
              <input name="subject" placeholder="Subject" className="h-11 rounded-xl border border-line px-3" />
              <button type="submit" className="h-11 rounded-xl bg-paper px-4">
                Assign
              </button>
            </form>
          </section>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted">{invites.length} invite(s) sent.</p>
    </div>
  );
}
