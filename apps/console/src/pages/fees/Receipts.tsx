import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";

export function FeeReceiptsPage() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: queryKeys.feeReceipts, queryFn: api.feeReceipts });
  if (isPending && !data) return <LoadingState variant="table" />;
  if (isError) return <ErrorState title="Could not load receipts" description="Try again." onRetry={() => void refetch()} />;
  return (
    <div className="space-y-6">
      <PageHeader title="Receipts" description="Every receipt belongs to a payment, not an invoice." />
      {!data?.length ? (
        <EmptyState title="No receipts yet" description="Receipts appear after you collect a payment." />
      ) : (
        <ul className="space-y-3">
          {data.map((row) => (
            <li key={row.id} className="flex items-center justify-between rounded-2xl bg-surface px-5 py-4">
              <div>
                <Link to={`/fees/receipt/${row.payment.id}`} className="font-medium text-indigo">
                  {row.receiptNumber}
                </Link>
                <p className="text-sm text-muted-foreground">
                  {row.student ? `${row.student.firstName} ${row.student.lastName}` : "Student"} · {row.payment.method}
                </p>
              </div>
              <p>{pkr(row.amountPkr)}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
