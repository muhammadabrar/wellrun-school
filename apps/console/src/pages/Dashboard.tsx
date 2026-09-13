import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { t } from "@wellrun/i18n";
import { api, currentUser } from "../lib/api";
import { NumberPop } from "../components/motion";

export function DashboardPage() {
  const copy = t("en");
  const user = currentUser();
  const [data, setData] = useState<Awaited<ReturnType<typeof api.dashboard>> | null>(null);

  useEffect(() => {
    if (user?.role === "PLATFORM_ADMIN") return;
    api.dashboard().then(setData).catch(() => setData(null));
  }, [user?.role]);

  if (user?.role === "PLATFORM_ADMIN") return <Navigate to="/admin" replace />;

  if (!data) {
    return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;
  }

  return (
    <div>
      <p className="text-sm text-muted">{data.schoolName}</p>
      <h1 className="mt-1 font-display text-4xl">{copy.console.dashboard}</h1>
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
      <p className="mt-6 text-sm text-muted">
        {data.invoiceCount} fee invoices this term. Open Fees to record a payment and print a receipt.
      </p>
    </div>
  );
}

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-3xl bg-surface p-6 shadow-[0_12px_40px_rgba(22,22,29,0.06)]">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-3 font-display text-3xl">{children}</p>
    </div>
  );
}
