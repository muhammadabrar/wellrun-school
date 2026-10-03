import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CERTIFICATE_LABEL, CERTIFICATE_TYPES, PLACEHOLDER_HELP, TEMPLATE_PLACEHOLDERS, genderWords, renderTemplate, type CertificateType } from "@wellrun/shared";
import { Badge, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowLeft } from "lucide-react";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Toast } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { certificatesApi, documentKeys, type CertificateTemplateView } from "@/lib/documents-api";

const SAMPLE: Record<string, string> = {
  student: "Ayesha Khan",
  guardian: "Imran Khan",
  admissionNo: "ADM-2026-0001",
  class: "Grade 5 A",
  year: "2026-27",
  dob: "12 March 2015",
  school: "Your School",
  date: "3 October 2026",
  ...genderWords("female"),
  purposeLine: " This certificate is issued for a passport application.",
  conduct: "Good",
  leavingDate: "30 September 2026",
  reason: "family moved to another city",
  achievement: "first position in the annual examinations",
};

export function CertificateTemplatesPage() {
  const { data, isPending, isError, refetch } = useQuery({ queryKey: documentKeys.templates, queryFn: certificatesApi.templates });
  const [toast, setToast] = useState<string | null>(null);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link to="/certificates" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Certificates
        </Link>
        <PageHeader title="Certificate wording" description="Change what each certificate says. The words in double braces, like {{student}}, are filled in from the student's record. Certificates already issued keep the wording they were issued with." />
      </div>
      {isPending ? (
        <LoadingState variant="page" />
      ) : isError || !data ? (
        <ErrorState title="Couldn't load the wording" description="Check your connection and try again." onRetry={() => void refetch()} />
      ) : (
        <ul className="space-y-6">
          {CERTIFICATE_TYPES.map((type) => (
            <li key={type}>
              <TemplateCard template={data.find((t) => t.type === type)!} onSaved={(message) => { setToast(message); setTimeout(() => setToast(null), 2400); }} />
            </li>
          ))}
        </ul>
      )}
      <Toast message={toast} />
    </div>
  );
}

function TemplateCard({ template, onSaved }: { template: CertificateTemplateView; onSaved: (message: string) => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const [error, setError] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const type: CertificateType = template.type;
  const changed = title !== template.title || body !== template.body;

  const refresh = (next: CertificateTemplateView, message: string) => {
    queryClient.setQueryData<CertificateTemplateView[]>(documentKeys.templates, (cur) => cur?.map((t) => (t.type === next.type ? next : t)));
    setTitle(next.title);
    setBody(next.body);
    onSaved(message);
  };
  const save = useMutation({ mutationFn: () => certificatesApi.saveTemplate(type, { title, body }), onSuccess: (n) => refresh(n, "Wording saved"), onError: (e) => setError(e instanceof Error ? e.message : "Couldn't save") });
  const reset = useMutation({ mutationFn: () => certificatesApi.resetTemplate(type), onSuccess: (n) => refresh(n, "Back to the standard wording"), onError: (e) => setError(e instanceof Error ? e.message : "Couldn't reset") });

  function insert(key: string) {
    const el = area.current;
    const token = `{{${key}}}`;
    if (!el) return setBody((b) => `${b}${token}`);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <section className="space-y-4 rounded-3xl bg-surface p-5" aria-labelledby={`t-${type}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`t-${type}`} className="font-display text-xl">{CERTIFICATE_LABEL[type]}</h2>
        {template.custom ? <Badge tone="indigo">Your own wording</Badge> : <Badge tone="neutral">Standard wording</Badge>}
      </div>
      <div>
        <Label htmlFor={`tt-${type}`}>Title</Label>
        <Input id={`tt-${type}`} value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div>
        <Label htmlFor={`tb-${type}`}>Wording</Label>
        <Textarea id={`tb-${type}`} ref={area} rows={6} maxLength={1500} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className="mt-2 text-xs text-muted-foreground">Click to add to the wording:</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {TEMPLATE_PLACEHOLDERS[type].map((key) => (
            <button key={key} type="button" title={PLACEHOLDER_HELP[key]} onClick={() => insert(key)} className="rounded-full bg-paper px-2.5 py-1 text-xs hover:bg-indigo/10">
              {`{{${key}}}`}
            </button>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-4">
        <p className="mb-1 text-xs font-medium text-muted-foreground">How it reads with sample details</p>
        <p className="text-center font-display text-lg uppercase tracking-wide">{renderTemplate(title, SAMPLE)}</p>
        <p className="mt-2 whitespace-pre-line text-center text-sm leading-relaxed">{renderTemplate(body, SAMPLE)}</p>
      </div>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!changed} loading={save.isPending} onClick={() => { setError(null); save.mutate(); }}>
          Save wording
        </Button>
        {template.custom ? (
          <Button variant="outline" loading={reset.isPending} onClick={() => { setError(null); reset.mutate(); }}>
            Go back to the standard wording
          </Button>
        ) : null}
      </div>
    </section>
  );
}
