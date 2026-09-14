import { fieldFromLabel } from "../lib/setup-helpers";
import type { AdmissionField } from "../lib/api";

export function AdmissionFieldsEditor({
  fields,
  onChange,
}: {
  fields: AdmissionField[];
  onChange: (fields: AdmissionField[]) => void;
}) {
  const guardian = fields.filter((field) => field.group === "guardian");
  const student = fields.filter((field) => field.group !== "guardian");

  function update(key: string, patch: Partial<AdmissionField>) {
    onChange(fields.map((field) => (field.key === key ? { ...field, ...patch } : field)));
  }

  return (
    <div className="space-y-6">
      <FieldGroup
        title="Guardian fields"
        hint="Name, phone, CNIC, and relation stay on every form."
        fields={guardian}
        onChange={update}
        onRemove={(key) => onChange(fields.filter((field) => field.key !== key))}
        onAdd={() => onChange([...fields, fieldFromLabel("New guardian field", false, "guardian")])}
        addLabel="Add guardian field"
      />
      <FieldGroup
        title="Student fields"
        hint="First name, last name, date of birth, class, and section stay on every form. Roll number and admission dates are filled automatically."
        fields={student}
        onChange={update}
        onRemove={(key) => onChange(fields.filter((field) => field.key !== key))}
        onAdd={() => onChange([...fields, fieldFromLabel("New student field")])}
        addLabel="Add student field"
      />
    </div>
  );
}

function FieldGroup({
  title,
  hint,
  fields,
  onChange,
  onRemove,
  onAdd,
  addLabel,
}: {
  title: string;
  hint: string;
  fields: AdmissionField[];
  onChange: (key: string, patch: Partial<AdmissionField>) => void;
  onRemove: (key: string) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <section>
      <h3 className="font-display text-lg">{title}</h3>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      <ul className="mt-3 space-y-2">
        {fields.map((field) => (
          <li key={field.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-2xl bg-paper px-3 py-2">
            <input
              value={field.label}
              onChange={(event) => onChange(field.key, { label: event.target.value })}
              className="h-10 rounded-xl border border-line px-3"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(field.required)}
                disabled={field.locked}
                onChange={(event) => onChange(field.key, { required: event.target.checked })}
              />
              Required
            </label>
            {field.locked ? (
              <span className="text-xs text-muted">Required field</span>
            ) : (
              <button type="button" className="text-sm text-danger" onClick={() => onRemove(field.key)}>
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
      <button type="button" className="mt-3 text-sm text-indigo" onClick={onAdd}>
        {addLabel}
      </button>
    </section>
  );
}
