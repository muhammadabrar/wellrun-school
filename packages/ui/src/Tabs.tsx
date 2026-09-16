import type { ReactNode } from "react";
import { cx } from "./cx";

export function Tabs({
  value,
  onChange,
  items,
}: {
  value: string;
  onChange: (id: string) => void;
  items: { id: string; label: string }[];
}) {
  return (
    <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-lg bg-paper p-1">
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={cx(
              "h-8 rounded-md px-2.5 text-sm font-medium",
              selected ? "bg-surface text-ink shadow-sm" : "text-muted-foreground hover:text-ink",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({
  when,
  active,
  children,
}: {
  when: string;
  active: string;
  children: ReactNode;
}) {
  if (when !== active) return null;
  return <div role="tabpanel">{children}</div>;
}
