import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/form/form-select";
import { Input } from "@/components/ui/input";
import { CLASS_TEMPLATE_LABELS, SUBJECT_TEMPLATES, type ClassTemplateId } from "@wellrun/shared";
import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { queryKeys } from "../lib/query";
import { nextSection } from "../lib/setup-helpers";
import { refreshSchoolContext } from "../lib/school-context";

export function AcademicsPage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({ queryKey: queryKeys.academics, queryFn: api.academics });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reload() {
    await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.academics }), refreshSchoolContext()]);
  }

  if (isPending || !data) return <LoadingState variant="form" />;

  const academics = data;
  const yearId = academics.years[0]?.id;
  const grouped = new Map<string, typeof academics.classes>();
  for (const cls of academics.classes) {
    const rows = grouped.get(cls.name) ?? [];
    rows.push(cls);
    grouped.set(cls.name, rows);
  }

  async function addSection(name: string) {
    if (!yearId) return;
    const existing = academics.classes.filter((cls) => cls.name === name).map((cls) => cls.section);
    setError(null);
    try {
      await api.createClass({ name, section: nextSection(existing), yearId });
      setMessage("Section added.");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add section");
    }
  }

  async function rename(id: string, name: string) {
    setError(null);
    try {
      await api.updateClass(id, { name });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename class");
    }
  }

  async function onClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!yearId) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    setBusy("class");
    try {
      await api.createClass({
        name: String(form.get("name")),
        section: String(form.get("section") || "A"),
        yearId,
      });
      event.currentTarget.reset();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create class");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-4xl">Classes & subjects</h1>
      <p className="mt-2 text-sm text-muted-foreground">Rename grades, add sections, and keep a simple subject list.</p>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-indigo">{message}</p> : null}

      <section className="mt-8 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Classes</h2>
        <ul className="mt-4 space-y-3">
          {[...grouped.entries()].map(([name, rows]) => (
            <li key={name} className="rounded-2xl bg-paper px-3 py-3">
              <Input
                defaultValue={name}
                onBlur={(event) => {
                  const next = event.target.value.trim();
                  if (!next || next === name) return;
                  void Promise.all(rows.map((cls) => rename(cls.id, next)));
                }}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rows.map((cls) => (
                  <span key={cls.id} className="rounded-full bg-surface px-2.5 py-1 text-xs">
                    {cls.section}
                  </span>
                ))}
                <button type="button" className="text-xs text-indigo" onClick={() => void addSection(name)}>
                  Add section
                </button>
              </div>
            </li>
          ))}
        </ul>
        <form onSubmit={onClass} className="mt-4 flex gap-2">
          <Input name="name" required placeholder="Class title" className="flex-1" />
          <Input name="section" placeholder="A" className="w-20" />
          <Button type="submit" loading={busy === "class"}>
            Add class
          </Button>
        </form>
      </section>

      <section className="mt-6 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Subjects</h2>
        <label className="mt-4 block text-sm font-medium">
          Load template
          <FormSelect
            placeholder="Choose a template"
            onValueChange={(value) => {
              const template = value as ClassTemplateId;
              if (!template) return;
              void api
                .applySubjects({ template })
                .then(async () => {
                  setMessage(`${CLASS_TEMPLATE_LABELS[template]} subjects loaded.`);
                  await reload();
                })
                .catch((err) => setError(err instanceof Error ? err.message : "Could not load subjects"));
            }}
            options={(Object.keys(SUBJECT_TEMPLATES) as ClassTemplateId[]).map((id) => ({
              value: id,
              label: CLASS_TEMPLATE_LABELS[id],
            }))}
          />
        </label>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formEl = event.currentTarget;
            const form = new FormData(formEl);
            setBusy("subject");
            void api
              .saveSubject({ name: String(form.get("name")) })
              .then(async () => {
                formEl.reset();
                await reload();
              })
              .finally(() => setBusy(null));
          }}
        >
          <Input name="name" required placeholder="Add subject" className="flex-1" />
          <Button type="submit" variant="secondary" loading={busy === "subject"}>
            Add
          </Button>
        </form>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-paper">
          {academics.subjects.length ? (
            academics.subjects.map((subject) => (
              <li key={subject.id} className="px-4 py-3 text-sm">
                {subject.name}
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-muted-foreground">No subjects yet. Choose a template or add one.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
