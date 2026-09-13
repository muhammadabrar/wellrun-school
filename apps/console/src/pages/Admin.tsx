import { FormEvent, useEffect, useState } from "react";
import { api, currentUser, type AdminClaim, type AdminSchool } from "../lib/api";

export function AdminPage() {
  const user = currentUser();
  const [schools, setSchools] = useState<AdminSchool[]>([]);
  const [claims, setClaims] = useState<AdminClaim[]>([]);
  const [error, setError] = useState<string | null>(null);

  function load() {
    api.adminSchools().then(setSchools);
    api.adminClaims().then(setClaims);
  }

  useEffect(() => {
    if (user?.role === "PLATFORM_ADMIN") load();
  }, [user?.role]);

  if (user?.role !== "PLATFORM_ADMIN") {
    return <p className="text-muted">Platform admin only.</p>;
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await api.createSchool({
      name: String(data.get("name")),
      slug: String(data.get("slug")),
      city: String(data.get("city")),
      area: String(data.get("area")),
      published: true,
    });
    event.currentTarget.reset();
    load();
  }

  return (
    <div>
      <h1 className="font-display text-4xl">Platform</h1>
      <section className="mt-8 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Claim queue</h2>
        {claims.length === 0 ? <p className="mt-3 text-muted">No claims yet.</p> : null}
        <ul className="mt-4 space-y-3">
          {claims.map((claim) => (
            <li key={claim.id} className="rounded-2xl bg-paper p-4">
              <p className="font-medium">
                {claim.school.name} · {claim.status}
              </p>
              <p className="text-sm text-muted">
                {claim.user.name} ({claim.user.email}) · {claim.roleAtSchool} · {claim.whatsapp}
              </p>
              {claim.status === "PENDING" ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    className="h-10 rounded-xl bg-indigo px-3 text-white"
                    onClick={() => api.approveClaim(claim.id).then(load)}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    className="h-10 rounded-xl bg-danger px-3 text-white"
                    onClick={() => {
                      const reason = window.prompt("Rejection reason");
                      if (reason) api.rejectClaim(claim.id, reason).then(load).catch((err) => setError(err.message));
                    }}
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      </section>

      <section className="mt-6 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Schools</h2>
        <form onSubmit={onCreate} className="mt-4 grid grid-cols-4 gap-2">
          <input name="name" required placeholder="School name" className="h-11 rounded-xl border border-line px-3" />
          <input name="slug" required placeholder="slug" className="h-11 rounded-xl border border-line px-3" />
          <input name="city" required placeholder="City" className="h-11 rounded-xl border border-line px-3" />
          <input name="area" placeholder="Area" className="h-11 rounded-xl border border-line px-3" />
          <button type="submit" className="col-span-4 h-11 rounded-xl bg-indigo text-white">
            Add unpublished school
          </button>
        </form>
        <ul className="mt-4 text-sm">
          {schools.map((school) => (
            <li key={school.id} className="flex justify-between border-t border-line py-3">
              <span>
                {school.name} · {school.city} {school.area}
              </span>
              <span className="text-muted">
                {school.claimStatus} {school.published ? "" : "· hidden"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
