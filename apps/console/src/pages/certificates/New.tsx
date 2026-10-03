import { useMutation, useQuery } from "@tanstack/react-query";
import { CERTIFICATE_FIELDS, CERTIFICATE_HELP, CERTIFICATE_LABEL, CERTIFICATE_TYPES, type CertificateType } from "@wellrun/shared";
import { LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowLeft, FileText, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { certificatesApi, type IssuedResult, type PreviewResult } from "@/lib/documents-api";
import { todayIso } from "@/lib/format";

type Picked = { id: string; name: string; detail: string };

export function CertificateNewPage() {
  const today = todayIso();
  const [params] = useSearchParams();
  const [type, setType] = useState<CertificateType>(CERTIFICATE_TYPES.find((t) => t === params.get("type")) ?? "BONAFIDE");
  const [student, setStudent] = useState<Picked | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [issued, setIssued] = useState<IssuedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const presetId = params.get("studentId");
  const preset = useQuery({ queryKey: ["certificate-student", presetId], queryFn: () => api.student(presetId!), enabled: Boolean(presetId) && !student });
  useEffect(() => {
    if (preset.data && !student) setStudent({ id: preset.data.id, name: `${preset.data.firstName} ${preset.data.lastName}`.trim(), detail: [preset.data.admissionNo, preset.data.class ? `${preset.data.class.name} ${preset.data.class.section}` : ""].filter(Boolean).join(" · ") });
  }, [preset.data, student]);

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const results = useQuery({ queryKey: ["certificate-students", q], queryFn: () => api.students({ q, pageSize: 8 }), enabled: q.length >= 2 && !student });

  // Each kind starts with its sensible defaults: conduct "Good", leaving today.
  const defaults = useMemo(() => Object.fromEntries(CERTIFICATE_FIELDS[type].flatMap((f) => (f.default ? [[f.key, f.default]] : f.kind === "date" ? [[f.key, today]] : []))), [type, today]);
  useEffect(() => {
    setFields(defaults);
    setPreview(null);
    setError(null);
  }, [defaults]);

  const payload = { studentId: student?.id ?? "", type, fields };
  const previewIt = useMutation({
    mutationFn: () => certificatesApi.preview(payload),
    onSuccess: (r) => {
      setPreview(r);
      setError(null);
    },
    onError: (e) => {
      setPreview(null);
      setError(e instanceof Error ? e.message : "Couldn't prepare the preview");
    },
  });
  const issue = useMutation({
    mutationFn: () => certificatesApi.issue(payload),
    onSuccess: (r) => setIssued(r),
    onError: (e) => setError(e instanceof Error ? e.message : "Couldn't issue the certificate"),
  });

  async function openPdf(id: string) {
    setOpening(true);
    try {
      window.open(await certificatesApi.pdf(id), "_blank", "noopener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the PDF");
    } finally {
      setOpening(false);
    }
  }

  if (issued) {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader title="Certificate issued" description={`${issued.serial} for ${issued.studentName}.`} />
        <div className="space-y-4 rounded-3xl bg-surface p-6">
          <p className="text-sm">The certificate is saved with the wording you saw. Open the PDF to print it on the school's letterhead paper or plain A4.</p>
          {issued.warnings.map((w) => (
            <p key={w} role="status" className="rounded-2xl bg-orange/10 px-4 py-3 text-sm text-orange">{w}</p>
          ))}
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <Button loading={opening} onClick={() => void openPdf(issued.id)}>
              <FileText className="size-4" aria-hidden /> Open the PDF
            </Button>
            <Button variant="outline" onClick={() => { setIssued(null); setPreview(null); setStudent(null); setSearch(""); setFields(defaults); }}>
              Issue another
            </Button>
            <Button variant="ghost" render={<Link to="/certificates" />}>
              All certificates
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const ready = Boolean(student);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link to="/certificates" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Certificates
        </Link>
        <PageHeader title="Issue a certificate" description={CERTIFICATE_HELP[type]} />
      </div>

      <section aria-labelledby="k-h" className="space-y-3 rounded-3xl bg-surface p-5">
        <h2 id="k-h" className="font-display text-xl">1. Which certificate?</h2>
        <div role="radiogroup" aria-labelledby="k-h" className="grid gap-2 sm:grid-cols-2">
          {CERTIFICATE_TYPES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} onClick={() => setType(t)} className={`rounded-2xl border px-4 py-3 text-left text-sm ${type === t ? "border-indigo bg-indigo/10" : "border-line hover:bg-paper"}`}>
              <span className="block font-medium">{CERTIFICATE_LABEL[t]}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="s-h" className="space-y-3 rounded-3xl bg-surface p-5">
        <h2 id="s-h" className="font-display text-xl">2. Which student?</h2>
        {student ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-paper px-4 py-3">
            <span>
              <span className="block font-medium">{student.name}</span>
              <span className="block text-xs text-muted-foreground">{student.detail}</span>
            </span>
            <Button variant="ghost" size="sm" onClick={() => { setStudent(null); setPreview(null); }}>Change</Button>
          </div>
        ) : (
          <div>
            <Label htmlFor="cs-search">Search by name or admission number</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="cs-search" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" placeholder="At least two letters" autoComplete="off" />
            </div>
            {q.length >= 2 ? (
              results.isPending ? (
                <p className="mt-2 text-sm text-muted-foreground">Searching…</p>
              ) : results.data?.items.length ? (
                <ul className="mt-2 divide-y divide-line rounded-2xl border border-line">
                  {results.data.items.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-paper" onClick={() => setStudent({ id: s.id, name: `${s.firstName} ${s.lastName}`.trim(), detail: [s.admissionNo, s.class ? `${s.class.name} ${s.class.section}` : ""].filter(Boolean).join(" · ") })}>
                        <span>{s.firstName} {s.lastName}</span>
                        <span className="text-xs text-muted-foreground">{s.admissionNo}{s.class ? ` · ${s.class.name} ${s.class.section}` : ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No student matches "{q}".</p>
              )
            ) : null}
          </div>
        )}
      </section>

      {CERTIFICATE_FIELDS[type].length ? (
        <section aria-labelledby="f-h" className="space-y-4 rounded-3xl bg-surface p-5">
          <h2 id="f-h" className="font-display text-xl">3. Details</h2>
          {CERTIFICATE_FIELDS[type].map((f) => (
            <div key={f.key}>
              <Label htmlFor={`cf-${f.key}`}>{f.label}</Label>
              {f.kind === "choice" ? (
                <FormSelect id={`cf-${f.key}`} value={fields[f.key] ?? ""} onValueChange={(v) => { setFields({ ...fields, [f.key]: v ?? "" }); setPreview(null); }} options={(f.choices ?? []).map((c) => ({ value: c, label: c }))} />
              ) : f.kind === "date" ? (
                <DatePicker id={`cf-${f.key}`} value={fields[f.key] ?? ""} onChange={(v) => { setFields({ ...fields, [f.key]: v }); setPreview(null); }} fromYear={2015} toYear={new Date().getFullYear()} />
              ) : (
                <Input id={`cf-${f.key}`} value={fields[f.key] ?? ""} maxLength={300} dir="auto" placeholder={f.hint} onChange={(e) => { setFields({ ...fields, [f.key]: e.target.value }); setPreview(null); }} />
              )}
            </div>
          ))}
        </section>
      ) : null}

      <section aria-labelledby="p-h" className="space-y-3 rounded-3xl bg-surface p-5">
        <h2 id="p-h" className="font-display text-xl">{CERTIFICATE_FIELDS[type].length ? "4." : "3."} Check the wording</h2>
        {previewIt.isPending ? <LoadingState variant="form" /> : null}
        {preview ? (
          <div className="space-y-3 rounded-2xl border border-line bg-paper p-5">
            <p className="text-center font-display text-xl uppercase tracking-wide">{preview.title}</p>
            <p dir="auto" className="whitespace-pre-line text-center text-sm leading-relaxed">{preview.text}</p>
            {preview.warnings.map((w) => (
              <p key={w} role="status" className="rounded-2xl bg-orange/10 px-4 py-3 text-sm text-orange">{w}</p>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{ready ? "Press Preview to see exactly what will be printed." : "Choose a student first."}</p>
        )}
        {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={!ready} loading={previewIt.isPending} onClick={() => { setError(null); previewIt.mutate(); }}>
            Preview
          </Button>
          <Button disabled={!ready} loading={issue.isPending} onClick={() => { setError(null); issue.mutate(); }}>
            Issue certificate
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Issuing gives it the next certificate number. It can be withdrawn later but not edited.</p>
      </section>
    </div>
  );
}
