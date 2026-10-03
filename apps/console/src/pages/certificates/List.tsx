import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CERTIFICATE_LABEL, CERTIFICATE_TYPES, type CertificateType } from "@wellrun/shared";
import { Badge, Dialog, EmptyState, ErrorState, FetchingIndicator, LoadingState, PageHeader, Pagination } from "@wellrun/ui";
import { FileText, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { FormSelect } from "@/components/form/form-select";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { certificatesApi, documentKeys, type CertificateView } from "@/lib/documents-api";
import { useClampPage } from "@/lib/paging";

const ALL = "all";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDay = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : iso;
};

export function CertificatesPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const type = params.get("type") ?? ALL;
  const status = params.get("status") ?? ALL;
  const q = params.get("q") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);
  const [revoking, setRevoking] = useState<{ cert: CertificateView; reason: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          if (value) next.set(key, value);
          else next.delete(key);
          if (key !== "page") next.delete("page");
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => search.trim() !== q && setParam("q", search.trim() || null), 300);
    return () => window.clearTimeout(timer);
  }, [search, q, setParam]);

  const query = { type: type === ALL ? undefined : type, status: status === ALL ? undefined : status, q: q || undefined, page: page > 1 ? page : undefined };
  const { data, isPending, isFetching, isError, refetch } = useQuery({ queryKey: documentKeys.certificates(query), queryFn: () => certificatesApi.list(query), placeholderData: keepPreviousData });
  useClampPage(data, (next) => setParam("page", next > 1 ? String(next) : null));

  const revoke = useMutation({
    mutationFn: (v: { cert: CertificateView; reason: string }) => certificatesApi.revoke(v.cert.id, v.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: documentKeys.certificatesRoot });
      setRevoking(null);
      setToast("Certificate withdrawn");
      setTimeout(() => setToast(null), 2400);
    },
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't withdraw it"),
  });

  async function open(cert: CertificateView) {
    setOpening(cert.id);
    setError(null);
    try {
      window.open(await certificatesApi.pdf(cert.id), "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the PDF");
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certificates"
        description="Bonafide, character, school leaving and merit certificates. Each gets a number and is saved exactly as issued, so a reprint is identical."
        actions={
          <>
            <Button variant="outline" render={<Link to="/certificates/templates" />}>
              Edit wording
            </Button>
            <Button render={<Link to="/certificates/new" />}>
              <Plus className="size-4" aria-hidden /> Issue a certificate
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Label htmlFor="c-type">Kind</Label>
          <FormSelect id="c-type" value={type} onValueChange={(v) => setParam("type", v && v !== ALL ? v : null)} options={[{ value: ALL, label: "All kinds" }, ...CERTIFICATE_TYPES.map((t) => ({ value: t, label: CERTIFICATE_LABEL[t] }))]} />
        </div>
        <div className="w-44">
          <Label htmlFor="c-status">State</Label>
          <FormSelect id="c-status" value={status} onValueChange={(v) => setParam("status", v && v !== ALL ? v : null)} options={[{ value: ALL, label: "Any" }, { value: "ISSUED", label: "In force" }, { value: "REVOKED", label: "Withdrawn" }]} />
        </div>
        <div className="w-64">
          <Label htmlFor="c-search">Search</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="c-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Number, student or admission no." className="pl-9" />
          </div>
        </div>
        <FetchingIndicator show={isFetching && !isPending} />
      </div>
      {error && !revoking ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

      {isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load certificates" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : !data.items.length ? (
        <EmptyState title={q || type !== ALL || status !== ALL ? "No certificates match" : "No certificates issued yet"} description="Issue one from here, or from a student's page." action={<Button render={<Link to="/certificates/new" />}>Issue a certificate</Button>} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl bg-surface">
            <table className="w-full min-w-max text-sm">
              <caption className="sr-only">Issued certificates</caption>
              <thead>
                <tr className="border-b border-line text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-3 font-medium">Number</th>
                  <th scope="col" className="px-4 py-3 font-medium">Certificate</th>
                  <th scope="col" className="px-4 py-3 font-medium">Student</th>
                  <th scope="col" className="px-4 py-3 font-medium">Issued</th>
                  <th scope="col" className="px-4 py-3 font-medium">State</th>
                  <th scope="col" className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((cert) => (
                  <tr key={cert.id}>
                    <td className="px-4 py-2.5 font-medium tabular-nums">{cert.serial}</td>
                    <td className="px-4 py-2.5">{CERTIFICATE_LABEL[cert.type as CertificateType]}</td>
                    <td className="px-4 py-2.5">
                      <Link to={`/students/${cert.studentId}`} className="text-indigo hover:underline">{cert.studentName}</Link>
                      <span className="block text-xs text-muted-foreground">{[cert.className, cert.admissionNo].filter(Boolean).join(" · ")}</span>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap">{shortDay(cert.issuedOn)}{cert.issuedBy ? <span className="block text-xs text-muted-foreground">by {cert.issuedBy}</span> : null}</td>
                    <td className="px-4 py-2.5">{cert.status === "REVOKED" ? <Badge tone="danger">Withdrawn</Badge> : <Badge tone="success">In force</Badge>}{cert.revokeReason ? <span className="block max-w-48 truncate text-xs text-muted-foreground" title={cert.revokeReason}>{cert.revokeReason}</span> : null}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" loading={opening === cert.id} onClick={() => void open(cert)}>
                          <FileText className="size-3.5" aria-hidden /> PDF
                        </Button>
                        {cert.status === "ISSUED" ? <Button size="sm" variant="ghost" onClick={() => { setError(null); setRevoking({ cert, reason: "" }); }}>Withdraw</Button> : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={data.page} pageSize={data.pageSize} total={data.total} noun="certificate" busy={isFetching} onPageChange={(next) => setParam("page", next > 1 ? String(next) : null)} />
        </>
      )}

      <Dialog
        open={Boolean(revoking)}
        title="Withdraw this certificate?"
        description={revoking ? `${revoking.cert.serial} for ${revoking.cert.studentName} stays on record, marked withdrawn, and any reprint shows WITHDRAWN across it.` : undefined}
        confirmLabel="Withdraw"
        danger
        loading={revoke.isPending}
        onConfirm={() => revoking && (revoking.reason.trim().length >= 3 ? revoke.mutate(revoking) : setError("Say why it is being withdrawn"))}
        onClose={() => setRevoking(null)}
      >
        <Label htmlFor="rv-reason">Why?</Label>
        <Textarea id="rv-reason" rows={2} maxLength={300} dir="auto" value={revoking?.reason ?? ""} onChange={(e) => revoking && setRevoking({ ...revoking, reason: e.target.value })} />
        {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      </Dialog>
      <Toast message={toast} />
    </div>
  );
}
