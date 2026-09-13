import { CLASS_TEMPLATE_LABELS, SUBJECT_TEMPLATES, type ClassTemplateId } from "@wellrun/shared";
import { FormEvent, useEffect, useState } from "react";
import { api, type Setup } from "../lib/api";
import { nextSection } from "../lib/setup-helpers";

export function AcademicsPage() {
  const [data, setData] = useState<Setup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function load() {
    api.setup().then(setData);
  }

  useEffect(() => {
    load();
  }, []);

  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-surface" />;

  const yearId = data.years[0]?.id;
  const grouped = new Map<string, Setup["classes"]>();
  for (const cls of data.classes) {
    const rows = grouped.get(cls.name) ?? [];
    rows.push(cls);
    grouped.set(cls.name, rows);
  }

  async function addSection(name: string) {
    if (!yearId) return;
    const existing = data!.classes.filter((cls) => cls.name === name).map((cls) => cls.section);
    setError(null);
    try {
      await api.createClass({ name, section: nextSection(existing), yearId });
      setMessage("Section added.");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add section");
    }
  }

  async function rename(id: string, name: string) {
    setError(null);
    try {
      await api.updateClass(id, { name });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename class");
    }
  }

  async function onClass(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!yearId) return;
    const form = new FormData(event.currentTarget);
    setError(null);
    try {
      await api.createClass({
        name: String(form.get("name")),
        section: String(form.get("section") || "A"),
        yearId,
      });
      event.currentTarget.reset();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create class");
    }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-4xl">Classes & subjects</h1>
      <p className="mt-2 text-sm text-muted">Rename grades, add sections, and keep a simple subject list.</p>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-indigo">{message}</p> : null}

      <section className="mt-8 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Classes</h2>
        <ul className="mt-4 space-y-3">
          {[...grouped.entries()].map(([name, rows]) => (
            <li key={name} className="rounded-2xl bg-paper px-3 py-3">
              <input
                defaultValue={name}
                className="h-10 w-full rounded-xl border border-line px-3"
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
          <input name="name" required placeholder="Class title" className="h-11 flex-1 rounded-xl border border-line px-3" />
          <input name="section" placeholder="A" className="h-11 w-20 rounded-xl border border-line px-3" />
          <button type="submit" className="h-11 rounded-xl bg-indigo px-4 text-white">
            Add class
          </button>
        </form>
      </section>

      <section className="mt-6 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Subjects</h2>
        <label className="mt-4 block text-sm font-medium">
          Load template
          <select
            defaultValue=""
            className="mt-2 h-11 w-full rounded-xl border border-line px-3"
            onChange={(event) => {
              const template = event.target.value as ClassTemplateId;
              if (!template) return;
              void api
                .applySubjects({ template })
                .then(() => {
                  setMessage(`${CLASS_TEMPLATE_LABELS[template]} subjects loaded.`);
                  load();
                })
                .catch((err) => setError(err instanceof Error ? err.message : "Could not load subjects"));
            }}
          >
            <option value="">Choose a template</option>
            {(Object.keys(SUBJECT_TEMPLATES) as ClassTemplateId[]).map((id) => (
              <option key={id} value={id}>
                {CLASS_TEMPLATE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const formEl = event.currentTarget;
            const form = new FormData(formEl);
            void api.saveSubject({ name: String(form.get("name")) }).then(() => {
              formEl.reset();
              load();
            });
          }}
        >
          <input name="name" required placeholder="Add subject" className="h-11 flex-1 rounded-xl border border-line px-3" />
          <button type="submit" className="h-11 rounded-xl bg-ink px-4 text-white">
            Add
          </button>
        </form>
        <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-paper">
          {data.subjects.length ? (
            data.subjects.map((subject) => (
              <li key={subject.id} className="px-4 py-3 text-sm">
                {subject.name}
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-sm text-muted">No subjects yet. Choose a template or add one.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
