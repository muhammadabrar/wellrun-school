import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { t } from "@wellrun/i18n";
import { ClaimForm } from "@/components/claim-form";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { avgRating, coverOf, getSchool, logoOf, pkr } from "@/lib/api";
import { CompareButton } from "./compare-button";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  try {
    const { slug } = await params;
    const school = await getSchool(slug);
    return {
      title: school.name,
      description: school.profile?.about,
      openGraph: {
        title: school.name,
        description: school.profile?.about,
        images: coverOf(school) ? [{ url: coverOf(school)! }] : undefined,
      },
    };
  } catch {
    return { title: "School" };
  }
}

export default async function SchoolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const copy = t("en");
  let school: Awaited<ReturnType<typeof getSchool>>;
  try {
    school = await getSchool(slug);
  } catch {
    notFound();
  }

  const cover = coverOf(school);
  const logo = logoOf(school);
  const rating = avgRating(school.reviews);
  const photos = school.media.filter((m) => m.kind === "PHOTO");

  return (
    <article className="mx-auto min-h-dvh max-w-lg pb-28">
      <div className="relative h-64 bg-ink">
        {cover ? (
          <Image src={cover} alt="" fill priority className="object-cover" sizes="100vw" />
        ) : null}
        <Link
          href="/"
          className="absolute top-4 left-4 rounded-full bg-surface/90 px-3 py-1.5 text-sm font-medium"
        >
          Back
        </Link>
      </div>

      <div className="-mt-8 rounded-t-[28px] bg-paper px-4 pt-6">
        <div className="flex items-end gap-3">
          {logo ? (
            <Image
              src={logo}
              alt=""
              width={72}
              height={72}
              className="h-18 w-18 rounded-2xl border-4 border-paper object-cover"
            />
          ) : null}
          <div className="pb-1">
            <h1 className="font-display text-2xl font-semibold">{school.name}</h1>
            <p className="text-muted">
              {school.city}
              {school.area ? ` · ${school.area}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-center">
          <Stat label={copy.discover.established} value={String(school.profile.establishedYear)} />
          <Stat label={copy.discover.students} value={String(school.profile.studentCount)} />
          <Stat label={copy.discover.teachers} value={String(school.profile.teacherCount)} />
        </div>

        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">{copy.discover.about}</h2>
          <p className="mt-2 leading-relaxed text-muted">{school.profile.about}</p>
          <p className="mt-3 text-sm">
            <span className="text-muted">{copy.discover.principal}: </span>
            {school.profile.principal}
          </p>
          <p className="mt-1 text-sm">
            <span className="text-muted">{copy.discover.location}: </span>
            {school.profile.location}
          </p>
        </section>

        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">{copy.discover.fees}</h2>
          <p className="mt-2 text-xl font-semibold">
            {pkr(school.profile.feeMinPkr)} – {pkr(school.profile.feeMaxPkr)}
          </p>
          <p className="mt-1 text-sm text-muted">{school.profile.feeNotes}</p>
        </section>

        <ChipSection title={copy.discover.facilities} items={school.profile.facilities} />
        <ChipSection title={copy.discover.labs} items={school.profile.labs} />
        <ChipSection title={copy.discover.sports} items={school.profile.sports} />
        <ChipSection title={copy.discover.programs} items={school.profile.programs} />

        {photos.length ? (
          <section className="mt-8">
            <h2 className="font-display text-lg font-semibold">Campus</h2>
            <div className="mt-3 flex gap-3 overflow-x-auto pb-2">
              {photos.map((photo) => (
                <Image
                  key={photo.url}
                  src={photo.url}
                  alt={photo.caption ?? ""}
                  width={220}
                  height={150}
                  className="h-36 w-52 shrink-0 rounded-2xl object-cover"
                />
              ))}
            </div>
          </section>
        ) : null}

        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">{copy.discover.reviews}</h2>
          {rating ? <p className="mt-1 text-sm text-muted">{rating.toFixed(1)} average</p> : null}
          <ul className="mt-3 space-y-3">
            {school.reviews.map((review) => (
              <li key={review.id} className="rounded-2xl bg-surface p-4">
                <p className="font-medium">
                  {review.author}{" "}
                  <span className="font-normal text-muted">· {review.roleLabel}</span>
                </p>
                <p className="mt-2 text-sm leading-relaxed">{review.body}</p>
              </li>
            ))}
          </ul>
        </section>

        <ClaimForm slug={school.slug} claimed={school.claimed} />

        <section className="mt-8 mb-4">
          <h2 className="font-display text-lg font-semibold">{copy.discover.posts}</h2>
          <ul className="mt-3 space-y-3">
            {school.posts.map((post) => (
              <li key={post.id} className="rounded-2xl bg-surface p-4">
                <h3 className="font-medium">{post.title}</h3>
                <p className="mt-1 text-sm text-muted">{post.body}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="fixed inset-x-0 bottom-0 mx-auto flex max-w-lg gap-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <CompareButton slug={school.slug} name={school.name} />
        {school.waUrl ? (
          <WhatsAppButton href={school.waUrl} digits={school.waDigits} />
        ) : (
          <Link
            href={`/compare?a=${school.slug}`}
            className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-indigo font-medium text-white"
          >
            {copy.discover.compare}
          </Link>
        )}
      </div>
    </article>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface px-2 py-3">
      <p className="font-display text-lg font-semibold">{value}</p>
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
    </div>
  );
}

function ChipSection({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item} className="rounded-full bg-surface px-3 py-1.5 text-sm">
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
