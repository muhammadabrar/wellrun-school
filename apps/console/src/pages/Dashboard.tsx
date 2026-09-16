import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { t } from "@wellrun/i18n";
import { ErrorState, FetchingIndicator, LoadingState } from "@wellrun/ui";
import { NumberPop } from "../components/motion";
import { api, currentUser } from "../lib/api";
import { queryKeys } from "../lib/query";

export function DashboardPage() {
  const copy = t("en");
  const user = currentUser();
  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: api.dashboard,
    enabled: user?.role !== "PLATFORM_ADMIN",
  });

  if (user?.role === "PLATFORM_ADMIN") return <Navigate to="/admin" replace />;

  if (isPending && !data) return <LoadingState variant="metrics" />;
  if (isError || !data) {
    return (
      <ErrorState
        title="Could not load dashboard"
        description="Try again. The school totals will show once the request succeeds."
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">{data.schoolName}</p>
      <h1 className="mt-1 font-display text-4xl">{copy.console.dashboard}</h1>
      <FetchingIndicator show={isFetching && !isPending} label="Updating totals" />
      <div className="mt-8 grid grid-cols-3 gap-4">
        <Card label={copy.console.absences}>
          <NumberPop value={data.absentToday} />
        </Card>
        <Card label={copy.console.collected}>
          Rs. <NumberPop value={data.collected} />
        </Card>
        <Card label={copy.console.outstanding}>
          Rs. <NumberPop value={data.outstanding} />
        </Card>
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        {data.invoiceCount} fee invoices this term. Open Fees to record a payment and print a receipt.
      </p>
    </div>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-surface p-6 shadow-[0_12px_40px_rgba(22,22,29,0.06)]">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-3 font-display text-3xl">{children}</p>
    </div>
  );
}
