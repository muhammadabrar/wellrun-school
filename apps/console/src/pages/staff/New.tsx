import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@wellrun/ui";
import { STAFF_DEPARTMENTS, STAFF_DESIGNATIONS, cnicPattern } from "@wellrun/shared";
import { Lock } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { CONTRACT_TYPES, CnicInput, PayLinesEditor, SalaryLine, cleanLines } from "@/components/staff/staff-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useCampus } from "@/hooks/use-campus";
import { api, type ContractType, type PayLine, type StaffLoginRole } from "@/lib/api";
import { todayIso } from "@/lib/format";
import { queryKeys } from "@/lib/query";

type Errors = Partial<Record<string, string>>;

const genders = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

export function StaffNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { campuses, campusId } = useCampus();
  const { data: academics } = useQuery({ queryKey: queryKeys.academics, queryFn: api.academics });
  const subjects = (academics?.subjects ?? []).filter((subject) => subject.enabled);

  const [form, setForm] = useState({
    name: "",
    cnic: "",
    gender: "",
    dateOfBirth: "",
    phone: "",
    address: "",
    title: "Teacher",
    department: "Academics",
    campusId: campusId,
    joinDate: todayIso(),
    bankName: "",
    bankAccountTitle: "",
    bankAccountNo: "",
  });
  const [teaches, setTeaches] = useState<string[]>([]);
  const [contractType, setContractType] = useState<ContractType>("PERMANENT");
  const [contractEnd, setContractEnd] = useState("");
  const [basic, setBasic] = useState("");
  const [allowances, setAllowances] = useState<PayLine[]>([]);
  const [withLogin, setWithLogin] = useState(true);
  const [login, setLogin] = useState({ email: "", password: "", confirm: "", role: "TEACHER" as StaffLoginRole });
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const create = useMutation({
    mutationFn: () =>
      api.createStaff({
        ...form,
        name: form.name.trim(),
        campusId: form.campusId || undefined,
        subjects: teaches,
        contract: {
          type: contractType,
          startDate: form.joinDate,
          endDate: contractType === "PERMANENT" ? "" : contractEnd,
          basicSalaryPkr: Number(basic) || 0,
          allowances: cleanLines(allowances),
        },
        account: withLogin ? { email: login.email.trim(), password: login.password, role: login.role } : undefined,
      }),
    onSuccess: async (staff) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.staff });
      navigate(`/staff/${staff.id}?new=1`);
    },
    onError: (err) => setServerError(err instanceof Error ? err.message : "Could not add this staff member."),
  });

  function validate() {
    const next: Errors = {};
    if (form.name.trim().length < 2) next.name = "Enter the full name as on the CNIC.";
    if (!cnicPattern.test(form.cnic)) next.cnic = "Enter all 13 digits: 12345-1234567-1.";
    if (!form.joinDate) next.joinDate = "Choose the joining date.";
    if (!form.title) next.title = "Choose a designation.";
    if (!(Number(basic) > 0)) next.basic = "Enter the monthly basic salary.";
    if (contractType !== "PERMANENT" && contractEnd && contractEnd < form.joinDate) next.contractEnd = "The contract can't end before the joining date.";
    if (withLogin) {
      if (!/^\S+@\S+\.\S+$/.test(login.email.trim())) next.email = "Enter a valid email address.";
      if (login.password.length < 8) next.password = "Use at least 8 characters.";
      else if (login.password !== login.confirm) next.confirm = "Passwords don't match.";
    }
    setErrors(next);
    return !Object.keys(next).length;
  }

  return (
    <form
      noValidate
      className="mx-auto flex max-w-3xl flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        setServerError(null);
        if (validate()) create.mutate();
      }}
    >
      <PageHeader title="Add staff" description="Teachers and every other member of staff. You can add their classes afterwards." />

      <Section title="Identity" description="Name and CNIC are locked once saved — check them against the CNIC card.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.name) || undefined}>
            <FieldLabel htmlFor="staff-name">
              Full name <Lock className="size-3.5 text-muted-foreground" aria-label="Locked after saving" />
            </FieldLabel>
            <Input id="staff-name" capitalize="words" value={form.name} onChange={(event) => set("name")(event.target.value)} aria-invalid={Boolean(errors.name) || undefined} />
            <FieldError>{errors.name}</FieldError>
          </Field>
          <Field data-invalid={Boolean(errors.cnic) || undefined}>
            <FieldLabel htmlFor="staff-cnic">
              CNIC <Lock className="size-3.5 text-muted-foreground" aria-label="Locked after saving" />
            </FieldLabel>
            <CnicInput id="staff-cnic" value={form.cnic} onChange={set("cnic")} aria-invalid={Boolean(errors.cnic) || undefined} />
            <FieldError>{errors.cnic}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="staff-gender">Gender</FieldLabel>
            <FormSelect id="staff-gender" value={form.gender || null} onValueChange={(value) => set("gender")(value ?? "")} placeholder="Choose" options={genders} />
          </Field>
          <Field>
            <FieldLabel htmlFor="staff-dob">Date of birth</FieldLabel>
            <DatePicker id="staff-dob" value={form.dateOfBirth} onChange={set("dateOfBirth")} fromYear={1950} toYear={new Date().getFullYear() - 16} />
          </Field>
          <Field>
            <FieldLabel htmlFor="staff-phone">Phone</FieldLabel>
            <Input id="staff-phone" type="tel" value={form.phone} onChange={(event) => set("phone")(event.target.value)} placeholder="03xx xxxxxxx" />
          </Field>
          <Field>
            <FieldLabel htmlFor="staff-address">Address</FieldLabel>
            <Input id="staff-address" value={form.address} onChange={(event) => set("address")(event.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Job" description="What they do and where.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field data-invalid={Boolean(errors.title) || undefined}>
            <FieldLabel htmlFor="staff-title">Designation</FieldLabel>
            <FormSelect id="staff-title" value={form.title} onValueChange={(value) => set("title")(value ?? "")} options={STAFF_DESIGNATIONS.map((value) => ({ value, label: value }))} />
            <FieldError>{errors.title}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="staff-department">Department</FieldLabel>
            <FormSelect id="staff-department" value={form.department} onValueChange={(value) => set("department")(value ?? "")} options={STAFF_DEPARTMENTS.map((value) => ({ value, label: value }))} />
          </Field>
          <Field data-invalid={Boolean(errors.joinDate) || undefined}>
            <FieldLabel htmlFor="staff-join">Joining date</FieldLabel>
            <DatePicker id="staff-join" value={form.joinDate} onChange={set("joinDate")} fromYear={1980} />
            <FieldError>{errors.joinDate}</FieldError>
          </Field>
          {campuses.length > 1 ? (
            <Field>
              <FieldLabel htmlFor="staff-campus">Campus</FieldLabel>
              <FormSelect id="staff-campus" value={form.campusId || null} onValueChange={(value) => set("campusId")(value ?? "")} options={campuses.map((campus) => ({ value: campus.id, label: campus.name }))} />
            </Field>
          ) : null}
        </div>
        {subjects.length && form.department === "Academics" ? (
          <Field className="mt-5">
            <FieldLabel>Subjects they can teach</FieldLabel>
            <FieldDescription>Used when timetables are generated automatically.</FieldDescription>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {subjects.map((subject) => (
                <li key={subject.id}>
                  <Field orientation="horizontal" className="rounded-xl border border-line px-3 py-2">
                    <Checkbox
                      id={`teaches-${subject.id}`}
                      checked={teaches.includes(subject.name)}
                      onCheckedChange={(checked) => setTeaches((current) => (checked ? [...current, subject.name] : current.filter((name) => name !== subject.name)))}
                    />
                    <FieldLabel htmlFor={`teaches-${subject.id}`} className="font-normal">
                      {subject.name}
                    </FieldLabel>
                  </Field>
                </li>
              ))}
            </ul>
          </Field>
        ) : null}
      </Section>

      <Section title="Contract & salary" description="Starts on the joining date. Payroll uses this every month.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="contract-type">Contract type</FieldLabel>
            <FormSelect
              id="contract-type"
              value={contractType}
              onValueChange={(value) => setContractType((value as ContractType) ?? "PERMANENT")}
              options={(Object.keys(CONTRACT_TYPES) as ContractType[]).map((value) => ({ value, label: CONTRACT_TYPES[value] }))}
            />
          </Field>
          {contractType !== "PERMANENT" ? (
            <Field data-invalid={Boolean(errors.contractEnd) || undefined}>
              <FieldLabel htmlFor="contract-end">Contract ends</FieldLabel>
              <DatePicker id="contract-end" value={contractEnd} onChange={setContractEnd} fromYear={new Date().getFullYear()} toYear={new Date().getFullYear() + 5} placeholder="No end date" />
              <FieldError>{errors.contractEnd}</FieldError>
            </Field>
          ) : null}
          <Field data-invalid={Boolean(errors.basic) || undefined}>
            <FieldLabel htmlFor="contract-basic">Basic salary (Rs. / month)</FieldLabel>
            <Input id="contract-basic" type="number" min={0} step={1} inputMode="numeric" value={basic} onChange={(event) => setBasic(event.target.value)} aria-invalid={Boolean(errors.basic) || undefined} />
            <FieldError>{errors.basic}</FieldError>
          </Field>
        </div>
        <Field className="mt-5">
          <FieldLabel>Monthly allowances</FieldLabel>
          <FieldDescription>Paid on top of basic salary every month, e.g. house rent, conveyance, medical.</FieldDescription>
          <PayLinesEditor lines={allowances} onChange={setAllowances} addLabel="Add allowance" labelPlaceholder="Allowance" idPrefix="allowance" />
        </Field>
        {Number(basic) > 0 ? (
          <p className="mt-4 text-sm">
            Monthly gross: <SalaryLine basic={Number(basic)} allowances={cleanLines(allowances)} />
          </p>
        ) : null}
      </Section>

      <Section title="Bank account" description="Printed on payslips for salary transfers. Optional.">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="bank-name">Bank</FieldLabel>
            <Input id="bank-name" value={form.bankName} onChange={(event) => set("bankName")(event.target.value)} placeholder="e.g. Meezan Bank" />
          </Field>
          <Field>
            <FieldLabel htmlFor="bank-title">Account title</FieldLabel>
            <Input id="bank-title" capitalize="words" value={form.bankAccountTitle} onChange={(event) => set("bankAccountTitle")(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="bank-number">Account no / IBAN</FieldLabel>
            <Input id="bank-number" capitalize="none" value={form.bankAccountNo} onChange={(event) => set("bankAccountNo")(event.target.value.toUpperCase())} />
          </Field>
        </div>
      </Section>

      <Section
        title="Login"
        description="Lets them sign in to see their timetable and payslips, and take attendance."
        aside={<Switch aria-label="Create a login" checked={withLogin} onCheckedChange={setWithLogin} />}
      >
        {withLogin ? (
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={Boolean(errors.email) || undefined}>
                <FieldLabel htmlFor="login-email">Email</FieldLabel>
                <Input id="login-email" type="email" autoComplete="off" value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} aria-invalid={Boolean(errors.email) || undefined} />
                <FieldError>{errors.email}</FieldError>
              </Field>
              <Field>
                <FieldLabel htmlFor="login-role">Access</FieldLabel>
                <FormSelect
                  id="login-role"
                  value={login.role}
                  onValueChange={(value) => setLogin({ ...login, role: (value as StaffLoginRole) ?? "TEACHER" })}
                  options={[
                    { value: "TEACHER", label: "Staff — own timetable, classes and payslips" },
                    { value: "SCHOOL_ADMIN", label: "School admin — everything" },
                  ]}
                />
              </Field>
              <Field data-invalid={Boolean(errors.password) || undefined}>
                <FieldLabel htmlFor="login-password">Password</FieldLabel>
                <Input id="login-password" type="password" autoComplete="new-password" value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} aria-invalid={Boolean(errors.password) || undefined} />
                <FieldDescription>At least 8 characters. Share it with them privately.</FieldDescription>
                <FieldError>{errors.password}</FieldError>
              </Field>
              <Field data-invalid={Boolean(errors.confirm) || undefined}>
                <FieldLabel htmlFor="login-confirm">Confirm password</FieldLabel>
                <Input id="login-confirm" type="password" autoComplete="new-password" value={login.confirm} onChange={(event) => setLogin({ ...login, confirm: event.target.value })} aria-invalid={Boolean(errors.confirm) || undefined} />
                <FieldError>{errors.confirm}</FieldError>
              </Field>
            </div>
          </FieldGroup>
        ) : (
          <p className="text-sm text-muted-foreground">No login. You can create one later from their profile.</p>
        )}
      </Section>

      {serverError ? (
        <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          {serverError}
        </p>
      ) : Object.keys(errors).length ? (
        <p className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
          Fix the highlighted fields above.
        </p>
      ) : null}
      <div className="flex justify-end gap-2 pb-8">
        <Button variant="outline" render={<Link to="/staff" />}>
          Cancel
        </Button>
        <Button type="submit" loading={create.isPending}>
          Add staff member
        </Button>
      </div>
    </form>
  );
}

function Section({ title, description, aside, children }: { title: string; description: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}
