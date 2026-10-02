import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { Card, Chip, Empty, ErrorBox, Loading, Screen } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useLocale } from "@/lib/i18n";
import { keys, useChild } from "@/lib/queries";

export function NoticesPage() {
  const { id = "" } = useParams();
  const { m, locale } = useLocale();
  const { child } = useChild(id);
  const { data, isPending, isError, error, refetch } = useQuery({ queryKey: keys.notices(id), queryFn: () => api.notices(id) });

  return (
    <Screen title={child ? `${child.firstName} · ${m.notices.title}` : m.notices.title} back={`/child/${id}`}>
      {isPending ? (
        <Loading />
      ) : isError || !data ? (
        <ErrorBox error={error} onRetry={() => void refetch()} />
      ) : !data.length ? (
        <Empty title={m.notices.none} />
      ) : (
        <ul className="space-y-4">
          {data.map((notice) => (
            <li key={notice.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  {notice.pinned ? <Chip tone="orange">{m.notices.pinned}</Chip> : null}
                  <span className="text-base text-muted">{formatDate(notice.publishedAt, locale)}</span>
                </div>
                <h2 dir="auto" className="mt-2 text-xl font-semibold">
                  {notice.title}
                </h2>
                <p dir="auto" className="mt-2 whitespace-pre-wrap text-lg">
                  {notice.body}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
