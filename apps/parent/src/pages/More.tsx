import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fmt } from "@wellrun/i18n";
import { LogOut } from "lucide-react";
import { BigButton, Card, ErrorBox, Loading, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { keys, useMe } from "@/lib/queries";
import { useSignOut } from "@/lib/session";

export function MorePage() {
  const { m, locale, setLocale } = useLocale();
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const me = useMe();
  const devices = useQuery({ queryKey: keys.devices, queryFn: api.devices });
  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeDevice(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.devices }),
  });

  return (
    <Screen title={m.more.title} back="/" more={false}>
      <Card>
        <p className="text-lg font-semibold">{m.more.language}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {(["en", "ur"] as const).map((code) => (
            <button
              key={code}
              type="button"
              aria-pressed={locale === code}
              onClick={() => setLocale(code)}
              className={`min-h-16 rounded-2xl text-xl font-semibold ${locale === code ? "bg-indigo text-white" : "bg-paper text-ink ring-1 ring-line"}`}
            >
              {m.languageNames[code]}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <p className="text-lg font-semibold">{m.more.devices}</p>
        {devices.isPending ? (
          <div className="mt-3">
            <Loading />
          </div>
        ) : devices.isError ? (
          <div className="mt-3">
            <ErrorBox error={devices.error} onRetry={() => void devices.refetch()} />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {devices.data.map((device) => (
              <li key={device.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p dir="auto" className="truncate text-lg font-semibold">
                    {device.current ? m.more.thisDevice : device.label}
                  </p>
                  <p className="text-base text-muted">{fmt(m.more.lastUsed, { date: formatDateTime(device.lastSeenAt, locale) })}</p>
                </div>
                {device.current ? null : (
                  <button type="button" disabled={revoke.isPending} onClick={() => revoke.mutate(device.id)} className="min-h-12 shrink-0 rounded-2xl px-4 text-lg font-semibold text-danger ring-1 ring-danger/30 active:bg-danger/10">
                    {m.more.signOutDevice}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {me.data ? <p className="ltr-num text-center text-base text-muted">{me.data.parent.phone}</p> : null}
      <BigButton tone="light" onClick={() => void signOut()}>
        <LogOut className="size-5 rtl:-scale-x-100" aria-hidden /> {m.common.signOut}
      </BigButton>
    </Screen>
  );
}
