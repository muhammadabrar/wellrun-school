const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export type SchoolListItem = {
  id: string;
  slug: string;
  name: string;
  city: string;
  area: string;
  type: string;
  feeBand: string;
  claimed: boolean;
  waUrl: string | null;
  waDigits: string;
  profile: {
    about: string;
    location: string;
    principal: string;
    establishedYear: number;
    studentCount: number;
    teacherCount: number;
    facilities: string[];
    feeMinPkr: number;
    feeMaxPkr: number;
  } | null;
  media: { kind: string; url: string; caption: string | null }[];
  reviews: { rating: number }[];
};

export type SchoolDetail = SchoolListItem & {
  profile: NonNullable<SchoolListItem["profile"]> & {
    labs: string[];
    sports: string[];
    activities: string[];
    programs: string[];
    feeNotes: string;
  };
  posts: { id: string; title: string; body: string; createdAt: string }[];
  reviews: { id: string; author: string; roleLabel: string; rating: number; body: string }[];
};

export type SchoolQuery = {
  q?: string;
  city?: string;
  area?: string;
  type?: string;
  fee?: string;
  facility?: string;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`API ${path} failed`);
  return res.json();
}

export function listSchools(query: SchoolQuery = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return get<SchoolListItem[]>(`/schools${qs ? `?${qs}` : ""}`);
}

export function getSchool(slug: string) {
  return get<SchoolDetail>(`/schools/${slug}`);
}

export function compareSchools(slugs: string[]) {
  return get<SchoolDetail[]>(`/schools/compare?slugs=${slugs.join(",")}`);
}

export function getTaxonomy() {
  return get<{ city: string; areas: string[] }[]>("/schools/meta/taxonomy");
}

export function coverOf(school: { media: { kind: string; url: string }[] }) {
  return school.media.find((m) => m.kind === "COVER")?.url;
}

export function logoOf(school: { media: { kind: string; url: string }[] }) {
  return school.media.find((m) => m.kind === "LOGO")?.url;
}

export function avgRating(reviews: { rating: number }[]) {
  if (!reviews.length) return null;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

export function pkr(amount: number) {
  return `Rs. ${amount.toLocaleString("en-PK")}`;
}

export const FEE_BANDS = [
  { id: "under_5k", label: "Under 5k" },
  { id: "5k_10k", label: "5–10k" },
  { id: "10k_20k", label: "10–20k" },
  { id: "20k_40k", label: "20–40k" },
  { id: "40k_80k", label: "40–80k" },
  { id: "80k_plus", label: "80k+" },
];

export const SCHOOL_TYPES = [
  { id: "private", label: "Private" },
  { id: "public", label: "Public" },
  { id: "trust", label: "Trust" },
  { id: "semi_government", label: "Semi-gov" },
];
