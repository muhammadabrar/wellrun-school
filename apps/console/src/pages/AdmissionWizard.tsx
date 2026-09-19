import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { WizardStepper } from "@/components/admissions/wizard-stepper";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useCampus } from "@/hooks/use-campus";
import { api, type AdmissionDetail, type AdmissionFeeQuote, type Guardian } from "@/lib/api";
import { pkr } from "@/lib/format";
import { queryKeys } from "@/lib/query";
import { fileToDataUrl } from "@/lib/setup-helpers";

const steps = [
  { id: 1, label: "Applicant" },
  { id: 2, label: "Applying for" },
  { id: 3, label: "Previous school" },
  { id: 4, label: "Documents" },
  { id: 5, label: "Fees" },
  { id: 6, label: "Review" },
];

export function AdmissionWizardPage() {
  const { id } = useParams();
  if (!id) return <NewApplicationPage />;
  return <ExistingApplicationPage id={id} />;
}

function NewApplicationPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returningId = params.get("studentId") ?? "";
  const { data: returning } = useQuery({
    queryKey: queryKeys.student(returningId),
    queryFn: () => api.student(returningId),
    enabled: Boolean(returningId),
  });
  const [error, setError] = useState<string | null>(null);
  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.createAdmission(payload),
    onSuccess: (application) => navigate(`/admissions/${application.id}`),
    onError: (err) => setError(err instanceof Error ? err.message : "Could not create the application"),
  });

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={returningId ? "Re-admission" : "New application"}
        description="Applicant and family first. Campus and year come from the switcher when you continue."
      />
      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Could not start this application</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <WizardStepper steps={steps} current={1} maxStep={1} onSelect={() => undefined} />
      <ApplicantFamilyForm
        application={returning ? returningToDraft(returning) : null}
        studentId={returningId}
        pending={createMutation.isPending}
        submitLabel="Create application"
        onSubmit={(payload) => {
          setError(null);
          createMutation.mutate(payload);
        }}
      />
    </div>
  );
}

function ExistingApplicationPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.admissionApplication(id),
    queryFn: () => api.admissionApplication(id),
  });
  const [step, setStep] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!data) {
    if (isError) {
      return (
        <ErrorState
          title="Could not open the application"
          description="Return to the admissions list and try again."
          onRetry={() => void refetch()}
        />
      );
    }
    return <LoadingState variant="form" />;
  }

  if (data.status === "ADMISSION_CONFIRMED" && data.student) {
    return <Navigate to={`/students/${data.student.id}`} replace />;
  }

  const reachable = reachableStep(data);
  const current = step ?? (reachable >= 6 && data.status !== "DRAFT" && data.status !== "SUBMITTED" ? 6 : data.wizardStep || 1);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={data.studentId ? "Re-admission" : "Application"}
        description={`${data.applicationNo} · saved as you go`}
      />
      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>Could not save this step</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <WizardStepper
        steps={steps}
        current={current}
        maxStep={reachable}
        onSelect={(next) => {
          if (next <= reachable) setStep(next);
        }}
      />
      <WizardStep
        step={current}
        application={data}
        onSaved={(next) => {
          queryClient.setQueryData(queryKeys.admissionApplication(next.id), next);
          setError(null);
        }}
        onError={setError}
        onNext={() => setStep(Math.min(6, current + 1))}
        onBack={() => setStep(Math.max(1, current - 1))}
        onLeft={() => {
          void queryClient.invalidateQueries({ queryKey: ["admissions"] });
          navigate("/admissions");
        }}
        onAdmitted={(studentId) => {
          void queryClient.invalidateQueries({ queryKey: ["admissions"] });
          void queryClient.invalidateQueries({ queryKey: queryKeys.studentsRoot });
          navigate(`/students/${studentId}`);
        }}
      />
    </div>
  );
}

function WizardStep({
  step,
  application,
  onSaved,
  onError,
  onNext,
  onBack,
  onLeft,
  onAdmitted,
}: {
  step: number;
  application: AdmissionDetail;
  onSaved: (value: AdmissionDetail) => void;
  onError: (value: string | null) => void;
  onNext: () => void;
  onBack: () => void;
  onLeft: () => void;
  onAdmitted: (studentId: string) => void;
}) {
  const { campusId: selectedCampusId, classes, campuses, currentYear } = useCampus();
  const [pending, setPending] = useState(false);
  const [studentType, setStudentType] = useState(application.studentType || "new");
  const [quotes, setQuotes] = useState<AdmissionFeeQuote[]>(application.feeQuotes ?? []);
  const [rejectOpen, setRejectOpen] = useState(false);
  const classNames = [...new Set(classes.map((cls) => cls.name))];
  const campusName = application.campus?.name || campuses.find((campus) => campus.id === (application.campusId || selectedCampusId))?.name || "Current campus";
  const yearName = application.year?.name || currentYear?.name || "Current year";
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
    if (step >= 6) return;
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(
      [...form.entries()].map(([key, value]) => [key, String(value)]),
    );
    if (step === 1) {
      const family = familyFromForm(form);
      payload.family = family;
      payload.guardianId = String(form.get("guardianId") || "").trim();
      if (!family.guardianName || !family.guardianPhone) {
        onError(payload.guardianId ? "Guardian details are missing from this record." : "Add a new guardian or select an existing one.");
        return;
      }
    }
    if (step === 5) payload.feeQuotes = quotes;
    payload.wizardStep = Math.min(6, step + 1);
    await save(payload);
    onNext();
  }

  async function runAction(action: "confirm" | "waitlist" | "reject") {
    setPending(true);
    onError(null);
    try {
      const next = await api.admissionAction(application.id, action);
      if ("deleted" in next) {
        onLeft();
        return;
      }
      if (action === "confirm" && next.student) {
        onAdmitted(next.student.id);
        return;
      }
      onSaved(next);
      if (action === "waitlist") onLeft();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not update the application");
    } finally {
      setPending(false);
      setRejectOpen(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-6">
      {step === 1 ? <ApplicantFamilyFields application={application} /> : null}
      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>{current?.label}</CardTitle>
            <CardDescription>Grade and section for this child. Campus and year come from the switcher.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
              <Field>
                <FieldLabel>Academic year</FieldLabel>
                <p className="text-sm">{yearName}</p>
              </Field>
              <Field>
                <FieldLabel>Campus</FieldLabel>
                <p className="text-sm">{campusName}</p>
              </Field>
              <Field>
                <FieldLabel htmlFor="className">Grade</FieldLabel>
                <FormSelect
                  id="className"
                  name="className"
                  defaultValue={application.className || undefined}
                  options={classNames.map((name) => ({ value: name, label: name }))}
                  placeholder="Select grade"
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="section">Section</FieldLabel>
                <Input id="section" name="section" defaultValue={application.section || "A"} required />
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
      {step === 4 ? <DocumentsStep application={application} onSaved={onSaved} onError={onError} /> : null}
      {step === 5 ? <FeesStep application={application} quotes={quotes} onQuotesChange={setQuotes} /> : null}
      {step === 6 ? (
        <Card>
          <CardHeader>
            <CardTitle>{current?.label}</CardTitle>
            <CardDescription>Check the file, then admit, waitlist, or reject. Payment is collected later on Fees.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p>
              {application.firstName} {application.lastName} applying to {application.className || "an unselected class"}
              {application.section ? ` ${application.section}` : ""}.
            </p>
            <p className="text-sm text-muted-foreground">
              {yearName} · {campusName} · {application.studentType || "new"}
            </p>
            <p className="text-sm text-muted-foreground">
              Guardian: {application.guardian?.name || application.family.guardianName || "Not added"} ·{" "}
              {application.guardian?.phone || application.family.guardianPhone || "No phone"}
            </p>
            {application.previousSchool ? (
              <p className="text-sm text-muted-foreground">Previous school: {application.previousSchool}</p>
            ) : null}
            <p className="text-sm text-muted-foreground">
              Documents: {application.documents.filter((doc) => doc.url).length} uploaded of {application.documents.length}
            </p>
            {application.feeQuotes.length ? (
              <ul className="text-sm text-muted-foreground">
                {application.feeQuotes.map((quote) => (
                  <li key={quote.feeItemId}>
                    {quote.name}: {pkr(quote.amountPkr)}
                    {quote.amountPkr !== quote.catalogAmountPkr ? ` (listed ${pkr(quote.catalogAmountPkr)})` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No fee quotes. Invoices will not be created until fees are quoted.</p>
            )}
            <Duplicates application={application} />
          </CardContent>
        </Card>
      ) : null}
      <div className="flex flex-wrap justify-between gap-3">
        <Button type="button" variant="outline" onClick={onBack} disabled={step === 1 || pending}>
          <ArrowLeftIcon data-icon="inline-start" />
          Back
        </Button>
        {step < 6 ? (
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Save and continue
            {pending ? null : <ArrowRightIcon data-icon="inline-end" />}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={pending} onClick={() => void runAction("confirm")}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Accept & admit
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => void runAction("waitlist")}>
              Waitlist
            </Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={() => setRejectOpen(true)}>
              Reject
            </Button>
          </div>
        )}
      </div>
      <Dialog
        open={rejectOpen}
        title="Reject this application?"
        description="This deletes the application and its documents. No student is created."
        confirmLabel="Delete application"
        danger
        loading={pending}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => void runAction("reject")}
      />
    </form>
  );
}

function ApplicantFamilyForm({
  application,
  studentId,
  pending,
  submitLabel,
  onSubmit,
}: {
  application: AdmissionDetail | ReturnType<typeof returningToDraft> | null;
  studentId?: string;
  pending: boolean;
  submitLabel: string;
  onSubmit: (payload: Record<string, unknown>) => void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const firstName = String(form.get("firstName") || "").trim();
    const lastName = String(form.get("lastName") || "").trim();
    const family = familyFromForm(form);
    if (!firstName || !lastName) return;
    if (!family.guardianName || !family.guardianPhone) {
      setFormError("Select an existing guardian, or switch to New guardian.");
      return;
    }
    setFormError(null);
    const payload: Record<string, unknown> = {
      firstName,
      lastName,
      gender: String(form.get("gender") || ""),
      dateOfBirth: String(form.get("dateOfBirth") || ""),
      cnic: String(form.get("cnic") || ""),
      address: String(form.get("address") || ""),
      family,
    };
    const guardianId = String(form.get("guardianId") || "").trim();
    if (guardianId) payload.guardianId = guardianId;
    if (studentId) payload.studentId = studentId;
    onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-6">
      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Could not start this application</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}
      <ApplicantFamilyFields application={application} />
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {submitLabel}
          {pending ? null : <ArrowRightIcon data-icon="inline-end" />}
        </Button>
      </div>
    </form>
  );
}

function ApplicantFamilyFields({
  application,
}: {
  application: AdmissionDetail | ReturnType<typeof returningToDraft> | null;
}) {
  const linkedGuardian = application && "guardian" in application ? application.guardian : null;
  const linkedGuardianId = application && "guardianId" in application ? application.guardianId : null;
  const [familyTab, setFamilyTab] = useState<"new" | "existing">("new");
  const [guardianSearch, setGuardianSearch] = useState("");
  const [selectedGuardianId, setSelectedGuardianId] = useState(linkedGuardianId ?? "");
  const [gender, setGender] = useState(application?.gender && application.gender !== "unspecified" ? application.gender : "");
  const debouncedSearch = useDebouncedValue(guardianSearch.trim(), 300);
  const canSearch = familyTab === "existing" && debouncedSearch.length >= 3;
  const guardiansQuery = useQuery({
    queryKey: queryKeys.guardianSearch(debouncedSearch),
    queryFn: () => api.guardians(debouncedSearch),
    enabled: canSearch,
    placeholderData: keepPreviousData,
  });
  const dateOfBirth = application?.dateOfBirth ? String(application.dateOfBirth).slice(0, 10) : "";
  const family = application && "family" in application ? application.family : {};
  const typedEnough = guardianSearch.trim().length >= 3;
  const matches = canSearch ? (guardiansQuery.data ?? []) : [];
  const waitingForSearch = typedEnough && (debouncedSearch !== guardianSearch.trim() || guardiansQuery.isFetching);
  const selectedGuardian =
    matches.find((guardian) => guardian.id === selectedGuardianId) ??
    (linkedGuardian && linkedGuardian.id === selectedGuardianId ? linkedGuardian : null);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Applicant</CardTitle>
          <CardDescription>Name, gender, and identity for this child.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="firstName">First name</FieldLabel>
              <Input id="firstName" name="firstName" defaultValue={application?.firstName ?? ""} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="lastName">Last name</FieldLabel>
              <Input id="lastName" name="lastName" defaultValue={application?.lastName ?? ""} required />
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
              <Input id="cnic" name="cnic" defaultValue={application?.cnic ?? ""} />
            </Field>
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="address">Address</FieldLabel>
              <Input id="address" name="address" defaultValue={application?.address ?? ""} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Family</CardTitle>
          <CardDescription>Add a new guardian or link one already in the school.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs
            value={familyTab}
            onValueChange={(next) => {
              const tab = next === "existing" ? "existing" : "new";
              setFamilyTab(tab);
              if (tab === "new") setSelectedGuardianId("");
            }}
          >
            <TabsList className="w-full">
              <TabsTrigger value="new">New guardian</TabsTrigger>
              <TabsTrigger value="existing">Existing guardian</TabsTrigger>
            </TabsList>
            <TabsContent value="new" className="mt-4">
              <NewGuardianFields family={family} application={application} />
            </TabsContent>
            <TabsContent value="existing" className="mt-4">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="guardianSearch">Search existing guardians</FieldLabel>
                  <Input
                    id="guardianSearch"
                    value={guardianSearch}
                    onChange={(event) => setGuardianSearch(event.target.value)}
                    placeholder="Name, phone, or CNIC"
                    autoComplete="off"
                  />
                  <FieldDescription>Type at least 3 characters. Matches appear after you pause typing.</FieldDescription>
                </Field>
                {selectedGuardian ? (
                  <>
                    <input type="hidden" name="guardianId" value={selectedGuardian.id} />
                    <input type="hidden" name="guardianName" value={selectedGuardian.name} />
                    <input type="hidden" name="guardianPhone" value={selectedGuardian.phone} />
                    <input type="hidden" name="guardianCnic" value={selectedGuardian.cnic ?? ""} />
                    <input type="hidden" name="guardianRelation" value={selectedGuardian.relation || "Parent"} />
                    <input type="hidden" name="guardianOccupation" value={selectedGuardian.occupation ?? family.guardianOccupation ?? ""} />
                  </>
                ) : null}
                {guardianSearch.trim().length < 3 ? (
                  <p className="text-sm text-muted-foreground">Enter at least 3 characters to search.</p>
                ) : waitingForSearch && !matches.length ? (
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                ) : guardiansQuery.isError ? (
                  <p className="text-sm text-destructive">Could not search guardians. Try again.</p>
                ) : canSearch && !matches.length ? (
                  <p className="text-sm text-muted-foreground">No guardians match "{debouncedSearch}".</p>
                ) : matches.length ? (
                  <RadioGroup
                    value={selectedGuardianId || undefined}
                    onValueChange={(value) => setSelectedGuardianId(value ?? "")}
                    className="gap-3"
                  >
                    {matches.slice(0, 8).map((guardian) => (
                      <FieldLabel key={guardian.id} htmlFor={`guardian-${guardian.id}`}>
                        <Field orientation="horizontal">
                          <FieldContent>
                            <FieldTitle>{guardian.name}</FieldTitle>
                            <FieldDescription>
                              {parentOfLabel(guardian.students)}
                              {guardian.phone ? ` · ${guardian.phone}` : ""}
                            </FieldDescription>
                          </FieldContent>
                          <RadioGroupItem value={guardian.id} id={`guardian-${guardian.id}`} />
                        </Field>
                      </FieldLabel>
                    ))}
                  </RadioGroup>
                ) : null}
              </FieldGroup>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </>
  );
}

function NewGuardianFields({
  family,
  application,
}: {
  family: Record<string, string>;
  application: AdmissionDetail | ReturnType<typeof returningToDraft> | null;
}) {
  return (
    <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
      <Field>
        <FieldLabel htmlFor="guardianName">Guardian name</FieldLabel>
        <Input
          id="guardianName"
          name="guardianName"
          required
          defaultValue={family.guardianName || (application && "guardian" in application ? application.guardian?.name : "") || ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="guardianPhone">Guardian phone</FieldLabel>
        <Input
          id="guardianPhone"
          name="guardianPhone"
          required
          defaultValue={family.guardianPhone || (application && "guardian" in application ? application.guardian?.phone : "") || ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="guardianCnic">Guardian CNIC</FieldLabel>
        <Input
          id="guardianCnic"
          name="guardianCnic"
          defaultValue={family.guardianCnic || (application && "guardian" in application ? application.guardian?.cnic : "") || ""}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="guardianRelation">Relation</FieldLabel>
        <FormSelect
          id="guardianRelation"
          name="guardianRelation"
          defaultValue={family.guardianRelation || (application && "guardian" in application ? application.guardian?.relation : "") || "Parent"}
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
        <Input id="guardianOccupation" name="guardianOccupation" defaultValue={family.guardianOccupation || ""} />
      </Field>
    </FieldGroup>
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
        <CardDescription>Every file is optional. Upload now or after the student is admitted.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {application.documents.length ? (
          application.documents.map((doc) => (
            <div key={doc.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted px-4 py-3">
              <div>
                <p className="font-medium">{doc.label}</p>
                <p className="text-sm text-muted-foreground">{doc.url ? "Uploaded" : "Optional"}</p>
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
                      required: false,
                      dataUrl,
                    });
                    onSaved(next);
                  } catch (err) {
                    onError(err instanceof Error ? err.message : "Could not upload");
                  }
                }}
              />
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">Document slots appear after the application is created.</p>
        )}
      </CardContent>
    </Card>
  );
}

function FeesStep({
  application,
  quotes,
  onQuotesChange,
}: {
  application: AdmissionDetail;
  quotes: AdmissionFeeQuote[];
  onQuotesChange: (quotes: AdmissionFeeQuote[]) => void;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.feeStructure,
    queryFn: api.feeStructure,
  });
  const siblingFeesQuery = useQuery({
    queryKey: queryKeys.admissionSiblingFees(application.id),
    queryFn: () => api.admissionSiblingFees(application.id),
    enabled: Boolean(application.guardianId || application.family.guardianPhone || application.family.guardianCnic),
  });
  const siblings = siblingFeesQuery.data?.siblings ?? [];

  const items = (data?.feeItems ?? []).filter((item) => item.enabled !== false && item.id);
  useEffect(() => {
    if (!data) return;
    onQuotesChange(
      items.map((item) => {
        const saved = application.feeQuotes.find((quote) => quote.feeItemId === item.id);
        return {
          feeItemId: item.id,
          name: item.name,
          catalogAmountPkr: item.amountPkr,
          amountPkr: saved?.amountPkr ?? item.amountPkr,
        };
      }),
    );
    // Sync catalog rows once the fee structure loads. Edits are kept in parent state after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  if (isPending && !data) return <LoadingState variant="form" />;
  if (isError) {
    return (
      <ErrorState
        title="Could not load fee structure"
        description="Open Fee structure to add items, then try again."
        onRetry={() => void refetch()}
      />
    );
  }

  const rows = items.map((item) => {
    const current = quotes.find((quote) => quote.feeItemId === item.id);
    const saved = application.feeQuotes.find((quote) => quote.feeItemId === item.id);
    return {
      feeItemId: item.id,
      name: item.name,
      catalogAmountPkr: item.amountPkr,
      amountPkr: current?.amountPkr ?? saved?.amountPkr ?? item.amountPkr,
    };
  });

  if (!items.length) {
    return (
      <Card>
        <CardHeader>
        <CardTitle>Fees</CardTitle>
        <CardDescription>Set this student’s fees here. Do not collect payment on this page.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <SiblingFeesList siblings={siblings} loading={siblingFeesQuery.isFetching && !siblingFeesQuery.data} />
          <p className="text-sm text-muted-foreground">
            No fee items for this school yet. Continue without quotes, or add items on Fee structure first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fees</CardTitle>
        <CardDescription>
          Listed amount is from the fee structure. Set this student’s fee for each item. Payment is collected later on Fees.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <SiblingFeesList siblings={siblings} loading={siblingFeesQuery.isFetching && !siblingFeesQuery.data} />
        {rows.map((quote, index) => (
          <FieldGroup key={quote.feeItemId} className="grid grid-cols-1 md:grid-cols-3">
            <Field>
              <FieldLabel>Fee</FieldLabel>
              <p className="text-sm">{quote.name}</p>
            </Field>
            <Field>
              <FieldLabel>Listed</FieldLabel>
              <p className="text-sm">{pkr(quote.catalogAmountPkr)}</p>
            </Field>
            <Field>
              <FieldLabel htmlFor={`quote-${quote.feeItemId}`}>Student fee (Rs.)</FieldLabel>
              <Input
                id={`quote-${quote.feeItemId}`}
                type="number"
                min={0}
                value={String(quote.amountPkr)}
                onChange={(event) => {
                  const amountPkr = Number(event.target.value) || 0;
                  onQuotesChange(rows.map((row, i) => (i === index ? { ...row, amountPkr } : row)));
                }}
              />
            </Field>
          </FieldGroup>
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

function reachableStep(application: AdmissionDetail) {
  if (["UNDER_REVIEW", "WAITLISTED", "ACCEPTED", "FEE_PENDING", "DOCUMENTS_PENDING"].includes(application.status)) {
    return 6;
  }
  return application.wizardStep || 1;
}

function familyFromForm(form: FormData) {
  return {
    guardianName: String(form.get("guardianName") || "").trim(),
    guardianPhone: String(form.get("guardianPhone") || "").trim(),
    guardianCnic: String(form.get("guardianCnic") || "").trim(),
    guardianRelation: String(form.get("guardianRelation") || "Parent"),
    guardianOccupation: String(form.get("guardianOccupation") || "").trim(),
  };
}

function parentOfLabel(students?: { firstName: string; lastName: string }[]) {
  const names = (students ?? []).map((student) => `${student.firstName} ${student.lastName}`.trim()).filter(Boolean);
  if (!names.length) return "No students linked yet";
  if (names.length === 1) return `Parent of ${names[0]}`;
  if (names.length === 2) return `Parent of ${names[0]} and ${names[1]}`;
  return `Parent of ${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function useDebouncedValue<T>(value: T, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function SiblingFeesList({
  siblings,
  loading,
}: {
  siblings: {
    id: string;
    firstName: string;
    lastName: string;
    rollNo: string;
    class: { name: string; section: string } | null;
    fees: { name: string; amountPkr: number; catalogAmountPkr: number }[];
  }[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-20 w-full rounded-lg" />
      </div>
    );
  }
  if (!siblings.length) return null;
  return (
    <div className="flex flex-col gap-3 rounded-xl border p-4">
      <div>
        <p className="text-sm font-medium">Sibling fees</p>
        <p className="text-sm text-muted-foreground">
          Other children of this guardian. Use these amounts if you want to discount this applicant.
        </p>
      </div>
      {siblings.map((sibling) => (
        <div key={sibling.id} className="rounded-lg bg-muted px-4 py-3">
          <p className="font-medium">
            {sibling.firstName} {sibling.lastName}
            {sibling.class ? ` · ${sibling.class.name} ${sibling.class.section}` : ""}
          </p>
          {sibling.fees.length ? (
            <ul className="mt-1 flex flex-col gap-0.5 text-sm text-muted-foreground">
              {sibling.fees.map((fee) => (
                <li key={`${sibling.id}-${fee.name}`}>
                  {fee.name}: {pkr(fee.amountPkr)}
                  {fee.amountPkr !== fee.catalogAmountPkr ? ` (listed ${pkr(fee.catalogAmountPkr)})` : ""}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No fees set yet.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function returningToDraft(student: {
  firstName: string;
  lastName: string;
  gender: string;
  dateOfBirth?: string | null;
  extra: Record<string, string>;
  address: string;
  guardians: { guardian: Guardian }[];
}) {
  const guardian = student.guardians[0]?.guardian;
  return {
    firstName: student.firstName,
    lastName: student.lastName,
    gender: student.gender === "unspecified" ? "" : student.gender,
    dateOfBirth: student.dateOfBirth,
    cnic: student.extra.cnic ?? "",
    address: student.address,
    family: {
      guardianName: guardian?.name ?? "",
      guardianPhone: guardian?.phone ?? "",
      guardianCnic: guardian?.cnic ?? "",
      guardianRelation: guardian?.relation ?? "Parent",
      guardianOccupation: "",
    },
    guardianId: guardian?.id,
    guardian,
  };
}
