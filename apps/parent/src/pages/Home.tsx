import { fmt } from "@wellrun/i18n";
import { ChevronLeft } from "lucide-react";
import { Link, Navigate } from "react-router-dom";
import { Avatar, Empty, ErrorBox, Loading, Screen } from "@/components/ui";
import { mediaUrl } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { useMe } from "@/lib/queries";

/** One child goes straight to their page. Several children (maybe in different schools) get a list. */
export function HomePage() {
  const { m } = useLocale();
  const { data, isPending, isError, error, refetch } = useMe();

  if (data?.children.length === 1) return <Navigate to={`/child/${data.children[0]!.id}`} replace />;

  return (
    <Screen title={data?.children.length ? m.home.yourChildren : m.common.moreTitle} more>
      {isPending ? (
        <Loading />
      ) : isError ? (
        <ErrorBox error={error} onRetry={() => void refetch()} />
      ) : !data.children.length ? (
        <Empty title={m.home.noChildren} help={m.home.noChildrenHelp} />
      ) : (
        <>
          <p className="text-lg text-muted">{m.home.chooseChild}</p>
          <ul className="space-y-3">
            {data.children.map((child) => (
              <li key={child.id}>
                <Link to={`/child/${child.id}`} className="flex items-center gap-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-line active:bg-paper">
                  <Avatar name={child.firstName} photo={mediaUrl(child.photoUrl)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xl font-semibold">{child.name}</p>
                    {child.classLabel ? <p className="text-base text-muted">{fmt(m.home.classLabel, { class: child.classLabel })}</p> : null}
                    <p className="truncate text-base font-semibold text-indigo">{child.school.name}</p>
                  </div>
                  <ChevronLeft className="size-6 shrink-0 rotate-180 text-muted rtl:rotate-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Screen>
  );
}
