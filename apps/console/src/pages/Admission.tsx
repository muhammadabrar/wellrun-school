import { useQuery } from "@tanstack/react-query";
import { classSortIndex } from "@wellrun/shared";
import { LoadingState, PageHeader } from "@wellrun/ui";
import { UserPlus } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { api, type AdmissionField } from "../lib/api";
import { queryKeys } from "../lib/query";

export function AdmissionPage() {
  const navigate = useNavigate();
  const { data } = useQuery({ queryKey: queryKeys.admission, queryFn: api.admission });
  const { data: guardians = [] } = useQuery({ queryKey: queryKeys.guardians, queryFn: () => api.guardians() });
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [guardianId, setGuardianId] = useState("");
  const [guardianSearch, setGuardianSearch] = useState("");
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const fields = data?.fields ?? [];
  const firstClass = useMemo(
    () => [...(data?.classes ?? [])].sort((a, b) => a.name.localeCompare(b.name))[0],
    [data],
  );
  const selectedClass = className || firstClass?.name || "";
  const selectedSection = section || firstClass?.section || "";
  const guardianFields = fields.filter((field) => field.group === "guardian");
  const studentFields = fields.filter((field) => field.group === "student");
  const classNames = [...new Set((data?.classes ?? []).map((cls) => cls.name))].sort(
    (a, b) => classSortIndex(a) - classSortIndex(b),
  );
  const sections = (data?.classes ?? []).filter((cls) => cls.name === selectedClass).map((cls) => cls.section);
  const matchedGuardians = guardians.filter((row) => {
    const hay = `${row.name} ${row.phone} ${row.cnic ?? ""}`.toLowerCase();
    return hay.includes(guardianSearch.toLowerCase());
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    setMessage(null);
    if (mode === "existing" && !guardianId) {
      setError("Select a guardian or switch to new guardian.");
      return;
    }
    if (!selectedClass || !selectedSection) {
      setError("Create a class first, then admit the student.");
      return;
    }
    const extra: Record<string, string> = {};
    const guardianExtra: Record<string, string> = {};
    for (const field of fields) {
      if (["firstName", "lastName", "dateOfBirth", "className", "section", "gender", "guardianName", "guardianPhone", "guardianCnic", "guardianRelation"].includes(field.key)) {
        continue;
      }
      const value = String(form.get(field.key) ?? "");
      if (field.group === "guardian") guardianExtra[field.key] = value;
      else extra[field.key] = value;
    }
    try {
      setPending(true);
      const student = await api.admitStudent({
        guardianId: mode === "existing" ? guardianId : undefined,
        guardian:
          mode === "new"
            ? {
                name: String(form.get("guardianName") || ""),
                phone: String(form.get("guardianPhone") || ""),
                cnic: String(form.get("guardianCnic") || ""),
                relation: String(form.get("guardianRelation") || "Parent"),
                extra: guardianExtra,
              }
            : undefined,
        firstName: String(form.get("firstName") || ""),
        lastName: String(form.get("lastName") || ""),
        dateOfBirth: String(form.get("dateOfBirth") || ""),
        className: selectedClass,
        section: selectedSection,
        gender: String(form.get("gender") || "") || undefined,
        extra,
        guardianExtra,
      });
      setMessage(`${student.firstName} admitted. Roll no. ${student.rollNo} assigned.`);
      navigate(`/students/${student.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not admit student");
    } finally {
      setPending(false);
    }
  }

  if (!data) return <LoadingState variant="form" />;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Quick admission"
        description="Confirm a student in one step. For documents, assessment, and fees, use the full application."
      />
      <p className="mt-2 text-sm text-muted-foreground">
        <Link to="/admissions/new" className="text-primary">
          Open the full application
        </Link>
      </p>
      {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
      {message ? <p className="mt-4 text-sm text-primary">{message}</p> : null}

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Guardian</CardTitle>
              <CardDescription>Link an existing family or add a new guardian.</CardDescription>
            </div>
            <ToggleGroup variant="outline" value={[mode]} onValueChange={(value) => setMode((value[0] as typeof mode) || "new")}>
              <ToggleGroupItem value="new">New guardian</ToggleGroupItem>
              <ToggleGroupItem value="existing">Existing guardian</ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            {mode === "existing" ? (
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="guardianSearch">Search by name, phone, or CNIC</FieldLabel>
                  <Input
                    id="guardianSearch"
                    value={guardianSearch}
                    onChange={(event) => setGuardianSearch(event.target.value)}
                    placeholder="Name, phone, or CNIC"
                  />
                </Field>
                <ul className="max-h-64 space-y-2 overflow-auto">
                  {matchedGuardians.map((guardian) => (
                    <li key={guardian.id}>
                      <button
                        type="button"
                        onClick={() => setGuardianId(guardian.id)}
                        className={`w-full rounded-lg px-4 py-3 text-left ${guardianId === guardian.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >
                        <span className="font-medium">{guardian.name}</span>
                        <span className={`mt-1 block text-sm ${guardianId === guardian.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {guardian.relation} · {guardian.phone}
                          {guardian.cnic ? ` · ${guardian.cnic}` : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                  {!matchedGuardians.length ? <li className="text-sm text-muted-foreground">No guardians match that search.</li> : null}
                </ul>
              </FieldGroup>
            ) : (
              <FieldGroup className="grid grid-cols-2">
                {guardianFields.map((field) => (
                  <FormField key={field.key} field={field} />
                ))}
              </FieldGroup>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Student</CardTitle>
            <CardDescription>Roll number, admission date, and first admission date are assigned when you save.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid grid-cols-2">
              {studentFields.map((field) => {
                if (field.type === "class") {
                  return (
                    <Field key={field.key}>
                      <FieldLabel htmlFor="className">{field.label}</FieldLabel>
                      <FormSelect
                        id="className"
                        value={selectedClass || undefined}
                        onValueChange={(value) => {
                          const nextName = value ?? "";
                          setClassName(nextName);
                          const next = (data.classes ?? []).find((cls) => cls.name === nextName);
                          setSection(next?.section ?? "A");
                        }}
                        options={classNames.map((name) => ({ value: name, label: name }))}
                        placeholder="Select class"
                        required={field.required}
                      />
                    </Field>
                  );
                }
                if (field.type === "section") {
                  return (
                    <Field key={field.key}>
                      <FieldLabel htmlFor="section">{field.label}</FieldLabel>
                      <FormSelect
                        id="section"
                        value={selectedSection || undefined}
                        onValueChange={(value) => setSection(value ?? "")}
                        options={sections.map((name) => ({ value: name, label: name }))}
                        placeholder="Select section"
                        required={field.required}
                      />
                    </Field>
                  );
                }
                return <FormField key={field.key} field={field} />;
              })}
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" loading={pending} icon={<UserPlus data-icon="inline-start" />}>
            Admit student
          </Button>
          <Button variant="outline" render={<Link to="/students" />}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function FormField({ field }: { field: AdmissionField }) {
  if (field.type === "select" || field.key === "gender") {
    return (
      <Field>
        <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
        <FormSelect
          id={field.key}
          name={field.key}
          required={field.required}
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
            { value: "other", label: "Other" },
          ]}
        />
      </Field>
    );
  }
  if (field.key === "guardianRelation") {
    return (
      <Field>
        <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
        <FormSelect
          id={field.key}
          name={field.key}
          defaultValue="Mother"
          required={field.required}
          options={[
            { value: "Mother", label: "Mother" },
            { value: "Father", label: "Father" },
            { value: "Guardian", label: "Guardian" },
            { value: "Other", label: "Other" },
          ]}
        />
      </Field>
    );
  }
  if (field.type === "date") {
    return (
      <Field>
        <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
        <DatePicker id={field.key} name={field.key} required={field.required} />
      </Field>
    );
  }
  return (
    <Field>
      <FieldLabel htmlFor={field.key}>{field.label}</FieldLabel>
      <Input id={field.key} name={field.key} required={field.required} />
    </Field>
  );
}
