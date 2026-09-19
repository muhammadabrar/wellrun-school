import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
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
import { api } from "../lib/api";
import { queryKeys } from "../lib/query";
import { useCampus } from "@/hooks/use-campus";
import { classSortIndex } from "@wellrun/shared";

export function AdmissionPage() {
  const navigate = useNavigate();
  const { data: guardians = [] } = useQuery({ queryKey: queryKeys.guardians, queryFn: () => api.guardians() });
  const { classes, campusId, active, currentYear } = useCampus();
  const [kind, setKind] = useState<"new" | "existing">("new");
  const [mode, setMode] = useState<"existing" | "new">("new");
  const [guardianId, setGuardianId] = useState("");
  const [guardianSearch, setGuardianSearch] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentSearch, setStudentSearch] = useState("");
  const [className, setClassName] = useState("");
  const [section, setSection] = useState("");
  const [gender, setGender] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const studentsQuery = useQuery({
    queryKey: queryKeys.students({ q: studentSearch, campusId, page: 1, pageSize: 10 }),
    queryFn: () => api.students({ q: studentSearch, page: 1, pageSize: 10 }),
    enabled: kind === "existing" && studentSearch.trim().length >= 2 && Boolean(campusId),
    placeholderData: keepPreviousData,
  });

  const firstClass = useMemo(
    () => [...classes].sort((a, b) => a.name.localeCompare(b.name))[0],
    [classes],
  );
  const selectedClass = className || firstClass?.name || "";
  const selectedSection = section || firstClass?.section || "";
  const classNames = [...new Set(classes.map((cls) => cls.name))].sort(
    (a, b) => classSortIndex(a) - classSortIndex(b),
  );
  const sections = classes.filter((cls) => cls.name === selectedClass).map((cls) => cls.section);
  const matchedGuardians = guardians.filter((row) => {
    const hay = `${row.name} ${row.phone} ${row.cnic ?? ""}`.toLowerCase();
    return hay.includes(guardianSearch.toLowerCase());
  });
  const selectedStudent = studentsQuery.data?.items.find((row) => row.id === studentId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    if (!selectedClass || !selectedSection) {
      setError("Create a class first, then admit the student.");
      return;
    }
    if (kind === "existing" && !studentId) {
      setError("Search for a student and select them before placing in a class.");
      return;
    }
    if (kind === "new" && mode === "existing" && !guardianId) {
      setError("Select a guardian or switch to new guardian.");
      return;
    }
    try {
      setPending(true);
      const student = await api.admitStudent(
        kind === "existing"
          ? {
              studentId,
              className: selectedClass,
              section: selectedSection,
            }
          : {
              guardianId: mode === "existing" ? guardianId : undefined,
              guardian:
                mode === "new"
                  ? {
                      name: String(form.get("guardianName") || ""),
                      phone: String(form.get("guardianPhone") || ""),
                      cnic: String(form.get("guardianCnic") || ""),
                      relation: String(form.get("guardianRelation") || "Parent"),
                    }
                  : undefined,
              firstName: String(form.get("firstName") || ""),
              lastName: String(form.get("lastName") || ""),
              dateOfBirth: String(form.get("dateOfBirth") || ""),
              className: selectedClass,
              section: selectedSection,
              gender: gender || undefined,
              address: String(form.get("address") || ""),
              extra: { address: String(form.get("address") || "") },
            },
      );
      navigate(`/students/${student.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not admit student");
    } finally {
      setPending(false);
    }
  }

  if (!classes.length) {
    return (
      <div className="max-w-4xl">
        <PageHeader title="Quick admission" description="Confirm a student in one step." />
        <div className="mt-6">
          <EmptyState
            title="No classes on this campus"
            description="Add a class before using quick admission. Campus and year come from the switcher."
            action={<Button render={<Link to="/academics" />}>Open classes</Button>}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Quick admission"
        description={`Confirm a student in one step for ${active?.name ?? "this campus"}${currentYear ? ` · ${currentYear.name}` : ""}. For documents and fee quotes, use the full application.`}
      />
      <p className="mt-2 text-sm text-muted-foreground">
        <Link to="/admissions/new" className="text-primary">
          Open the full application
        </Link>
      </p>
      {error ? (
        <div className="mt-4">
          <ErrorState title="Could not admit this student" description={error} />
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-6">
        <ToggleGroup
          variant="outline"
          value={[kind]}
          onValueChange={(value) => {
            const next = (value[0] as typeof kind) || "new";
            setKind(next);
            setStudentId("");
            setError(null);
          }}
        >
          <ToggleGroupItem value="new" className="flex-1">
            New student
          </ToggleGroupItem>
          <ToggleGroupItem value="existing" className="flex-1">
            Existing student
          </ToggleGroupItem>
        </ToggleGroup>

        {kind === "existing" ? (
          <Card>
            <CardHeader>
              <CardTitle>Existing student</CardTitle>
              <CardDescription>Search by name or admission number, then place them in a class.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="studentSearch">Search by name or ADM number</FieldLabel>
                  <Input
                    id="studentSearch"
                    value={studentSearch}
                    onChange={(event) => {
                      setStudentSearch(event.target.value);
                      setStudentId("");
                    }}
                    placeholder="Name or ADM number"
                  />
                </Field>
                {studentSearch.trim().length >= 2 && studentsQuery.isError ? (
                  <ErrorState
                    title="Could not search students"
                    description="Try again with a different name or admission number."
                    onRetry={() => void studentsQuery.refetch()}
                  />
                ) : null}
                {studentSearch.trim().length >= 2 && studentsQuery.isPending && !studentsQuery.data ? (
                  <LoadingState variant="list" />
                ) : null}
                <ul className="max-h-64 space-y-2 overflow-auto">
                  {(studentsQuery.data?.items ?? []).map((student) => (
                    <li key={student.id}>
                      <button
                        type="button"
                        onClick={() => setStudentId(student.id)}
                        className={`w-full rounded-lg px-4 py-3 text-left ${studentId === student.id ? "bg-primary text-primary-foreground" : "bg-muted"}`}
                      >
                        <span className="font-medium">
                          {student.firstName} {student.lastName}
                        </span>
                        <span className={`mt-1 block text-sm ${studentId === student.id ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                          {student.admissionNo}
                          {student.class ? ` · ${student.class.name} ${student.class.section}` : " · No current class"}
                        </span>
                      </button>
                    </li>
                  ))}
                  {studentSearch.trim().length >= 2 && !studentsQuery.isPending && !studentsQuery.data?.items.length ? (
                    <li className="text-sm text-muted-foreground">No students match that search.</li>
                  ) : null}
                  {studentSearch.trim().length < 2 ? (
                    <li className="text-sm text-muted-foreground">Type at least two characters to search.</li>
                  ) : null}
                </ul>
                {selectedStudent ? (
                  <p className="text-sm text-muted-foreground">
                    Selected {selectedStudent.firstName} {selectedStudent.lastName} ({selectedStudent.admissionNo}).
                  </p>
                ) : null}
              </FieldGroup>
            </CardContent>
          </Card>
        ) : (
          <>
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
                  <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="guardianName">Guardian name</FieldLabel>
                      <Input id="guardianName" name="guardianName" required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="guardianPhone">Guardian phone</FieldLabel>
                      <Input id="guardianPhone" name="guardianPhone" required />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="guardianCnic">Guardian CNIC</FieldLabel>
                      <Input id="guardianCnic" name="guardianCnic" />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="guardianRelation">Relation</FieldLabel>
                      <FormSelect
                        id="guardianRelation"
                        name="guardianRelation"
                        defaultValue="Parent"
                        options={[
                          { value: "Parent", label: "Parent" },
                          { value: "Mother", label: "Mother" },
                          { value: "Father", label: "Father" },
                          { value: "Guardian", label: "Guardian" },
                          { value: "Other", label: "Other" },
                        ]}
                      />
                    </Field>
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
                <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="firstName">First name</FieldLabel>
                    <Input id="firstName" name="firstName" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                    <Input id="lastName" name="lastName" required />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="dateOfBirth">Date of birth</FieldLabel>
                    <DatePicker id="dateOfBirth" name="dateOfBirth" required fromYear={1995} toYear={new Date().getFullYear()} />
                  </Field>
                  <Field>
                    <FieldLabel>Gender</FieldLabel>
                    <ToggleGroup variant="outline" value={gender ? [gender] : []} onValueChange={(value) => setGender(value[0] ?? "")}>
                      <ToggleGroupItem value="male">Male</ToggleGroupItem>
                      <ToggleGroupItem value="female">Female</ToggleGroupItem>
                    </ToggleGroup>
                  </Field>
                  <Field className="md:col-span-2">
                    <FieldLabel htmlFor="address">Address</FieldLabel>
                    <Input id="address" name="address" />
                  </Field>
                </FieldGroup>
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Class placement</CardTitle>
            <CardDescription>Campus and year come from the switcher.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="className">Class</FieldLabel>
                <FormSelect
                  id="className"
                  value={selectedClass || undefined}
                  onValueChange={(value) => {
                    const nextName = value ?? "";
                    setClassName(nextName);
                    const next = classes.find((cls) => cls.name === nextName);
                    setSection(next?.section ?? "A");
                  }}
                  options={classNames.map((name) => ({ value: name, label: name }))}
                  placeholder="Select class"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="section">Section</FieldLabel>
                <FormSelect
                  id="section"
                  value={selectedSection || undefined}
                  onValueChange={(value) => setSection(value ?? "")}
                  options={sections.map((name) => ({ value: name, label: name }))}
                  placeholder="Select section"
                  required
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button type="submit" loading={pending} icon={<UserPlus data-icon="inline-start" />}>
            {kind === "existing" ? "Place in class" : "Admit student"}
          </Button>
          <Button variant="outline" render={<Link to="/students" />}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
