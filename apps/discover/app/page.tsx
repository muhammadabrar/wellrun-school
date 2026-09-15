import Link from "next/link";
import { t } from "@wellrun/i18n";
import { Button } from "@wellrun/ui";
import { CompareTray } from "@/components/compare-tray";
import { DiscoverNav } from "@/components/nav";
import { FEE_BANDS, SCHOOL_TYPES, avgRating, coverOf, getTaxonomy, listSchools, pkr } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string; area?: string; type?: string; fee?: string; facility?: string }>;
}) {
  const query = await searchParams;
  const copy = t("en");
  let schools: Awaited<ReturnType<typeof listSchools>> = [];
  let taxonomy: Awaited<ReturnType<typeof getTaxonomy>> = [];
  let offline = false;
  try {
    [schools, taxonomy] = await Promise.all([listSchools(query), getTaxonomy()]);
  } catch {
    offline = true;
  }
  const areas = taxonomy.find((row) => row.city === query.city)?.areas ?? [];

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-24">
      <header className="sticky top-0 z-10 -mx-4 mb-5 bg-paper/90 px-4 py-4 backdrop-blur">
        <DiscoverNav />
        <h1 className="mt-4 font-serif text-[2rem] leading-tight">{copy.discover.tagline}</h1>
        <form method="get" className="mt-4 grid gap-2">
          <div className="flex gap-2">
            <input
              id="q"
              name="q"
              defaultValue={query.q}
              placeholder={copy.discover.searchPlaceholder}
              className="h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface px-4 text-base"
            />
            <Button type="submit" size="lg" className="rounded-2xl">
              Search
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select name="city" defaultValue={query.city ?? ""} className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm">
              <option value="">All cities</option>
              {taxonomy.map((row) => (
                <option key={row.city} value={row.city}>
                  {row.city}
                </option>
              ))}
            </select>
            <select name="area" defaultValue={query.area ?? ""} className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm">
              <option value="">All areas</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
            <select name="type" defaultValue={query.type ?? ""} className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm">
              <option value="">Any type</option>
              {SCHOOL_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
            <select name="fee" defaultValue={query.fee ?? ""} className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm">
              <option value="">Any fee</option>
              {FEE_BANDS.map((band) => (
                <option key={band.id} value={band.id}>
                  {band.label}
                </option>
              ))}
            </select>
          </div>
        </form>
      </header>

      {offline ? (
        <p className="rounded-2xl bg-surface p-5 text-muted">
          Discovery API is offline. Start the Nest server on port 3000.
        </p>
      ) : schools.length === 0 ? (
        <p className="text-muted">{copy.discover.empty}</p>
      ) : (
        <ul className="space-y-4">
          {schools.map((school) => {
            const cover = coverOf(school);
            const rating = avgRating(school.reviews);
            return (
              <li key={school.id}>
                <Link
                  href={`/schools/${school.slug}`}
                  className="block overflow-hidden rounded-[20px] bg-surface shadow-[0_12px_40px_rgba(22,22,29,0.08)]"
                >
                  <div
                    className="h-44 bg-cover bg-center"
                    style={{ backgroundImage: cover ? `url(${cover})` : undefined }}
                  />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h2 className="font-display text-lg font-semibold">{school.name}</h2>
                        <p className="text-sm text-muted">
                          {school.city}
                          {school.area ? ` · ${school.area}` : ""}
                        </p>
                      </div>
                      {rating ? (
                        <span className="rounded-full bg-paper px-2.5 py-1 text-sm font-medium">
                          {rating.toFixed(1)}
                        </span>
                      ) : null}
                    </div>
                    {school.profile ? (
                      <p className="mt-3 text-sm text-muted">
                        {pkr(school.profile.feeMinPkr)}–{pkr(school.profile.feeMaxPkr)} / month
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <CompareTray />
    </main>
  );
}
