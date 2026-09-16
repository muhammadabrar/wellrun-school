import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowLeftIcon, ArrowRightIcon, PlusIcon } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { WizardStepper } from "@/components/admissions/wizard-stepper";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCampus } from "@/hooks/use-campus";
import { api, type AdmissionDetail, type Guardian } from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { fileToDataUrl } from "@/lib/setup-helpers";

const steps = [
  { id: 1, label: "Applicant" },
  { id: 2, label: "Applying for" },
  { id: 3, label: "Previous school" },
  { id: 4, label: "Family" },
  { id: 5, label: "Assessment" },
  { id: 6, label: "Documents" },
  { id: 7, label: "Review" },
];

export function AdmissionWizardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const existingId = params.get("id");
  const returningId = params.get("studentId") ?? "";
  const draftQuery = useQuery({
    queryKey: ["admissions", "draft-create", returningId] as const,
    queryFn: () => api.createAdmission(returningId ? { studentId: returningId } : {}),
    enabled: !existingId,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const id = existingId || draftQuery.data?.id || null;
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(draftQuery.error instanceof Error ? draftQuery.error.message : null);
  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.admissionApplication(id ?? ""),
    queryFn: () => api.admissionApplication(id!),
    enabled: Boolean(id),
  });
  const { data: guardians = [] } = useQuery({ queryKey: queryKeys.guardians, queryFn: () => api.guardians() });

  if (!data) {
    if (isError || draftQuery.isError) {
      return <ErrorState title="Could not open the application" description="Try starting a new application." onRetry={() => void refetch()} />;
    }
    return <LoadingState variant="form" />;
  }

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={data.studentId ? "Re-admission" : "New application"}
        description={`${data.applicationNo} · saved as you go`}
      />
      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Could not save this step</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <WizardStepper steps={steps} current={step} onSelect={setStep} />
      <WizardStep
        step={step}
        application={data}
        guardians={guardians}
        onSaved={(next) => queryClient.setQueryData(queryKeys.admissionApplication(next.id), next)}
        onError={setError}
        onNext={() => setStep((value) => Math.min(7, value + 1))}
        onBack={() => setStep((value) => Math.max(1, value - 1))}
        onSubmitted={() => navigate(`/admissions/${data.id}`)}
      />
    </div>
  );
}

function WizardStep({
  step,
  application,
  guardians,
  onSaved,
  onError,
  onNext,
  onBack,
  onSubmitted,
}: {
  step: number;
  application: AdmissionDetail;
  guardians: Guardian[];
  onSaved: (value: AdmissionDetail) => void;
  onError: (value: string | null) => void;
  onNext: () => void;
  onBack: () => void;
  onSubmitted: () => void;
}) {
  const { campusId: selectedCampusId } = useCampus();
  const [pending, setPending] = useState(false);
  const [guardianSearch, setGuardianSearch] = useState("");
  const [gender, setGender] = useState(application.gender || "");
  const [studentType, setStudentType] = useState(application.studentType || "new");
  const [assessmentMode, setAssessmentMode] = useState(application.assessmentMode || "NONE");
  const [scores, setScores] = useState(
    application.scores.length ? application.scores : [{ subject: "English", maxMarks: 50, obtainedMarks: 0 }],
  );
  const classNames = [...new Set(application.classes.map((cls) => cls.name))];
  const matchedGuardians = guardians.filter((row) => {
    const hay = `${row.name} ${row.phone} ${row.cnic ?? ""}`.toLowerCase();
    return hay.includes(guardianSearch.toLowerCase());
  });
  const current = steps.find((item) => item.id === step);

  async function save(payload: Record<string, unknown>) {
    onError(null);
    setPending(true);
    try {
      const next = await api.patchAdmission(application.id, payload);
      onSaved(next);
      return next;
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save");
      throw err;
    } finally {
      setPending(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    );
    if (step === 4) {
      payload.family = {
        guardianName: String(form.get("guardianName") || ""),
        guardianPhone: String(form.get("guardianPhone") || ""),
        guardianCnic: String(form.get("guardianCnic") || ""),
        guardianRelation: String(form.get("guardianRelation") || "Parent"),
        guardianOccupation: String(form.get("guardianOccupation") || ""),
      };
      if (form.get("guardianId")) payload.guardianId = String(form.get("guardianId"));
    }
    if (step === 5) {
      payload.scores = scores;
      payload.assessmentMode = assessmentMode || "NONE";
    }
    await save(payload);
    if (step < 7) onNext();
  }

  async function submitApplication() {
    setPending(true);
    onError(null);
    try {
      await api.admissionAction(application.id, "submit");
      onSubmitted();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setPending(false);
    }
  }

  const dateOfBirth = application.dateOfBirth ? String(application.dateOfBirth).slice(0, 10) : "";

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-6">
      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>{current?.label}</CardTitle>
            <CardDescription>Name, gender, and identity for this child.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="firstName">First name</FieldLabel>
                <Input id="firstName" name="firstName" defaultValue={application.firstName} required />
              </Field>
              <Field>
                <FieldLabel htmlFor="lastName">Last name</FieldLabel>
                <Input id="lastName" name="lastName" defaultValue={application.lastName} required />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel>Gender</FieldLabel>
                <input type="hidden" name="gender" value={gender} />
                <FieldContent>
                  <ToggleGroup variant="outline" value={gender ? [gender] : []} onValueChange={(value) => setGender(value[0] ?? "")}>
                    <ToggleGroupItem value="male">Male</ToggleGroupItem>
                    <ToggleGroupItem value="female">Female</ToggleGroupItem>
                  </ToggleGroup>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="dateOfBirth">Date of birth</FieldLabel>
                <DatePicker id="dateOfBirth" name="dateOfBirth" defaultValue={dateOfBirth} required fromYear={1995} toYear={new Date().getFullYear()} />
              </Field>
              <Field>
                <FieldLabel htmlFor="cnic">B-form / CNIC</FieldLabel>
                <Input id="cnic" name="cnic" defaultValue={application.cnic} />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="address">Address</FieldLabel>
                <Input id="address" name="address" defaultValue={application.address} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}
      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>{current?.label}</CardTitle>
            <CardDescription>Campus, year, and class this application is for.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="yearId">Academic year</FieldLabel>
                <FormSelect
                  id="yearId"
                  name="yearId"
                  defaultValue={application.yearId}
                  options={application.years.map((year) => ({ value: year.id, label: year.name }))}
                  placeholder="Select year"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="campusId">Campus</FieldLabel>
                <FormSelect
                  id="campusId"
                  name="campusId"
                  defaultValue={application.campusId ?? selectedCampusId}
                  options={application.campuses.map((campus) => ({ value: campus.id, label: campus.name }))}
                  placeholder="Select campus"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="className">Grade</FieldLabel>
                <FormSelect
                  id="className"
                  name="className"
                  defaultValue={application.className || undefined}
                  options={classNames.map((name) => ({ value: name, label: name }))}
                  placeholder="Select grade"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="section">Section</FieldLabel>
                <Input id="section" name="section" defaultValue={application.section || "A"} />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel>Student type</FieldLabel>
                <input type="hidden" name="studentType" value={studentType} />
                <ToggleGroup variant="outline" value={[studentType]} onValueChange={(value) => setStudentType(value[0] ?? "new")}>
                  <ToggleGroupItem value="new" className="flex-1">
                    New
                  </ToggleGroupItem>
                  <ToggleGroupItem value="transfer" className="flex-1">
                    Transfer
                  </ToggleGroupItem>
                  <ToggleGroupItem value="returning" className="flex-1">
                    Returning
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}
      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>{current?.label}</CardTitle>
            <CardDescription>Optional if this is a first-time admission.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="previousSchool">Previous school</FieldLabel>
                <Input id="previousSchool" name="previousSchool" defaultValue={application.previousSchool} />
              </Field>
              <Field>
                <FieldLabel htmlFor="previousClass">Previous class</FieldLabel>
                <Input id="previousClass" name="previousClass" defaultValue={application.previousClass} />
              </Field>
              <Field>
                <FieldLabel htmlFor="previousYear">Previous year</FieldLabel>
                <Input id="previousYear" name="previousYear" defaultValue={application.previousYear} />
              </Field>
              <Field>
                <FieldLabel htmlFor="previousResult">Result</FieldLabel>
                <Input id="previousResult" name="previousResult" defaultValue={application.previousResult} />
              </Field>
              <Field>
                <FieldLabel htmlFor="previousPct">Percentage</FieldLabel>
                <Input id="previousPct" name="previousPct" defaultValue={application.previousPct} />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="transferNotes">Transfer notes</FieldLabel>
                <Textarea id="transferNotes" name="transferNotes" defaultValue={application.transferNotes} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}
      {step === 4 ? (
        <Card>
          <CardHeader>
            <CardTitle>{current?.label}</CardTitle>
            <CardDescription>Link an existing guardian or add a new one.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="guardianSearch">Search existing guardians</FieldLabel>
                <Input
                  id="guardianSearch"
                  value={guardianSearch}
                  onChange={(event) => setGuardianSearch(event.target.value)}
                  placeholder="Name, phone, or CNIC"
                />
                <FieldDescription>Matches appear below. Selecting one fills the family record.</FieldDescription>
              </Field>
              {guardianSearch && matchedGuardians.length ? (
                <FieldSet>
                  <FieldLegend variant="label">Matches</FieldLegend>
                  <FieldGroup>
                    <RadioGroup name="guardianId" defaultValue={application.guardianId ?? undefined}>
                      {matchedGuardians.slice(0, 6).map((guardian) => (
                        <Field key={guardian.id} orientation="horizontal">
                          <RadioGroupItem value={guardian.id} id={`guardian-${guardian.id}`} />
                          <FieldLabel htmlFor={`guardian-${guardian.id}`}>
                            {guardian.name} · {guardian.phone}
                            {guardian._count?.students ? ` · ${guardian._count.students} children` : ""}
                          </FieldLabel>
                        </Field>
                      ))}
                    </RadioGroup>
                  </FieldGroup>
                </FieldSet>
              ) : null}
              <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="guardianName">Guardian name</FieldLabel>
                  <Input id="guardianName" name="guardianName" defaultValue={application.family.guardianName || application.guardian?.name || ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="guardianPhone">Guardian phone</FieldLabel>
                  <Input id="guardianPhone" name="guardianPhone" defaultValue={application.family.guardianPhone || application.guardian?.phone || ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="guardianCnic">Guardian CNIC</FieldLabel>
                  <Input id="guardianCnic" name="guardianCnic" defaultValue={application.family.guardianCnic || application.guardian?.cnic || ""} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="guardianRelation">Relation</FieldLabel>
                  <FormSelect
                    id="guardianRelation"
                    name="guardianRelation"
                    defaultValue={application.family.guardianRelation || application.guardian?.relation || "Parent"}
                    options={[
                      { value: "Parent", label: "Parent" },
                      { value: "Mother", label: "Mother" },
                      { value: "Father", label: "Father" },
                      { value: "Guardian", label: "Guardian" },
                      { value: "Other", label: "Other" },
                    ]}
                  />
                </Field>
                <Field className="md:col-span-2">
                  <FieldLabel htmlFor="guardianOccupation">Occupation</FieldLabel>
                  <Input id="guardianOccupation" name="guardianOccupation" defaultValue={application.family.guardianOccupation || ""} />
                </Field>
              </FieldGroup>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}
      {step === 5 ? (
        <Card>
          <CardHeader>
            <CardTitle>{current?.label}</CardTitle>
            <CardDescription>Record a test, interview, or skip this step.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Assessment</FieldLabel>
                <input type="hidden" name="assessmentMode" value={assessmentMode} />
                <ToggleGroup
                  variant="outline"
                  value={[assessmentMode]}
                  onValueChange={(value) => {
                    const next = value[0];
                    if (next === "NONE" || next === "TEST" || next === "INTERVIEW" || next === "BOTH") {
                      setAssessmentMode(next);
                    }
                  }}
                >
                  <ToggleGroupItem value="NONE" className="flex-1">
                    None
                  </ToggleGroupItem>
                  <ToggleGroupItem value="TEST" className="flex-1">
                    Test
                  </ToggleGroupItem>
                  <ToggleGroupItem value="INTERVIEW" className="flex-1">
                    Interview
                  </ToggleGroupItem>
                  <ToggleGroupItem value="BOTH" className="flex-1">
                    Both
                  </ToggleGroupItem>
                </ToggleGroup>
              </Field>
              {scores.map((score, index) => (
                <FieldGroup key={index} className="grid grid-cols-3">
                  <Field>
                    <FieldLabel htmlFor={`score-subject-${index}`}>Subject</FieldLabel>
                    <Input
                      id={`score-subject-${index}`}
                      name={`score-subject-${index}`}
                      defaultValue={score.subject}
                      onChange={(event) => setScores((rows) => rows.map((row, i) => (i === index ? { ...row, subject: event.target.value } : row)))}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`score-max-${index}`}>Max</FieldLabel>
                    <Input
                      id={`score-max-${index}`}
                      name={`score-max-${index}`}
                      type="number"
                      defaultValue={String(score.maxMarks)}
                      onChange={(event) =>
                        setScores((rows) => rows.map((row, i) => (i === index ? { ...row, maxMarks: Number(event.target.value) } : row)))
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor={`score-obtained-${index}`}>Obtained</FieldLabel>
                    <Input
                      id={`score-obtained-${index}`}
                      name={`score-obtained-${index}`}
                      type="number"
                      defaultValue={String(score.obtainedMarks)}
                      onChange={(event) =>
                        setScores((rows) =>
                          rows.map((row, i) => (i === index ? { ...row, obtainedMarks: Number(event.target.value) } : row)),
                        )
                      }
                    />
                  </Field>
                </FieldGroup>
              ))}
              <Button type="button" variant="outline" onClick={() => setScores((rows) => [...rows, { subject: "", maxMarks: 50, obtainedMarks: 0 }])}>
                <PlusIcon data-icon="inline-start" />
                Add subject
              </Button>
              <Field>
                <FieldLabel htmlFor="interviewer">Interviewer</FieldLabel>
                <Input id="interviewer" name="interviewer" defaultValue={application.interviewer} />
              </Field>
              <Field>
                <FieldLabel htmlFor="interviewNotes">Interview notes</FieldLabel>
                <Textarea id="interviewNotes" name="interviewNotes" defaultValue={application.interviewNotes} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      ) : null}
      {step === 6 ? <DocumentsStep application={application} onSaved={onSaved} onError={onError} /> : null}
      {step === 7 ? (
        <Card>
          <CardHeader>
            <CardTitle>{current?.label}</CardTitle>
            <CardDescription>Check the file, then submit for review.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p>
              {application.firstName} {application.lastName} applying to {application.className || "an unselected class"}.
            </p>
            <p className="text-sm text-muted-foreground">
              Guardian: {application.guardian?.name || application.family.guardianName || "Not added"}
            </p>
            <p className="text-sm text-muted-foreground">Assessment: {application.assessmentMode.toLowerCase()}</p>
            <Duplicates application={application} />
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={step === 1}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        {step < 7 ? (
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Save and continue
            {pending ? null : <ArrowRightIcon data-icon="inline-end" />}
          </Button>
        ) : (
          <Button type="button" disabled={pending} onClick={() => void submitApplication()}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Submit application
          </Button>
        )}
      </div>
    </form>
  );
}

function DocumentsStep({
  application,
  onSaved,
  onError,
}: {
  application: AdmissionDetail;
  onSaved: (value: AdmissionDetail) => void;
  onError: (value: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>Upload required files now or come back after review.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {application.documents.map((doc) => (
          <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3">
            <div>
              <p className="font-medium">{doc.label}</p>
              <p className="text-sm text-muted-foreground">
                {doc.required ? "Required" : "Optional"} · {doc.url ? "Uploaded" : "Pending"}
              </p>
            </div>
            <Input
              type="file"
              accept="image/*,application/pdf"
              className="max-w-56"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                try {
                  const dataUrl = await fileToDataUrl(file);
                  const next = await api.uploadAdmissionDocument(application.id, {
                    kind: doc.kind,
                    label: doc.label,
                    required: doc.required,
                    dataUrl,
                  });
                  onSaved(next);
                } catch (err) {
                  onError(err instanceof Error ? err.message : "Could not upload");
                }
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Duplicates({ application }: { application: AdmissionDetail }) {
  const query = useMemo(
    () => ({
      cnic: application.cnic,
      firstName: application.firstName,
      lastName: application.lastName,
      dateOfBirth: application.dateOfBirth ? String(application.dateOfBirth).slice(0, 10) : "",
      guardianPhone: application.family.guardianPhone || application.guardian?.phone,
    }),
    [application],
  );
  const { data } = useQuery({
    queryKey: queryKeys.admissionDuplicates(query),
    queryFn: () => api.admissionDuplicates(query),
    enabled: Boolean(application.firstName && application.lastName),
  });
  if (!data?.matches.length) return <p className="text-sm text-muted-foreground">No obvious duplicate records.</p>;
  return (
    <Alert>
      <AlertTitle>Possible matches</AlertTitle>
      <AlertDescription>
        Continue only if this is a different child.
        <ul className="mt-2 flex flex-col gap-1">
          {data.matches.map((match, index) => (
            <li key={index}>
              {match.reason}
              {match.student ? (
                <>
                  {" · "}
                  <Link to={`/students/${match.student.id}`}>{match.student.admissionNo}</Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
