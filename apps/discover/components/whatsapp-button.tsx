"use client";

import { useState } from "react";

export function WhatsAppButton({ href, digits }: { href: string; digits?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-1 gap-2">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-indigo font-medium text-white"
      >
        WhatsApp
      </a>
      {digits ? (
        <button
          type="button"
          className="h-12 rounded-2xl border border-line bg-paper px-3 text-sm"
          onClick={async () => {
            await navigator.clipboard.writeText(digits);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      ) : null}
    </div>
  );
}
