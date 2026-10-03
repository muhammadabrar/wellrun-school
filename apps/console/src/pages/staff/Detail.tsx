import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, EmptyState, ErrorState, LoadingState } from "@wellrun/ui";
import { STAFF_DEPARTMENTS, STAFF_DESIGNATIONS, cnicPattern } from "@wellrun/shared";
import { ArrowLeft, CalendarClock, Lock, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import {
  CONTRACT_TYPES,
  CnicInput,
  PayLinesEditor,
  PayslipStatusBadge,
  STAFF_STATUS,
  SalaryLine,
  StaffStatusBadge,
  StaffWeekGrid,
  cleanLines,
  formatDay,
  isoDay,
  periodName,
} from "@/components/staff/staff-ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCampus } from "@/hooks/use-campus";
import { api, currentUser, type ContractType, type PayLine, type StaffDetail, type StaffLoginRole, type StaffStatus } from "@/lib/api";
import { mediaUrl, pkr, todayIso } from "@/lib/format";
import { queryKeys } from "@/lib/query";

type Notify = (message: string, tone?: "ok" | "error") => void;
const TABS = ["profile", "contract", "classes", "login", "history"] as const;

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

export function StaffDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((value) => value === params.get("tab")) ?? "profile";
  const [statusOpen, setStatusOpen] = useState(false);
  const [notice, setNotice] = useState<{ message: string; tone: "ok" | "error" } | null>(null);
  const notify: Notify = (message, tone = "ok") => setNotice({ message, tone });
  const { data: staff, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.staffMember(id),
    queryFn: () => api.staffMember(id),
    enabled: Boolean(id),
  });

  function saved(next: StaffDetail, message: string) {
    queryClient.setQueryData(queryKeys.staffMember(id), next);
    void queryClient.invalidateQueries({ queryKey: queryKeys.staff, exact: false, refetchType: "none" });
    notify(message);
  }

  if (isPending) return <LoadingState variant="form" />;
  if (isError || !staff) {
    return <ErrorState title="Couldn't load this staff member" description="They may be on another school, or your connection dropped." onRetry={() => void refetch()} />;
  }
  const justAdded = params.get("new") === "1";

  return (
    <div className="flex flex-col gap-6">
      <Link to="/staff" className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> All staff
      </Link>
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-3xl bg-surface p-6">
        <StaffPhoto staff={staff} onSaved={saved} notify={notify} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-4xl">{staff.name}</h1>
            <StaffStatusBadge status={staff.status} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            {[staff.title, staff.department, staff.campus?.name].filter(Boolean).join(" · ")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground tabular-nums">
            {staff.employeeNo} · CNIC {staff.cnic || "not recorded"} · Joined {formatDay(staff.joinDate)}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setStatusOpen(true)}>
          Change status
        </Button>
      </header>

      {justAdded ? (
        <p className="rounded-2xl bg-primary/5 px-4 py-3 text-sm text-primary" role="status">
          {staff.name} was added as {staff.employeeNo}. Next, assign their classes in the Classes &amp; timetable tab.
        </p>
      ) : null}
      {notice ? (
        <p
          className={`rounded-2xl px-4 py-3 text-sm ${notice.tone === "error" ? "bg-destructive/10 text-destructive" : "bg-primary/5 text-primary"}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      ) : null}

      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params);
          next.set("tab", String(value));
          next.delete("new");
          setParams(next, { replace: true });
          setNotice(null);
        }}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="contract">Contract &amp; pay</TabsTrigger>
          <TabsTrigger value="classes">Classes &amp; timetable</TabsTrigger>
          <TabsTrigger value="login">Login</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-4">
          <ProfileTab key={staff.id + staff.cnic} staff={staff} onSaved={saved} notify={notify} />
        </TabsContent>
        <TabsContent value="contract" className="mt-4">
          <ContractTab staff={staff} onSaved={saved} notify={notify} />
        </TabsContent>
        <TabsContent value="classes" className="mt-4">
          <ClassesTab staff={staff} notify={notify} />
        </TabsContent>
        <TabsContent value="login" className="mt-4">
          <LoginTab key={staff.login?.email ?? "none"} staff={staff} onSaved={saved} notify={notify} />
        </TabsContent>
        <TabsContent value="history" className="mt-4">
          <HistoryTab staff={staff} />
        </TabsContent>
      </Tabs>

      <StatusDialog open={statusOpen} staff={staff} onClose={() => setStatusOpen(false)} onSaved={saved} notify={notify} />
    </div>
  );
}

function Card({ title, description, children, actions }: { title: string; description?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-3xl bg-surface p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl">{title}</h2>
          {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function LockedField({ label, value }: { label: string; value: string }) {
  return (
    <Field>
      <FieldLabel>
        {label} <Lock className="size-3.5 text-muted-foreground" aria-hidden />
      </FieldLabel>
      <p className="flex h-10 items-center rounded-lg bg-muted/60 px-3 text-sm">{value || "—"}</p>
      <FieldDescription>Can't be changed.</FieldDescription>
    </Field>
  );
}

/* ───────────── Status ───────────── */

function StatusDialog({
  open,
  staff,
  onClose,
  onSaved,
  notify,
}: {
  open: boolean;
  staff: StaffDetail;
  onClose: () => void;
  onSaved: (next: StaffDetail, message: string) => void;
  notify: Notify;
}) {
  const options = (Object.keys(STAFF_STATUS) as StaffStatus[]).filter((value) => value !== staff.status);
  const [status, setStatus] = useState<StaffStatus>(options[0]);
  const [effectiveOn, setEffectiveOn] = useState(todayIso());
  const [reason, setReason] = useState("");
  const change = useMutation({
    mutationFn: () => api.changeStaffStatus(staff.id, { status, effectiveOn, reason: reason.trim() || undefined }),
    onSuccess: (next) => {
      onClose();
      setReason("");
      onSaved(
        next,
        `${staff.name} is now ${STAFF_STATUS[status].label.toLowerCase()}.${next.freedLessons ? ` ${next.freedLessons} timetable periods now need a new teacher.` : ""}`,
      );
    },
    onError: (err) => {
      onClose();
      notify(errorText(err, "Could not change the status."), "error");
    },
  });
  const current = options.includes(status) ? status : options[0];

  return (
    <Dialog
      open={open}
      title={`Change ${staff.name}'s status`}
      description={`Currently ${STAFF_STATUS[staff.status].label.toLowerCase()}. Staff are never deleted — their record and payslips stay.`}
      confirmLabel="Change status"
      danger={current === "TERMINATED" || current === "SUSPENDED"}
      loading={change.isPending}
      onClose={onClose}
      onConfirm={() => change.mutate()}
    >
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel htmlFor="status-next">New status</FieldLabel>
          <FormSelect
            id="status-next"
            value={current}
            onValueChange={(value) => value && setStatus(value as StaffStatus)}
            options={options.map((value) => ({ value, label: STAFF_STATUS[value].label }))}
          />
          <FieldDescription>{STAFF_STATUS[current].help}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="status-date">Effective from</FieldLabel>
          <DatePicker id="status-date" value={effectiveOn} onChange={setEffectiveOn} fromYear={2000} />
        </Field>
        <Field>
          <FieldLabel htmlFor="status-reason">Reason</FieldLabel>
          <Input id="status-reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional — kept in their history" />
        </Field>
      </div>
    </Dialog>
  );
}

/* ───────────── Profile ───────────── */

function ProfileTab({ staff, onSaved, notify }: { staff: StaffDetail; onSaved: (next: StaffDetail, message: string) => void; notify: Notify }) {
  const { campuses } = useCampus();
  const { data: academics } = useQuery({ queryKey: queryKeys.academics, queryFn: api.academics });
  const initial = {
    gender: staff.gender,
    dateOfBirth: isoDay(staff.dateOfBirth),
    phone: staff.phone,
    email: staff.email ?? "",
    address: staff.address,
    title: staff.title,
    department: staff.department,
    campusId: staff.campusId ?? "",
    joinDate: isoDay(staff.joinDate),
    bankName: staff.bankName,
    bankAccountTitle: staff.bankAccountTitle,
    bankAccountNo: staff.bankAccountNo,
  };
  const [form, setForm] = useState(initial);
  const [cnic, setCnic] = useState("");
  const [cnicError, setCnicError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (value: string) => setForm((current) => ({ ...current, [key]: value }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial) || Boolean(cnic);
  const designations = [...new Set([...STAFF_DESIGNATIONS, staff.title].filter(Boolean))];
  const departments = [...new Set([...STAFF_DEPARTMENTS, staff.department].filter(Boolean))];

  const save = useMutation({
    mutationFn: () =>
      api.updateStaff(staff.id, {
        ...form,
        email: staff.login ? undefined : form.email.trim(),
        campusId: form.campusId,
        ...(cnic ? { cnic } : {}),
      }),
    onSuccess: (next) => onSaved(next, "Profile saved."),
    onError: (err) => notify(errorText(err, "Could not save the profile."), "error"),
  });

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (cnic && !cnicPattern.test(cnic)) {
          setCnicError("Enter all 13 digits: 12345-1234567-1.");
          return;
        }
        setCnicError(null);
        save.mutate();
      }}
    >
      <Card title="Identity" description="Name and CNIC are fixed so payroll and records always match the CNIC card.">
        <div className="grid gap-5 sm:grid-cols-2">
          <LockedField label="Full name" value={staff.name} />
          {staff.cnic ? (
            <LockedField label="CNIC" value={staff.cnic} />
          ) : (
            <Field data-invalid={Boolean(cnicError) || undefined}>
              <FieldLabel htmlFor="profile-cnic">CNIC</FieldLabel>
              <CnicInput id="profile-cnic" value={cnic} onChange={setCnic} />
              <FieldDescription>Not recorded yet. It can be added once and is then locked.</FieldDescription>
              <FieldError>{cnicError}</FieldError>
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="profile-gender">Gender</FieldLabel>
            <FormSelect
              id="profile-gender"
              value={form.gender || null}
              onValueChange={(value) => set("gender")(value ?? "")}
              placeholder="Choose"
              options={[
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "other", label: "Other" },
              ]}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-dob">Date of birth</FieldLabel>
            <DatePicker id="profile-dob" value={form.dateOfBirth} onChange={set("dateOfBirth")} fromYear={1950} toYear={new Date().getFullYear() - 16} />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-phone">Phone</FieldLabel>
            <Input id="profile-phone" type="tel" value={form.phone} onChange={(event) => set("phone")(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-email">Email</FieldLabel>
            {staff.login ? (
              <>
                <p className="flex h-10 items-center rounded-lg bg-muted/60 px-3 text-sm">{staff.login.email}</p>
                <FieldDescription>This is their login — change it in the Login tab.</FieldDescription>
              </>
            ) : (
              <Input id="profile-email" type="email" value={form.email} onChange={(event) => set("email")(event.target.value)} />
            )}
          </Field>
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="profile-address">Address</FieldLabel>
            <Input id="profile-address" value={form.address} onChange={(event) => set("address")(event.target.value)} />
          </Field>
        </div>
      </Card>

      <Card title="Job">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="profile-title">Designation</FieldLabel>
            <FormSelect id="profile-title" value={form.title} onValueChange={(value) => set("title")(value ?? staff.title)} options={designations.map((value) => ({ value, label: value }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-department">Department</FieldLabel>
            <FormSelect id="profile-department" value={form.department || null} onValueChange={(value) => set("department")(value ?? "")} placeholder="Choose" options={departments.map((value) => ({ value, label: value }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-join">Joining date</FieldLabel>
            <DatePicker id="profile-join" value={form.joinDate} onChange={set("joinDate")} fromYear={1980} />
          </Field>
          {campuses.length > 1 ? (
            <Field>
              <FieldLabel htmlFor="profile-campus">Campus</FieldLabel>
              <FormSelect id="profile-campus" value={form.campusId || null} onValueChange={(value) => set("campusId")(value ?? "")} placeholder="Choose" options={campuses.map((campus) => ({ value: campus.id, label: campus.name }))} />
            </Field>
          ) : null}
        </div>
        {academics?.subjects.length ? <SubjectsField staff={staff} subjects={academics.subjects.filter((row) => row.enabled).map((row) => row.name)} onSaved={onSaved} notify={notify} /> : null}
      </Card>

      <Card title="Bank account" description="Printed on payslips.">
        <div className="grid gap-5 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="profile-bank">Bank</FieldLabel>
            <Input id="profile-bank" value={form.bankName} onChange={(event) => set("bankName")(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-bank-title">Account title</FieldLabel>
            <Input id="profile-bank-title" capitalize="words" value={form.bankAccountTitle} onChange={(event) => set("bankAccountTitle")(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="profile-bank-no">Account no / IBAN</FieldLabel>
            <Input id="profile-bank-no" capitalize="none" value={form.bankAccountNo} onChange={(event) => set("bankAccountNo")(event.target.value.toUpperCase())} />
          </Field>
        </div>
      </Card>

      <div className="flex justify-end gap-2">
        {dirty ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setForm(initial);
              setCnic("");
            }}
          >
            Undo changes
          </Button>
        ) : null}
        <Button type="submit" loading={save.isPending} disabled={!dirty}>
          Save profile
        </Button>
      </div>
    </form>
  );
}

function SubjectsField({ staff, subjects, onSaved, notify }: { staff: StaffDetail; subjects: string[]; onSaved: (next: StaffDetail, message: string) => void; notify: Notify }) {
  const current = staff.subjects;
  const save = useMutation({
    mutationFn: (next: string[]) => api.updateStaff(staff.id, { subjects: next }),
    onSuccess: (next) => onSaved(next, "Subjects saved."),
    onError: (err) => notify(errorText(err, "Could not save subjects."), "error"),
  });
  return (
    <Field className="mt-5">
      <FieldLabel>Subjects they can teach</FieldLabel>
      <FieldDescription>Used when timetables are generated automatically. Saves as you tick.</FieldDescription>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {subjects.map((name) => (
          <li key={name}>
            <Field orientation="horizontal" className="rounded-xl border border-line px-3 py-2">
              <Checkbox
                id={`profile-teaches-${name}`}
                checked={current.includes(name)}
                disabled={save.isPending}
                onCheckedChange={(checked) => save.mutate(checked ? [...current, name] : current.filter((value) => value !== name))}
              />
              <FieldLabel htmlFor={`profile-teaches-${name}`} className="font-normal">
                {name}
              </FieldLabel>
            </Field>
          </li>
        ))}
      </ul>
    </Field>
  );
}

/* ───────────── Contract & pay ───────────── */

function ContractTab({ staff, onSaved, notify }: { staff: StaffDetail; onSaved: (next: StaffDetail, message: string) => void; notify: Notify }) {
  const current = staff.contracts.find((row) => row.id === staff.currentContractId) ?? null;
  const [adding, setAdding] = useState(!staff.contracts.length);
  const [type, setType] = useState<ContractType>(current?.type ?? "PERMANENT");
  const [startDate, setStartDate] = useState(staff.contracts.length ? todayIso() : isoDay(staff.joinDate) || todayIso());
  const [endDate, setEndDate] = useState("");
  const [basic, setBasic] = useState(current ? String(current.basicSalaryPkr) : "");
  const [allowances, setAllowances] = useState<PayLine[]>(current?.allowances ?? []);
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () =>
      api.addStaffContract(staff.id, {
        type,
        startDate,
        endDate: type === "PERMANENT" ? "" : endDate,
        basicSalaryPkr: Number(basic) || 0,
        allowances: cleanLines(allowances),
      }),
    onSuccess: (next) => {
      setAdding(false);
      onSaved(next, current ? "New contract saved. The previous one ends the day before it starts." : "Contract saved. They'll be included in payroll.");
    },
    onError: (err) => notify(errorText(err, "Could not save the contract."), "error"),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card
        title="Current contract"
        actions={
          !adding ? (
            <Button type="button" variant="outline" icon={<Plus />} onClick={() => setAdding(true)}>
              {current ? "Renew or change salary" : "Add contract"}
            </Button>
          ) : null
        }
      >
        {current ? (
          <dl className="grid gap-4 text-sm sm:grid-cols-4">
            <Detail label="Type" value={CONTRACT_TYPES[current.type]} />
            <Detail label="From" value={formatDay(current.startDate)} />
            <Detail label="Until" value={current.endDate ? formatDay(current.endDate) : "No end date"} />
            <Detail label="Monthly gross" value={<SalaryLine basic={current.basicSalaryPkr} allowances={current.allowances} />} />
            {current.allowances.length ? (
              <div className="sm:col-span-4">
                <dt className="text-muted-foreground">Allowances</dt>
                <dd className="mt-1 flex flex-wrap gap-2">
                  {current.allowances.map((line) => (
                    <span key={line.label} className="rounded-full bg-muted px-3 py-1 text-xs">
                      {line.label} · {pkr(line.amountPkr)}
                    </span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-orange">No contract yet, so {staff.name} is left out of payroll.</p>
        )}
      </Card>

      {adding ? (
        <Card title={current ? "New contract" : "Add contract"} description={current ? "Use this for renewals and salary changes. The current contract ends the day before the new one starts." : undefined}>
          <form
            className="flex flex-col gap-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!(Number(basic) > 0)) return setError("Enter the monthly basic salary.");
              if (type !== "PERMANENT" && endDate && endDate < startDate) return setError("The contract can't end before it starts.");
              setError(null);
              add.mutate();
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="contract-type">Type</FieldLabel>
                <FormSelect id="contract-type" value={type} onValueChange={(value) => setType((value as ContractType) ?? "PERMANENT")} options={(Object.keys(CONTRACT_TYPES) as ContractType[]).map((value) => ({ value, label: CONTRACT_TYPES[value] }))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="contract-basic">Basic salary (Rs. / month)</FieldLabel>
                <Input id="contract-basic" type="number" min={0} step={1} inputMode="numeric" value={basic} onChange={(event) => setBasic(event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="contract-start">Starts</FieldLabel>
                <DatePicker id="contract-start" value={startDate} onChange={setStartDate} fromYear={2000} toYear={new Date().getFullYear() + 2} />
              </Field>
              {type !== "PERMANENT" ? (
                <Field>
                  <FieldLabel htmlFor="contract-end">Ends</FieldLabel>
                  <DatePicker id="contract-end" value={endDate} onChange={setEndDate} fromYear={new Date().getFullYear() - 1} toYear={new Date().getFullYear() + 5} placeholder="No end date" />
                </Field>
              ) : null}
            </div>
            <Field>
              <FieldLabel>Monthly allowances</FieldLabel>
              <PayLinesEditor lines={allowances} onChange={setAllowances} addLabel="Add allowance" labelPlaceholder="Allowance" idPrefix="contract-allowance" />
            </Field>
            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <div className="flex justify-end gap-2">
              {staff.contracts.length ? (
                <Button type="button" variant="outline" onClick={() => setAdding(false)}>
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" loading={add.isPending}>
                Save contract
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {staff.contracts.length > 1 ? (
        <Card title="Earlier contracts">
          <ul className="divide-y divide-line text-sm">
            {staff.contracts
              .filter((row) => row.id !== current?.id)
              .map((row) => (
                <li key={row.id} className="flex flex-wrap justify-between gap-2 py-3">
                  <span>
                    {CONTRACT_TYPES[row.type]} · {formatDay(row.startDate)} – {row.endDate ? formatDay(row.endDate) : "open"}
                  </span>
                  <SalaryLine basic={row.basicSalaryPkr} allowances={row.allowances} />
                </li>
              ))}
          </ul>
        </Card>
      ) : null}

      <Card
        title="Payslips"
        actions={
          <Button variant="outline" render={<Link to="/payroll" />}>
            Open payroll
          </Button>
        }
      >
        {staff.payslips.length ? (
          <ul className="divide-y divide-line text-sm">
            {staff.payslips.map((row) => (
              <li key={row.id}>
                <Link to={`/payroll/payslips/${row.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:underline">
                  <span className="font-medium">{periodName(row.period)}</span>
                  <span className="flex items-center gap-3">
                    <span className="tabular-nums">{pkr(row.netPkr)}</span>
                    <PayslipStatusBadge status={row.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No payslips yet. They're created when you run payroll for a month.</p>
        )}
      </Card>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}

/* ───────────── Classes & timetable ───────────── */

function ClassesTab({ staff, notify }: { staff: StaffDetail; notify: Notify }) {
  const queryClient = useQueryClient();
  const { classes } = useCampus();
  const { data: academics } = useQuery({ queryKey: queryKeys.academics, queryFn: api.academics });
  const { data: week, isPending } = useQuery({ queryKey: queryKeys.staffTimetable(staff.id), queryFn: () => api.staffTimetable(staff.id) });
  const [classId, setClassId] = useState<string | null>(null);
  const [subject, setSubject] = useState<string>("any");
  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.staffMember(staff.id) });

  const assign = useMutation({
    mutationFn: () => api.assignStaff(staff.id, { classId: classId!, subject: subject === "any" ? "" : subject }),
    onSuccess: async () => {
      setClassId(null);
      setSubject("any");
      await refresh();
      notify("Class assigned.");
    },
    onError: (err) => notify(errorText(err, "Could not assign this class."), "error"),
  });
  const unassign = useMutation({
    mutationFn: (assignmentId: string) => api.unassignStaff(staff.id, assignmentId),
    onSuccess: async () => {
      await refresh();
      notify("Class removed.");
    },
    onError: (err) => notify(errorText(err, "Could not remove this class."), "error"),
  });
  const periods = week?.lessons.length ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <Card title="Assigned classes" description="They can mark attendance for these classes, and are placed first when timetables are generated.">
        {staff.assignments.length ? (
          <ul className="mb-5 flex flex-wrap gap-2">
            {staff.assignments.map((row) => (
              <li key={row.id} className="flex items-center gap-1 rounded-full bg-muted py-1 pr-1 pl-3 text-sm">
                {row.class.name} {row.class.section}
                {row.subject ? <span className="text-muted-foreground">· {row.subject}</span> : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${row.class.name} ${row.class.section}${row.subject ? ` ${row.subject}` : ""}`}
                  onClick={() => unassign.mutate(row.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-5 text-sm text-muted-foreground">No classes assigned yet.</p>
        )}
        <form
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            if (classId) assign.mutate();
          }}
        >
          <Field>
            <FieldLabel htmlFor="assign-class">Class</FieldLabel>
            <FormSelect id="assign-class" value={classId} onValueChange={setClassId} placeholder="Choose a class" options={classes.map((cls) => ({ value: cls.id, label: `${cls.name} ${cls.section}`.trim() }))} />
          </Field>
          <Field>
            <FieldLabel htmlFor="assign-subject">Subject</FieldLabel>
            <FormSelect
              id="assign-subject"
              value={subject}
              onValueChange={(value) => setSubject(value ?? "any")}
              options={[{ value: "any", label: "Class teacher (all subjects)" }, ...(academics?.subjects ?? []).filter((row) => row.enabled).map((row) => ({ value: row.name, label: row.name }))]}
            />
          </Field>
          <Button type="submit" icon={<Plus />} disabled={!classId} loading={assign.isPending}>
            Assign
          </Button>
        </form>
      </Card>

      <Card
        title="Weekly timetable"
        description={periods ? `${periods} periods a week.` : undefined}
        actions={
          <Button variant="outline" icon={<CalendarClock />} render={<Link to="/timetable" />}>
            Edit timetables
          </Button>
        }
      >
        {isPending || !week ? (
          <LoadingState variant="table" />
        ) : (
          <StaffWeekGrid week={week} emptyText={`${staff.name} has no periods on the timetable yet. Place them from the Timetable page.`} />
        )}
      </Card>
    </div>
  );
}

/* ───────────── Login ───────────── */

function LoginTab({ staff, onSaved, notify }: { staff: StaffDetail; onSaved: (next: StaffDetail, message: string) => void; notify: Notify }) {
  const self = currentUser()?.email.toLowerCase() === staff.login?.email.toLowerCase();
  const [email, setEmail] = useState(staff.login?.email ?? staff.email ?? "");
  const [role, setRole] = useState<StaffLoginRole>((staff.login?.role as StaffLoginRole) ?? "TEACHER");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: () => api.saveStaffAccount(staff.id, { email: email.trim(), role, password: password || undefined }),
    onSuccess: (next) => {
      setPassword("");
      setConfirm("");
      onSaved(next, staff.login ? "Login updated." : `Login created. ${staff.name} can now sign in with ${email.trim()}.`);
    },
    onError: (err) => notify(errorText(err, "Could not save the login."), "error"),
  });
  const blocked = staff.status !== "ACTIVE" && staff.status !== "ON_LEAVE";

  return (
    <Card
      title={staff.login ? "Login" : "Create a login"}
      description={staff.login ? undefined : "Lets them sign in to see their timetable and payslips, and take attendance."}
    >
      {staff.login ? (
        <p className={`mb-5 text-sm ${blocked ? "text-orange" : "text-muted-foreground"}`}>
          {blocked
            ? `Sign-in is blocked because ${staff.name} is ${STAFF_STATUS[staff.status].label.toLowerCase()}. Make them active to let them sign in again.`
            : `${staff.name} signs in as ${staff.login.email}.`}
        </p>
      ) : null}
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
          if (!staff.login && password.length < 8) return setError("Set a password of at least 8 characters.");
          if (password && password.length < 8) return setError("Use at least 8 characters.");
          if (password !== confirm) return setError("Passwords don't match.");
          setError(null);
          save.mutate();
        }}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="login-email">Email</FieldLabel>
            <Input id="login-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="login-role">Access</FieldLabel>
            <FormSelect
              id="login-role"
              value={role}
              disabled={self}
              onValueChange={(value) => setRole((value as StaffLoginRole) ?? "TEACHER")}
              options={[
                { value: "TEACHER", label: "Staff — own timetable, classes and payslips" },
                { value: "SCHOOL_ADMIN", label: "School admin — everything" },
              ]}
            />
            {self ? <FieldDescription>You can't change your own access.</FieldDescription> : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="login-password">{staff.login ? "New password" : "Password"}</FieldLabel>
            <Input id="login-password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
            <FieldDescription>{staff.login ? "Leave empty to keep their current password." : "At least 8 characters."}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="login-confirm">Confirm password</FieldLabel>
            <Input id="login-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
          </Field>
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end">
          <Button type="submit" loading={save.isPending}>
            {staff.login ? "Save login" : "Create login"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

/* ───────────── History ───────────── */

function HistoryTab({ staff }: { staff: StaffDetail }) {
  if (!staff.statusChanges.length) {
    return <EmptyState title="No status changes yet" description={`${staff.name} has been ${STAFF_STATUS[staff.status].label.toLowerCase()} since joining on ${formatDay(staff.joinDate)}.`} />;
  }
  return (
    <Card title="Status history">
      <ol className="flex flex-col gap-4">
        {staff.statusChanges.map((row) => (
          <li key={row.id} className="flex gap-3 border-l-2 border-line pl-4">
            <div>
              <p className="flex flex-wrap items-center gap-2 text-sm">
                <StaffStatusBadge status={row.fromStatus} /> → <StaffStatusBadge status={row.toStatus} />
                <span className="text-muted-foreground">from {formatDay(row.effectiveOn)}</span>
              </p>
              {row.reason ? <p className="mt-1 text-sm">{row.reason}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                Recorded {formatDay(row.createdAt)}
                {row.actorName ? ` by ${row.actorName}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** The photo on the staff ID card. JPG and PNG print on the card; anything else shows the initial. */
function StaffPhoto({ staff, onSaved, notify }: { staff: StaffDetail; onSaved: (next: StaffDetail, message: string) => void; notify: Notify }) {
  const [busy, setBusy] = useState(false);
  const src = mediaUrl(staff.photoUrl);
  const initials = staff.name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "S";

  async function pick(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return notify("Choose a JPG or PNG photo", "error");
    if (file.size > 4 * 1024 * 1024) return notify("That photo is over 4 MB. Choose a smaller one.", "error");
    setBusy(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read that file"));
        reader.readAsDataURL(file);
      });
      onSaved(await api.saveStaffPhoto(staff.id, image), "Photo saved");
    } catch (err) {
      notify(errorText(err, "Couldn't save the photo"), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {src ? <img src={src} alt="" className="size-24 rounded-full object-cover" /> : <span aria-hidden className="grid size-24 place-items-center rounded-full bg-indigo text-2xl text-white">{initials}</span>}
      <label className="cursor-pointer text-xs text-indigo underline">
        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        {busy ? "Saving…" : src ? "Change photo" : "Add photo"}
      </label>
    </div>
  );
}
