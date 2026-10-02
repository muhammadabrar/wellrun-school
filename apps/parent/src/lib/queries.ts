import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "./api";
import type { ParentMessages } from "./i18n";

export const keys = {
  me: ["me"] as const,
  devices: ["devices"] as const,
  summary: (id: string) => ["child", id, "summary"] as const,
  attendance: (id: string, month: string) => ["child", id, "attendance", month] as const,
  diary: (id: string, date: string) => ["child", id, "diary", date] as const,
  fees: (id: string) => ["child", id, "fees"] as const,
  results: (id: string) => ["child", id, "results"] as const,
  timetable: (id: string) => ["child", id, "timetable"] as const,
  notices: (id: string) => ["child", id, "notices"] as const,
};

export function useMe() {
  return useQuery({ queryKey: keys.me, queryFn: api.me, staleTime: 60_000 });
}

/** One child, from the list the app already loaded: no second request just to show a name. */
export function useChild(id: string | undefined) {
  const me = useMe();
  return { ...me, child: me.data?.children.find((c) => c.id === id) };
}

/** Plain words for a failure. The server's English is never shown, so the message follows the chosen language. */
export function errorText(m: ParentMessages, error: unknown) {
  return error instanceof ApiError && error.status === 0 ? m.common.offline : m.common.wrong;
}
