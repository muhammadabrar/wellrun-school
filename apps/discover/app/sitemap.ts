import type { MetadataRoute } from "next";
import { listSchools } from "@/lib/api";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = "http://localhost:3001";
  let schools: Awaited<ReturnType<typeof listSchools>> = [];
  try {
    schools = await listSchools();
  } catch {
    schools = [];
  }
  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/compare`, changeFrequency: "weekly", priority: 0.4 },
    ...schools.map((school) => ({
      url: `${base}/schools/${school.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
