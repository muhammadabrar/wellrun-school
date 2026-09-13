"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readCompare } from "@/components/compare-tray";

export function ComparePicker() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    if (params.get("a") && params.get("b")) return;
    const stored = readCompare();
    const a = params.get("a") ?? stored[0];
    const b = params.get("b") ?? stored.find((s) => s !== a);
    const c = params.get("c") ?? stored.find((s) => s !== a && s !== b);
    if (a && b) {
      const qs = [`a=${a}`, `b=${b}`, c ? `c=${c}` : ""].filter(Boolean).join("&");
      router.replace(`/compare?${qs}`);
    }
  }, [params, router]);

  return null;
}
