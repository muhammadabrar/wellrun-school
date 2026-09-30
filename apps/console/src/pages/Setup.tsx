import {
  CLASS_TEMPLATE_LABELS,
  CLASS_TEMPLATES,
  INSTITUTE_TYPES,
  PROVINCES,
  SUBJECT_TEMPLATES,
  type ClassTemplateId,
} from "@wellrun/shared";
import { BrandLogo, ErrorState, LoadingState } from "@wellrun/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FileUpload } from "../components/FileUpload";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ApiError } from "../lib/query";
import { api, currentUser, setSession, type Setup } from "../lib/api";
import { queryKeys } from "../lib/query";
import { refreshSchoolContext } from "../lib/school-context";
import { fileToDataUrl, nextSection } from "../lib/setup-helpers";

// Step ids keep the numbers the API stores in school.setupStep, so a half-finished setup resumes
// in the right place. Staff, admission form, student import and fees moved out of first-time setup.
const STEPS = [
  { id: 1, label: "Organization", hint: "Name, contact, logo" },
  { id: 2, label: "Campus", hint: "Main campus details" },
  { id: 3, label: "Academic year", hint: "Session dates" },
  { id: 4, label: "Classes", hint: "Grades and sections" },
  { id: 6, label: "Subjects", hint: "Subject library" },
] as const;

type StepId = (typeof STEPS)[number]["id"];

/** Where to resume from the API's saved step (it also records the retired steps 5, 7, 8, 9). */
function resumeStep(saved: number): StepId {
  if (saved >= 5) return 6;
  return Math.max(1, saved) as StepId;
}

function stepIndex(id: StepId) {
  return STEPS.findIndex((row) => row.id === id);
}

type GradePick = { name: string; selected: boolean; sections: string[] };

export function SetupPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const booted = useRef(false);
  const { data, refetch, isError, error: queryError } = useQuery({
    queryKey: queryKeys.setup,
    queryFn: api.setup,
  });
  const [step, setStepState] = useState<StepId>(1);
  // Furthest step reached — earlier steps can be revisited, later ones only by finishing this one.
  const [reached, setReached] = useState<StepId>(1);
  function setStep(next: StepId) {
    setStepState(next);
    setReached((current) => (stepIndex(next) > stepIndex(current) ? next : current));
  }
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [template, setTemplate] = useState<ClassTemplateId>("pakistan_school");
  const [subjectTemplate, setSubjectTemplate] = useState<ClassTemplateId | "">("");
  const [grades, setGrades] = useState<GradePick[]>([]);
  const [saving, setSaving] = useState(false);

  function applySetup(next: Setup, syncStep = false) {
    if (!next.school) return;
    if (syncStep && !next.school.setupCompleted) setStep(resumeStep(next.school.setupStep || 1));
    setGrades((current) =>
      current.length
        ? current
        : CLASS_TEMPLATES.pakistan_school.map((name) => ({ name, selected: true, sections: ["A"] })),
    );
  }

  useEffect(() => {
    if (!data || booted.current) return;
    booted.current = true;
    applySetup(data, true);
  }, [data]);

  async function load() {
    const next = await refetch();
    if (next.data) applySetup(next.data);
  }

  async function run(action: () => Promise<void>) {
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this step");
    } finally {
      setSaving(false);
    }
  }

  if (!data) {
    if (isError) {
      const expired = queryError instanceof ApiError && queryError.status === 401;
      return (
        <main className="flex min-h-dvh items-center justify-center px-6">
          <ErrorState
            title={expired ? "Sign in again" : "Could not load setup"}
            description={
              expired
                ? "This session is from before the database was replaced. Sign in with the seeded school admin."
                : queryError instanceof Error
                  ? queryError.message
                  : "Try again to continue school setup."
            }
            onRetry={() => {
              if (expired) {
                setSession(null);
                navigate("/login", { replace: true });
                return;
              }
              void refetch();
            }}
          />
        </main>
      );
    }
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <BrandLogo size="md" />
        <div className="mt-8">
          <LoadingState variant="form" />
        </div>
      </main>
    );
  }
  if (!data.school) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6">
        <ErrorState
          title="School not found"
          description="This session belongs to a previous database. Sign in again after seeding."
          onRetry={() => {
            setSession(null);
            navigate("/login", { replace: true });
          }}
        />
      </main>
    );
  }
  if (data.school.setupCompleted) return <Navigate to="/" replace />;

  async function finish() {
    await run(async () => {
      await api.completeSetup();
      await refreshSchoolContext();
      queryClient.setQueryData(queryKeys.setupStatus, { setupCompleted: true, setupStep: 10 });
      navigate("/");
    });
  }

  const logo = data.school.media.find((m) => m.kind === "LOGO")?.url;
  const cover = data.school.media.find((m) => m.kind === "COVER")?.url;
  const yearId = (data.years.find((year) => year.current) ?? data.years[0])?.id;

  return (
    <main className="min-h-dvh bg-paper px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <BrandLogo size="md" />
        <h1 className="mt-2 font-display text-4xl">Set up your school</h1>
        <p className="mt-2 text-sm text-muted-foreground">Finish these steps once. After that you manage everything from the dashboard.</p>
        <nav aria-label="Setup progress" className="mt-8">
          <p className="text-sm text-muted-foreground">
            Step {stepIndex(step) + 1} of {STEPS.length}
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-indigo transition-all" style={{ width: `${((stepIndex(step) + 1) / STEPS.length) * 100}%` }} />
          </div>
          <ol className="mt-5 grid grid-cols-5 gap-2">
            {STEPS.map((row, index) => {
              const done = index < stepIndex(reached) || (index < stepIndex(step));
              const current = row.id === step;
              const reachable = index <= stepIndex(reached);
              return (
                <li key={row.id}>
                  <button
                    type="button"
                    disabled={!reachable || current}
                    aria-current={current ? "step" : undefined}
                    onClick={() => setStep(row.id)}
                    className="group flex w-full flex-col items-center gap-2 text-center disabled:cursor-default"
                  >
                    <span
                      className={`flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors ${
                        current
                          ? "border-indigo bg-indigo text-white"
                          : done
                            ? "border-indigo bg-indigo/10 text-indigo group-hover:bg-indigo/20"
                            : "border-line bg-surface text-muted-foreground"
                      }`}
                    >
                      {done && !current ? <Check className="size-4" aria-hidden /> : index + 1}
                    </span>
                    <span className={`text-xs sm:text-sm ${current ? "font-semibold text-foreground" : reachable ? "text-foreground" : "text-muted-foreground"}`}>
                      {row.label}
                    </span>
                    <span className="hidden text-xs text-muted-foreground sm:block">{row.hint}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
        {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
        {message ? <p className="mt-4 text-sm text-indigo">{message}</p> : null}

        {step === 1 ? (
          <form
            className="mt-8 grid grid-cols-2 gap-3 rounded-3xl bg-surface p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                await api.saveOrg({
                  name: String(form.get("name")),
                  type: String(form.get("type")),
                  educationLevel: String(form.get("educationLevel")),
                  registrationNo: String(form.get("registrationNo")),
                  phone: String(form.get("phone")),
                  email: String(form.get("email")),
                  website: String(form.get("website")),
                  address: String(form.get("address")),
                  city: String(form.get("city")),
                  province: String(form.get("province")),
                  country: String(form.get("country") || "Pakistan"),
                  logoUrl: logo,
                  coverUrl: cover,
                });
                await load();
                setStep(2);
              });
            }}
          >
            <Field name="name" label="Institute title" defaultValue={data.school.name} required />
            <label className="block text-sm font-medium">
              Type
              <FormSelect
                name="type"
                defaultValue={data.school.type}
                options={INSTITUTE_TYPES.map((type) => ({ value: type.id, label: type.label }))}
              />
            </label>
            <Field name="educationLevel" label="Education level" defaultValue={data.school.educationLevel} placeholder="Primary, secondary…" />
            <Field name="registrationNo" label="Registration number" defaultValue={data.school.registrationNo} />
            <Field name="phone" label="Phone" defaultValue={data.school.phone} />
            <Field name="email" label="Email" defaultValue={data.school.email} />
            <Field name="website" label="Website" defaultValue={data.school.website} />
            <Field name="address" label="Address" defaultValue={data.school.address} />
            <Field name="city" label="City" defaultValue={data.school.city} required />
            <label className="block text-sm font-medium">
              Province
              <FormSelect
                name="province"
                defaultValue={data.school.province || undefined}
                placeholder="Select"
                options={PROVINCES.map((province) => ({ value: province, label: province }))}
              />
            </label>
            <Field name="country" label="Country" defaultValue={data.school.country || "Pakistan"} />
            <div className="col-span-2 grid grid-cols-2 gap-3">
              <FileUpload
                label="Logo"
                accept="image/*"
                hint="PNG or JPG, square works best"
                preview={logo}
                onFile={(file) =>
                  void run(async () => {
                    await api.uploadMedia({ kind: "LOGO", filename: file.name, dataUrl: await fileToDataUrl(file) });
                    await load();
                  })
                }
              />
              <FileUpload
                label="Cover image"
                accept="image/*"
                hint="PNG or JPG, wide image"
                preview={cover}
                previewWide
                onFile={(file) =>
                  void run(async () => {
                    await api.uploadMedia({ kind: "COVER", filename: file.name, dataUrl: await fileToDataUrl(file) });
                    await load();
                  })
                }
              />
            </div>
            <Button type="submit" loading={saving} className="col-span-2">
              Save and continue
            </Button>
          </form>
        ) : null}

        {step === 2 ? (
          <form
            className="mt-8 grid grid-cols-2 gap-3 rounded-3xl bg-surface p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                await api.saveCampus({
                  name: String(form.get("name")),
                  address: String(form.get("address")),
                  phone: String(form.get("phone")),
                  principal: String(form.get("principal")),
                  code: String(form.get("code") || "MAIN"),
                  isMain: true,
                });
                await refreshSchoolContext();
                await load();
                setStep(3);
              });
            }}
          >
            <p className="col-span-2 text-sm text-muted-foreground">Copied from the organization profile. You can add more campuses later from Campus settings.</p>
            <Field name="name" label="Campus name" defaultValue={data.campus?.name || data.school.name} required />
            <Field name="code" label="Campus code" defaultValue={data.campus?.code || "MAIN"} />
            <Field name="address" label="Address" defaultValue={data.campus?.address || data.school.address} />
            <Field name="phone" label="Phone" defaultValue={data.campus?.phone || data.school.phone} />
            <Field name="principal" label="Principal (admin)" defaultValue={data.campus?.principal || currentUser()?.name || ""} />
            <Button type="submit" loading={saving} className="col-span-2">
              Save main campus
            </Button>
          </form>
        ) : null}

        {step === 3 ? (
          <form
            className="mt-8 grid gap-3 rounded-3xl bg-surface p-6"
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run(async () => {
                await api.createYear({
                  name: String(form.get("name")),
                  startsOn: String(form.get("startsOn")),
                  endsOn: String(form.get("endsOn")),
                  current: true,
                });
                await refreshSchoolContext();
                await load();
                setStep(4);
              });
            }}
          >
            <p className="text-sm text-muted-foreground">Current years: {data.years.map((y) => y.name).join(", ") || "none yet"}</p>
            <Field name="name" label="Academic year" defaultValue="2026-27" required />
            <label className="block text-sm font-medium">
              Starts
              <DatePicker name="startsOn" defaultValue="2026-04-01" required />
            </label>
            <label className="block text-sm font-medium">
              Ends
              <DatePicker name="endsOn" defaultValue="2027-03-31" required />
            </label>
            <Button type="submit" loading={saving}>
              {data.years.length ? "Update year" : "Save year"}
            </Button>
            {data.years.length ? (
              <Button type="button" variant="outline" onClick={() => setStep(4)}>
                Continue with current year
              </Button>
            ) : null}
          </form>
        ) : null}

        {step === 4 ? (
          <section className="mt-8 rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Select academic template</h2>
            <p className="mt-2 text-sm text-muted-foreground">Start from a template, then rename grades and add sections.</p>
            <div className="mt-4 grid grid-cols-4 gap-2">
              {(Object.keys(CLASS_TEMPLATES) as ClassTemplateId[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setTemplate(id);
                    setGrades(CLASS_TEMPLATES[id].map((name) => ({ name, selected: true, sections: ["A"] })));
                  }}
                  className={`rounded-2xl px-3 py-3 text-sm ${template === id ? "bg-indigo text-white" : "bg-paper"}`}
                >
                  {CLASS_TEMPLATE_LABELS[id]}
                </button>
              ))}
            </div>
            <ul className="mt-6 space-y-2">
              {grades.map((grade, index) => (
                <li key={`${grade.name}-${index}`} className="flex flex-wrap items-center gap-2 rounded-2xl bg-paper px-3 py-2">
                  <input
                    type="checkbox"
                    checked={grade.selected}
                    onChange={(e) => setGrades((rows) => rows.map((row, i) => (i === index ? { ...row, selected: e.target.checked } : row)))}
                  />
                  <input
                    value={grade.name}
                    onChange={(e) => setGrades((rows) => rows.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)))}
                    className="h-10 min-w-40 flex-1 rounded-xl border border-line px-3 text-sm"
                  />
                  <div className="flex flex-wrap gap-1">
                    {grade.sections.map((section) => (
                      <button
                        key={section}
                        type="button"
                        className="rounded-full bg-surface px-2 py-1 text-xs"
                        onClick={() =>
                          setGrades((rows) =>
                            rows.map((row, i) =>
                              i === index && row.sections.length > 1
                                ? { ...row, sections: row.sections.filter((item) => item !== section) }
                                : row,
                            ),
                          )
                        }
                        title={grade.sections.length > 1 ? `Remove section ${section}` : "Keep at least one section"}
                      >
                        {section}
                        {grade.sections.length > 1 ? " ×" : ""}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="text-sm text-indigo"
                    onClick={() =>
                      setGrades((rows) =>
                        rows.map((row, i) => (i === index ? { ...row, sections: [...row.sections, nextSection(row.sections)] } : row)),
                      )
                    }
                  >
                    Add section
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-3 text-sm text-indigo"
              onClick={() => setGrades((rows) => [...rows, { name: "New class", selected: true, sections: ["A"] }])}
            >
              Add another class
            </button>
            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                loading={saving}
                onClick={() =>
                  void run(async () => {
                    if (!yearId) throw new Error("Create an academic year first.");
                    await api.applyClasses({ yearId, campusId: data.campus?.id, template, grades });
                    await refreshSchoolContext();
                    await load();
                    setStep(6);
                  })
                }
              >
                Save classes & continue
              </Button>
              {data.classes.length ? (
                <Button type="button" variant="outline" onClick={() => setStep(6)}>
                  Continue with {data.classes.length} existing classes
                </Button>
              ) : null}
            </div>
            {data.classes.length ? <p className="mt-4 text-sm text-muted-foreground">{data.classes.length} classes already created.</p> : null}
          </section>
        ) : null}

        {step === 6 ? (
          <section className="mt-8 rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Subject library</h2>
            <p className="mt-2 text-sm text-muted-foreground">Load a subject list from a template, then add or keep the names you need. You can attach subjects to classes later.</p>
            <label className="mt-4 block text-sm font-medium">
              Subject template
              <FormSelect
                value={subjectTemplate || undefined}
                placeholder="Choose a template"
                onValueChange={(value) => {
                  const id = value as ClassTemplateId;
                  if (!id) return;
                  setSubjectTemplate(id);
                  void run(async () => {
                    await api.applySubjects({ template: id });
                    await load();
                    setMessage(`${CLASS_TEMPLATE_LABELS[id]} subjects loaded.`);
                  });
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
                void run(async () => {
                  await api.saveSubject({ name: String(form.get("name")) });
                  formEl.reset();
                  await load();
                });
              }}
            >
              <Input name="name" required placeholder="Add subject" className="flex-1" />
              <Button type="submit" variant="secondary" loading={saving}>
                Add
              </Button>
            </form>
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-2xl bg-paper">
              {data.subjects.length ? (
                data.subjects.map((subject) => (
                  <li key={subject.id} className="px-4 py-3 text-sm">
                    {subject.name}
                  </li>
                ))
              ) : (
                <li className="px-4 py-3 text-sm text-muted-foreground">No subjects yet. Choose a template or add one.</li>
              )}
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button type="button" loading={saving} onClick={() => void finish()}>
                Finish setup
              </Button>
              <p className="text-sm text-muted-foreground">
                {data.subjects.length ? `${data.subjects.length} subjects ready.` : "You can add subjects later from Classes & subjects."} Next, the dashboard helps you set up fees.
              </p>
            </div>
          </section>
        ) : null}

        {step > 1 ? (
          <div className="mt-4">
            <Button type="button" variant="ghost" onClick={() => setStep(STEPS[stepIndex(step) - 1].id)}>
              ← Back to {STEPS[stepIndex(step) - 1].label}
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Field({
  name,
  label,
  defaultValue,
  type = "text",
  required,
  placeholder,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block text-sm font-medium">
      {label}
      <span className="mt-2 block">
        {type === "date" ? (
          <DatePicker name={name} defaultValue={defaultValue} required={required} />
        ) : (
          <Input name={name} required={required} defaultValue={defaultValue} placeholder={placeholder} />
        )}
      </span>
    </label>
  );
}
