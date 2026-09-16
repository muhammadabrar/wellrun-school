import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState, LoadingState, Skeleton } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormEvent, useState } from "react";
import { api, currentUser } from "../lib/api";
import { queryKeys } from "../lib/query";

export function AdminPage() {
  const user = currentUser();
  const queryClient = useQueryClient();
  const enabled = user?.role === "PLATFORM_ADMIN";
  const { data: schools, isPending: schoolsPending } = useQuery({
    queryKey: queryKeys.adminSchools,
    queryFn: api.adminSchools,
    enabled,
  });
  const { data: claims, isPending: claimsPending } = useQuery({
    queryKey: queryKeys.adminClaims,
    queryFn: api.adminClaims,
    enabled,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.adminSchools }),
      queryClient.invalidateQueries({ queryKey: queryKeys.adminClaims }),
    ]);
  }

  if (user?.role !== "PLATFORM_ADMIN") {
    return <p className="text-muted-foreground">Platform admin only.</p>;
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy("create");
    try {
      await api.createSchool({
        name: String(data.get("name")),
        slug: String(data.get("slug")),
        city: String(data.get("city")),
        area: String(data.get("area")),
        published: true,
      });
      event.currentTarget.reset();
      await reload();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <h1 className="font-display text-4xl">Platform</h1>
      <section className="mt-8 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Claim queue</h2>
        {claimsPending && !claims ? <LoadingState variant="list" /> : null}
        {!claimsPending && !claims?.length ? (
          <EmptyState title="No claims yet" description="School staff claims will show here for review." />
        ) : null}
        <ul className="mt-4 space-y-3">
          {(claims ?? []).map((claim) => (
            <li key={claim.id} className="rounded-2xl bg-paper p-4">
              <p className="font-medium">
                {claim.school.name} · {claim.status}
              </p>
              <p className="text-sm text-muted-foreground">
                {claim.user.name} ({claim.user.email}) · {claim.roleAtSchool} · {claim.whatsapp}
              </p>
              {claim.status === "PENDING" ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    loading={busy === `approve-${claim.id}`}
                    onClick={() => {
                      setBusy(`approve-${claim.id}`);
                      void api
                        .approveClaim(claim.id)
                        .then(() => reload())
                        .finally(() => setBusy(null));
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    loading={busy === `reject-${claim.id}`}
                    onClick={() => {
                      const reason = window.prompt("Rejection reason");
                      if (!reason) return;
                      setBusy(`reject-${claim.id}`);
                      void api
                        .rejectClaim(claim.id, reason)
                        .then(() => reload())
                        .catch((err) => setError(err.message))
                        .finally(() => setBusy(null));
                    }}
                  >
                    Reject
                  </Button>
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
          <Input name="name" required placeholder="School name" />
          <Input name="slug" required placeholder="slug" />
          <Input name="city" required placeholder="City" />
          <Input name="area" placeholder="Area" />
          <Button type="submit" className="col-span-4" loading={busy === "create"}>
            Add unpublished school
          </Button>
        </form>
        <ul className="mt-4 text-sm">
          {schoolsPending && !schools
            ? Array.from({ length: 4 }, (_, i) => (
                <li key={i} className="border-t border-line py-3">
                  <Skeleton className="h-6 w-2/3" />
                </li>
              ))
            : null}
          {(schools ?? []).map((school) => (
            <li key={school.id} className="flex justify-between border-t border-line py-3">
              <span>
                {school.name} · {school.city} {school.area}
              </span>
              <span className="text-muted-foreground">
                {school.claimStatus} {school.published ? "" : "· hidden"}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
