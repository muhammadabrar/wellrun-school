"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const KEY = "wellrun-compare";

export function readCompare() {
  return JSON.parse(localStorage.getItem(KEY) ?? "[]") as string[];
}

export function writeCompare(slugs: string[]) {
  localStorage.setItem(KEY, JSON.stringify(slugs.slice(0, 3)));
  window.dispatchEvent(new Event("wellrun-compare"));
}

export function CompareTray() {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setSlugs(readCompare());
    sync();
    window.addEventListener("wellrun-compare", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("wellrun-compare", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!slugs.length) return null;
  const qs = slugs.map((slug, i) => `${["a", "b", "c"][i]}=${slug}`).join("&");

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-lg items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur">
      <p className="text-sm">{slugs.length} of 3 in compare</p>
      <Link href={`/compare?${qs}`} className="h-10 rounded-xl bg-indigo px-4 text-sm font-medium leading-10 text-white">
        Compare now
      </Link>
    </div>
  );
}
