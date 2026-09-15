"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BrandLogo } from "@wellrun/ui";
import { client, getSession, setSession, type SessionUser } from "@/lib/client";

export function DiscoverNav() {
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    setUser(getSession()?.user ?? null);
  }, []);

  return (
    <div className="flex items-center justify-between text-sm">
      <Link href="/" className="inline-flex items-center" aria-label="WellRun School home">
        <BrandLogo />
      </Link>
      <div className="flex items-center gap-3">
        <Link href="/compare" className="text-muted">
          Compare
        </Link>
        {user ? (
          <>
            <span className="text-muted">{user.name.split(" ")[0]}</span>
            <button
              type="button"
              className="text-indigo"
              onClick={async () => {
                await client.logout().catch(() => undefined);
                setSession(null);
                setUser(null);
              }}
            >
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link href="/login">Sign in</Link>
            <Link href="/signup" className="rounded-full bg-indigo px-3 py-1.5 text-white">
              Sign up
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
