"use client";

import { useEffect, useState } from "react";
import { t } from "@wellrun/i18n";
import { readCompare, writeCompare } from "@/components/compare-tray";

export function CompareButton({ slug, name }: { slug: string; name: string }) {
  const copy = t("en");
  const [selected, setSelected] = useState(false);

  useEffect(() => {
    setSelected(readCompare().includes(slug));
  }, [slug]);

  function toggle() {
    const list = readCompare();
    const next = list.includes(slug) ? list.filter((s) => s !== slug) : [...list.filter((s) => s !== slug), slug].slice(-3);
    writeCompare(next);
    setSelected(next.includes(slug));
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="h-12 flex-1 rounded-2xl border border-line bg-paper font-medium"
      aria-pressed={selected}
    >
      {selected ? copy.discover.removeCompare : copy.discover.addToCompare}
      <span className="sr-only"> {name}</span>
    </button>
  );
}
