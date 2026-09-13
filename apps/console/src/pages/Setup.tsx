import {
  CLASS_TEMPLATE_LABELS,
  CLASS_TEMPLATES,
  INSTITUTE_TYPES,
  PROVINCES,
  SUBJECT_TEMPLATES,
  admissionFieldKey,
  type ClassTemplateId,
} from "@wellrun/shared";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { FileUpload } from "../components/FileUpload";
import { api, currentUser, type AdmissionField, type Setup } from "../lib/api";
import { fieldFromLabel, fileToDataUrl, nextSection, parseImportFile } from "../lib/setup-helpers";

const STEPS = [
  "Organization",
  "Campus",
  "Academic year",
  "Classes",
  "Staff",
  "Subjects",
  "Admission form",
  "Import students",
  "Fee structure",
];

type GradePick = { name: string; selected: boolean; sections: string[] };

export function SetupPage() {
  const navigate = useNavigate();
  const booted = useRef(false);
  const [data, setData] = useState<Setup | null>(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [template, setTemplate] = useState<ClassTemplateId>("pakistan_school");
  const [subjectTemplate, setSubjectTemplate] = useState<ClassTemplateId | "">("");
  const [grades, setGrades] = useState<GradePick[]>([]);
  const [fields, setFields] = useState<AdmissionField[]>([]);
  const [feeItems, setFeeItems] = useState<{ name: string; amountPkr: number; enabled: boolean }[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importFileName, setImportFileName] = useState("");

  async function load(syncStep = false) {
    const next = await api.setup();
    setData(next);
    if (syncStep && !next.school.setupCompleted) setStep(Math.min(next.school.setupStep || 1, 9));
    const form = next.admissionForms[0];
    setFields(form?.fields?.length ? form.fields : next.templates.admissionFields);
    setFeeItems(
      next.feeItems.length
        ? next.feeItems
        : next.templates.feeItems.map((name) => ({ name, amountPkr: 0, enabled: true })),
    );
    if (!grades.length) {
      setGrades(CLASS_TEMPLATES.pakistan_school.map((name) => ({ name, selected: true, sections: ["A"] })));
    }
  }

  useEffect(() => {
    load(!booted.current)
      .then(() => {
        booted.current = true;
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load setup"));
  }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    setMessage(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this step");
    }
  }

  if (!data) return <div className="flex min-h-dvh items-center justify-center text-muted">Loading setup…</div>;
  if (data.school.setupCompleted) return <Navigate to="/" replace />;

  const logo = data.school.media.find((m) => m.kind === "LOGO")?.url;
  const cover = data.school.media.find((m) => m.kind === "COVER")?.url;
  const yearId = data.years[0]?.id;

  return (
    <main className="min-h-dvh bg-paper px-6 py-10">
      <div className="mx-auto max-w-4xl">
        <p className="text-xs font-semibold tracking-[0.18em] text-indigo uppercase">Wellrun School</p>
        <h1 className="mt-2 font-display text-4xl">Set up your school</h1>
        <p className="mt-2 text-sm text-muted">Finish these steps once. After that you manage everything from the dashboard.</p>
        <ol className="mt-6 flex flex-wrap gap-2">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(index + 1)}
                className={`rounded-full px-3 py-1.5 text-sm ${step === index + 1 ? "bg-indigo text-white" : "bg-surface"}`}
              >
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>
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
              <select name="type" defaultValue={data.school.type} className="mt-2 h-11 w-full rounded-xl border border-line px-3">
                {INSTITUTE_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label}
                  </option>
                ))}
              </select>
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
              <select name="province" defaultValue={data.school.province} className="mt-2 h-11 w-full rounded-xl border border-line px-3">
                <option value="">Select</option>
                {PROVINCES.map((province) => (
                  <option key={province} value={province}>
                    {province}
                  </option>
                ))}
              </select>
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
            <button type="submit" className="col-span-2 h-11 rounded-xl bg-indigo text-white">
              Save and continue
            </button>
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
                await load();
                setStep(3);
              });
            }}
          >
            <p className="col-span-2 text-sm text-muted">Copied from the organization profile. You can add more campuses later from Campus settings.</p>
            <Field name="name" label="Campus name" defaultValue={data.campus?.name || data.school.name} required />
            <Field name="code" label="Campus code" defaultValue={data.campus?.code || "MAIN"} />
            <Field name="address" label="Address" defaultValue={data.campus?.address || data.school.address} />
            <Field name="phone" label="Phone" defaultValue={data.campus?.phone || data.school.phone} />
            <Field name="principal" label="Principal (admin)" defaultValue={data.campus?.principal || currentUser()?.name || ""} />
            <button type="submit" className="col-span-2 h-11 rounded-xl bg-indigo text-white">
              Save main campus
            </button>
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
                await load();
                setStep(4);
              });
            }}
          >
            <p className="text-sm text-muted">Current years: {data.years.map((y) => y.name).join(", ") || "none yet"}</p>
            <Field name="name" label="Academic year" defaultValue="2026-27" required />
            <Field name="startsOn" label="Starts" type="date" defaultValue="2026-04-01" required />
            <Field name="endsOn" label="Ends" type="date" defaultValue="2027-03-31" required />
            <button type="submit" className="h-11 rounded-xl bg-indigo text-white">
              {data.years.length ? "Update year" : "Save year"}
            </button>
            {data.years.length ? (
              <button type="button" className="h-11 rounded-xl bg-paper" onClick={() => setStep(4)}>
                Continue with current year
              </button>
            ) : null}
          </form>
        ) : null}

        {step === 4 ? (
          <section className="mt-8 rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Select academic template</h2>
            <p className="mt-2 text-sm text-muted">Start from a template, then rename grades and add sections.</p>
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
              <button
                type="button"
                className="h-11 rounded-xl bg-indigo px-4 text-white"
                onClick={() =>
                  void run(async () => {
                    if (!yearId) throw new Error("Create an academic year first.");
                    await api.applyClasses({ yearId, campusId: data.campus?.id, template, grades });
                    await load();
                    setStep(5);
                  })
                }
              >
                Create selected classes
              </button>
              <button type="button" className="h-11 rounded-xl bg-paper px-4" onClick={() => setStep(5)}>
                Skip
              </button>
            </div>
            {data.classes.length ? <p className="mt-4 text-sm text-muted">{data.classes.length} classes already created.</p> : null}
          </section>
        ) : null}

        {step === 5 ? (
          <section className="mt-8 rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Create staff / teacher</h2>
            <p className="mt-2 text-sm text-muted">Add one or two people now. Full staff records live on the Staff page after setup.</p>
            <form
              className="mt-4 grid grid-cols-2 gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const formEl = event.currentTarget;
                const form = new FormData(formEl);
                void run(async () => {
                  await api.createStaff({
                    name: String(form.get("name")),
                    title: String(form.get("title") || "Teacher"),
                    email: String(form.get("email") || ""),
                    phone: String(form.get("phone") || ""),
                  });
                  formEl.reset();
                  setMessage("Staff saved.");
                });
              }}
            >
              <Field name="name" label="Name" required />
              <Field name="title" label="Title" defaultValue="Teacher" />
              <Field name="email" label="Email" />
              <Field name="phone" label="Phone" />
              <button type="submit" className="col-span-2 h-11 rounded-xl bg-indigo text-white">
                Add staff
              </button>
            </form>
            <div className="mt-4 flex gap-2">
              <button type="button" className="h-11 rounded-xl bg-indigo px-4 text-white" onClick={() => setStep(6)}>
                Continue
              </button>
              <button type="button" className="h-11 rounded-xl bg-paper px-4" onClick={() => setStep(6)}>
                Skip
              </button>
            </div>
          </section>
        ) : null}

        {step === 6 ? (
          <section className="mt-8 rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Subject library</h2>
            <p className="mt-2 text-sm text-muted">Load a subject list from a template, then add or keep the names you need. You can attach subjects to classes later.</p>
            <label className="mt-4 block text-sm font-medium">
              Subject template
              <select
                value={subjectTemplate}
                onChange={(event) => {
                  const id = event.target.value as ClassTemplateId;
                  setSubjectTemplate(id);
                  void run(async () => {
                    await api.applySubjects({ template: id });
                    await load();
                    setMessage(`${CLASS_TEMPLATE_LABELS[id]} subjects loaded.`);
                  });
                }}
                className="mt-2 h-11 w-full rounded-xl border border-line px-3"
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
                void run(async () => {
                  await api.saveSubject({ name: String(form.get("name")) });
                  formEl.reset();
                  await load();
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
            <div className="mt-6 flex gap-2">
              <button type="button" className="h-11 rounded-xl bg-indigo px-4 text-white" onClick={() => setStep(7)}>
                Continue
              </button>
              <button type="button" className="h-11 rounded-xl bg-paper px-4" onClick={() => setStep(7)}>
                Skip
              </button>
            </div>
          </section>
        ) : null}

        {step === 7 ? (
          <section className="mt-8 rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Admission form</h2>
            <p className="mt-2 text-sm text-muted">Name the fields parents and staff will fill. We create the technical key from the name automatically.</p>
            <ul className="mt-4 space-y-2">
              {fields.map((field, index) => (
                <li key={`${field.key}-${index}`} className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <input
                    value={field.label}
                    onChange={(e) =>
                      setFields((rows) =>
                        rows.map((row, i) =>
                          i === index ? { ...row, label: e.target.value, key: admissionFieldKey(e.target.value) } : row,
                        ),
                      )
                    }
                    className="h-10 rounded-xl border border-line px-3"
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(field.required)}
                      onChange={(e) => setFields((rows) => rows.map((row, i) => (i === index ? { ...row, required: e.target.checked } : row)))}
                    />
                    Required
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-3 text-sm text-indigo"
              onClick={() => setFields((rows) => [...rows, fieldFromLabel("New field")])}
            >
              Add field
            </button>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="h-11 rounded-xl bg-indigo px-4 text-white"
                onClick={() =>
                  void run(async () => {
                    await api.saveAdmissionForm({ name: "Default admission form", fields });
                    setMessage("Admission form saved.");
                    setStep(8);
                  })
                }
              >
                Save and continue
              </button>
              <button type="button" className="h-11 rounded-xl bg-paper px-4" onClick={() => setStep(8)}>
                Skip
              </button>
            </div>
          </section>
        ) : null}

        {step === 8 ? (
          <section className="mt-8 rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Import existing students</h2>
            <div className="mt-3 space-y-2 text-sm text-muted">
              <p>Use this if the school already has a student list. You can skip and add students later from the Students page.</p>
              <p>1. Export or save the list as CSV, Excel, or JSON.</p>
              <p>2. Upload the file. We read the first sheet or the column headers.</p>
              <p>3. Match each admission form field to a column. Leave a field on Skip if that column is not in the file.</p>
              <p>4. Import. Students with the same admission number are ignored so you can retry safely.</p>
            </div>
            <div className="mt-5">
              <FileUpload
                label="Student file"
                accept=".csv,.json,.xlsx,.xls"
                hint="CSV, Excel, or JSON"
                fileName={importFileName}
                onFile={async (file) => {
                  setImportFileName(file.name);
                  const parsed = await parseImportFile(file);
                  setImportHeaders(parsed.headers);
                  setImportRows(parsed.rows);
                  const auto: Record<string, string> = {};
                  for (const field of fields) {
                    const hit = parsed.headers.find(
                      (h) => h.toLowerCase().replace(/\s+/g, "") === field.key.toLowerCase() || h.toLowerCase() === field.label.toLowerCase(),
                    );
                    if (hit) auto[field.key] = hit;
                  }
                  setMapping(auto);
                }}
              />
            </div>
            {importHeaders.length ? (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {fields.map((field) => (
                  <label key={field.key} className="text-sm">
                    {field.label}
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={(e) => setMapping((m) => ({ ...m, [field.key]: e.target.value }))}
                      className="mt-1 h-10 w-full rounded-xl border border-line px-3"
                    >
                      <option value="">Skip</option>
                      {importHeaders.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <button
                  type="button"
                  className="col-span-2 h-11 rounded-xl bg-ink text-white"
                  onClick={() =>
                    void run(async () => {
                      const result = await api.importStudents({ rows: importRows, mapping });
                      setMessage(`Imported ${result.count} students.`);
                    })
                  }
                >
                  Import {importRows.length} rows
                </button>
              </div>
            ) : null}
            <div className="mt-6 flex gap-2">
              <button type="button" className="h-11 rounded-xl bg-indigo px-4 text-white" onClick={() => setStep(9)}>
                Continue
              </button>
              <button type="button" className="h-11 rounded-xl bg-paper px-4" onClick={() => setStep(9)}>
                Skip
              </button>
            </div>
          </section>
        ) : null}

        {step === 9 ? (
          <section className="mt-8 rounded-3xl bg-surface p-6">
            <h2 className="font-display text-xl">Fee structure</h2>
            <p className="mt-2 text-sm text-muted">Edit amounts, remove a fee, or add picnic / event fees. You can finish this later from Fee structure.</p>
            <ul className="mt-4 space-y-2">
              {feeItems.map((item, index) => (
                <li key={`${item.name}-${index}`} className="flex items-center gap-2">
                  <input
                    value={item.name}
                    onChange={(e) => setFeeItems((rows) => rows.map((row, i) => (i === index ? { ...row, name: e.target.value } : row)))}
                    className="h-11 flex-1 rounded-xl border border-line px-3"
                  />
                  <input
                    type="number"
                    value={item.amountPkr}
                    onChange={(e) =>
                      setFeeItems((rows) => rows.map((row, i) => (i === index ? { ...row, amountPkr: Number(e.target.value) } : row)))
                    }
                    className="h-11 w-32 rounded-xl border border-line px-3"
                  />
                  <button type="button" className="text-sm text-danger" onClick={() => setFeeItems((rows) => rows.filter((_, i) => i !== index))}>
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="mt-3 text-sm text-indigo"
              onClick={() => setFeeItems((rows) => [...rows, { name: "New fee", amountPkr: 0, enabled: true }])}
            >
              Add fee
            </button>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                className="h-11 rounded-xl bg-indigo px-4 text-white"
                onClick={() =>
                  void run(async () => {
                    await api.saveFees({ items: feeItems });
                    await api.completeSetup();
                    navigate("/");
                  })
                }
              >
                Save and finish
              </button>
              <button
                type="button"
                className="h-11 rounded-xl bg-paper px-4"
                onClick={() =>
                  void run(async () => {
                    await api.completeSetup();
                    navigate("/");
                  })
                }
              >
                Skip and finish
              </button>
            </div>
          </section>
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
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-xl border border-line px-3"
      />
    </label>
  );
}
