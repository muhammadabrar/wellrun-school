import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LoadingState } from "@wellrun/ui";
import { Button } from "@/components/ui/button";
import { normalizeAdmissionFields } from "@wellrun/shared";
import { Save, Upload } from "lucide-react";
import { useState } from "react";
import { AdmissionFieldsEditor } from "../components/AdmissionFieldsEditor";
import { FileUpload } from "../components/FileUpload";
import { FormSelect } from "@/components/form/form-select";
import { Field, FieldLabel } from "@/components/ui/field";
import { api, type AdmissionField } from "../lib/api";
import { queryKeys } from "../lib/query";
import { parseImportFile } from "../lib/setup-helpers";

export function AdmissionSettingsPage() {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: queryKeys.admissionForm,
    queryFn: api.admissionForm,
  });
  const [draft, setDraft] = useState<AdmissionField[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importFileName, setImportFileName] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const fields = draft ?? data?.fields ?? [];

  if (isPending && !data) return <LoadingState variant="form" />;

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-4xl">Admission settings</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage the campus admission form. Locked fields stay. Roll number and admission dates are set in the background.
      </p>
      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-indigo">{message}</p> : null}

      <section className="mt-8 rounded-3xl bg-surface p-6">
        <AdmissionFieldsEditor
          fields={fields}
          onChange={(next) => setDraft(normalizeAdmissionFields(next))}
        />
        <Button
          type="button"
          className="mt-6"
          loading={saving}
          icon={<Save size={18} />}
          onClick={async () => {
            setError(null);
            setSaving(true);
            try {
              await api.saveAdmissionForm({ name: "Default admission form", fields });
              await queryClient.invalidateQueries({ queryKey: queryKeys.admissionForm });
              await queryClient.invalidateQueries({ queryKey: queryKeys.admission });
              setDraft(null);
              setMessage("Admission form saved.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save form");
            } finally {
              setSaving(false);
            }
          }}
        >
          Save form
        </Button>
      </section>

      <section className="mt-6 rounded-3xl bg-surface p-6">
        <h2 className="font-display text-xl">Import students</h2>
        <div className="mt-2 space-y-2 text-sm text-muted-foreground">
          <p>Upload a CSV, Excel, or JSON file of existing students.</p>
          <p>Match each form field to a column. Skip anything that is not in the file.</p>
        </div>
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
                  (header) =>
                    header.toLowerCase().replace(/\s+/g, "") === field.key.toLowerCase() ||
                    header.toLowerCase() === field.label.toLowerCase(),
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
              <Field key={field.key}>
                <FieldLabel>{field.label}</FieldLabel>
                <FormSelect
                  value={mapping[field.key] || "skip"}
                  onValueChange={(value) => setMapping((current) => ({ ...current, [field.key]: value === "skip" || !value ? "" : value }))}
                  options={[
                    { value: "skip", label: "Skip" },
                    ...importHeaders.map((header) => ({ value: header, label: header })),
                  ]}
                />
              </Field>
            ))}
            <Button
              type="button"
              variant="secondary"
              className="col-span-2"
              loading={importing}
              icon={<Upload size={18} />}
              onClick={async () => {
                setImporting(true);
                try {
                  const result = await api.importStudents({ rows: importRows, mapping });
                  await queryClient.invalidateQueries({ queryKey: queryKeys.studentsRoot });
                  setMessage(`Imported ${result.count} students.`);
                } finally {
                  setImporting(false);
                }
              }}
            >
              Import {importRows.length} rows
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
