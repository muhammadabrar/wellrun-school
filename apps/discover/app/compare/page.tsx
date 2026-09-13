import Link from "next/link";
import { Suspense } from "react";
import { t } from "@wellrun/i18n";
import { compareSchools, pkr } from "@/lib/api";
import { ComparePicker } from "./picker";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; c?: string }>;
}) {
  const { a, b, c } = await searchParams;
  const copy = t("en");
  const slugs = [a, b, c].filter(Boolean) as string[];
  const schools = slugs.length ? await compareSchools(slugs).catch(() => []) : [];

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pb-12">
      <header className="py-5">
        <Link href="/" className="text-sm text-indigo">
          Back to browse
        </Link>
        <h1 className="mt-3 font-serif text-3xl">{copy.discover.compareSchools}</h1>
        <Suspense>
          <ComparePicker />
        </Suspense>
      </header>

      {schools.length < 2 ? (
        <p className="text-muted">Add 2 or 3 schools from their profiles, then open Compare.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead>
              <tr>
                <th className="py-3 pr-3 font-medium text-muted"> </th>
                {schools.map((school) => (
                  <th key={school.id} className="py-3 pr-3 font-display text-base">
                    <Link href={`/schools/${school.slug}`}>{school.name}</Link>
                    <p className="font-sans text-xs font-normal text-muted">
                      {school.city}
                      {school.area ? ` · ${school.area}` : ""}
                    </p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top">
              <Row
                label={copy.discover.fees}
                values={schools.map((s) => `${pkr(s.profile.feeMinPkr)}–${pkr(s.profile.feeMaxPkr)}`)}
              />
              <Row label="Fee band" values={schools.map((s) => s.feeBand.replaceAll("_", " "))} />
              <Row label={copy.discover.students} values={schools.map((s) => String(s.profile.studentCount))} />
              <Row label={copy.discover.teachers} values={schools.map((s) => String(s.profile.teacherCount))} />
              <Row label={copy.discover.established} values={schools.map((s) => String(s.profile.establishedYear))} />
              <Row label={copy.discover.programs} values={schools.map((s) => s.profile.programs.join(", "))} />
              <Row label={copy.discover.facilities} values={schools.map((s) => s.profile.facilities.join(", "))} />
              <Row label={copy.discover.principal} values={schools.map((s) => s.profile.principal)} />
              <tr className="border-t border-line">
                <th className="py-3 pr-3 font-medium text-muted">WhatsApp</th>
                {schools.map((school) => (
                  <td key={school.id} className="py-3 pr-3">
                    {school.waUrl ? (
                      <a href={school.waUrl} className="text-indigo" target="_blank" rel="noreferrer">
                        Message
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

function Row({ label, values }: { label: string; values: string[] }) {
  return (
    <tr className="border-t border-line">
      <th className="py-3 pr-3 font-medium text-muted">{label}</th>
      {values.map((value, index) => (
        <td key={`${label}-${index}`} className="py-3 pr-3">
          {value}
        </td>
      ))}
    </tr>
  );
}
