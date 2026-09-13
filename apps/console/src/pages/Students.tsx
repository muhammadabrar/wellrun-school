import { admissionFieldKey } from "@wellrun/shared";
import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileUpload } from "../components/FileUpload";
import { api, type AdmissionField, type SchoolClass, type Student } from "../lib/api";
import { fieldFromLabel, parseImportFile } from "../lib/setup-helpers";

export function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<AdmissionField[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importFileName, setImportFileName] = useState("");

  function load() {
    api.students().then(setStudents);
    api.classes().then(setClasses);
    api.setup().then((next) => {
      const form = next.admissionForms[0];
      setFields(form?.fields?.length ? form.fields : next.templates.admissionFields);
    });
  }

  useEffect(() => {
    load();
  }, []);

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError(null);
    try {
      await api.createStudent({
        firstName: String(data.get("firstName")),
        lastName: String(data.get("lastName")),
        admissionNo: String(data.get("admissionNo")),
        gender: String(data.get("gender")),
        classId: String(data.get("classId") || "") || undefined,
        dateOfBirth: String(data.get("dateOfBirth") || "") || undefined,
        guardians: data.get("guardianName")
          ? [
              {
                name: String(data.get("guardianName")),
                phone: String(data.get("guardianPhone")),
                relation: String(data.get("relation") || "Parent"),
              },
            ]
          : [],
      });
      setOpen(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save student");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-4xl">Students</h1>
        <button type="button" onClick={() => setOpen((v) => !v)} className="h-11 rounded-xl bg-indigo px-4 font-medium text-white">
          Add student
        </button>
      </div>

      {open ? (
        <form onSubmit={onCreate} className="mt-6 grid grid-cols-3 gap-3 rounded-3xl bg-surface p-6">
          <input name="firstName" required placeholder="First name" className="h-11 rounded-xl border border-line px-3" />
          <input name="lastName" required placeholder="Last name" className="h-11 rounded-xl border border-line px-3" />
          <input name="admissionNo" required placeholder="Admission no." className="h-11 rounded-xl border border-line px-3" />
          <select name="gender" className="h-11 rounded-xl border border-line px-3">
            <option value="female">Female</option>
            <option value="male">Male</option>
          </select>
          <select name="classId" className="h-11 rounded-xl border border-line px-3">
            <option value="">No class yet</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name} {cls.section}
              </option>
            ))}
          </select>
          <input name="dateOfBirth" type="date" className="h-11 rounded-xl border border-line px-3" />
          <input name="guardianName" placeholder="Parent name" className="h-11 rounded-xl border border-line px-3" />
          <input name="guardianPhone" placeholder="Parent WhatsApp" className="h-11 rounded-xl border border-line px-3" />
          <input name="relation" placeholder="Relation" defaultValue="Mother" className="h-11 rounded-xl border border-line px-3" />
          {error ? <p className="col-span-3 text-sm text-danger">{error}</p> : null}
          <button type="submit" className="col-span-3 h-11 rounded-xl bg-ink text-white">
            Save student
          </button>
        </form>
      ) : null}

      <div className="mt-8 overflow-hidden rounded-3xl bg-surface">
        <table className="w-full text-left">
          <thead className="text-sm text-muted">
            <tr>
              <th className="px-5 py-3 font-medium">Admission no.</th>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Class</th>
              <th className="px-5 py-3 font-medium">Parent</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className="border-t border-line">
                <td className="px-5 py-4">{student.admissionNo}</td>
                <td className="px-5 py-4">
                  <Link className="text-indigo" to={`/students/${student.id}`}>
                    {student.firstName} {student.lastName}
                  </Link>
                </td>
                <td className="px-5 py-4 text-muted">
                  {student.enrollments[0]
                    ? `${student.enrollments[0].class.name} ${student.enrollments[0].class.section}`
                    : "—"}
                </td>
                <td className="px-5 py-4 text-muted">{student.guardians[0]?.guardian.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-10 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Admission form</h2>
        <p className="mt-2 text-sm text-muted">Field names become the keys used when you import a spreadsheet. You do not type keys yourself.</p>
        <ul className="mt-4 space-y-2">
          {fields.map((field, index) => (
            <li key={`${field.key}-${index}`} className="grid grid-cols-[1fr_auto] items-center gap-2">
              <input
                value={field.label}
                onChange={(e) =>
                  setFields((rows) =>
                    rows.map((row, i) => (i === index ? { ...row, label: e.target.value, key: admissionFieldKey(e.target.value) } : row)),
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
        <button type="button" className="mt-3 text-sm text-indigo" onClick={() => setFields((rows) => [...rows, fieldFromLabel("New field")])}>
          Add field
        </button>
        <button
          type="button"
          className="ml-4 mt-3 h-10 rounded-xl bg-indigo px-4 text-sm text-white"
          onClick={async () => {
            await api.saveAdmissionForm({ name: "Default admission form", fields });
            setImportMessage("Admission form saved.");
          }}
        >
          Save form
        </button>
      </section>

      <section className="mt-6 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Import students</h2>
        <div className="mt-2 space-y-2 text-sm text-muted">
          <p>Upload a CSV, Excel, or JSON file of existing students.</p>
          <p>Match each form field to a column. Skip anything that is not in the file. Duplicate admission numbers are ignored.</p>
        </div>
        {importMessage ? <p className="mt-3 text-sm text-indigo">{importMessage}</p> : null}
        <div className="mt-4">
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
              onClick={async () => {
                const result = await api.importStudents({ rows: importRows, mapping });
                setImportMessage(`Imported ${result.count} students.`);
                load();
              }}
            >
              Import {importRows.length} rows
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
