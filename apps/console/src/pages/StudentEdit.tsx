import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ErrorState, LoadingState, PageHeader } from "@wellrun/ui";
import { Camera } from "lucide-react";
import { FormEvent, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DatePicker } from "@/components/form/date-picker";
import { FormSelect } from "@/components/form/form-select";
import { PhotoCropper } from "@/components/students/photo-cropper";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Toast } from "../components/motion";
import { api, currentUser, type StudentProfile } from "../lib/api";
import { mediaUrl } from "../lib/format";
import { queryKeys } from "../lib/query";
import { useCampus } from "@/hooks/use-campus";

export function StudentEditPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canMutate = currentUser()?.role === "SCHOOL_ADMIN";
  const { data: student, error: queryError, refetch } = useQuery({
    queryKey: queryKeys.student(id ?? ""),
    queryFn: () => api.student(id!),
    enabled: Boolean(id),
  });

  if (!canMutate) {
    return (
      <ErrorState
        title="You cannot edit this student"
        description="Only a school admin can change student details."
        onRetry={() => navigate(id ? `/students/${id}` : "/students")}
      />
    );
  }

  if (!student) {
    if (queryError) {
      return (
        <ErrorState
          title="Could not load student"
          description="Try again from the student profile."
          onRetry={() => void refetch()}
        />
      );
    }
    return <LoadingState variant="form" />;
  }

  return <StudentEditForm student={student} />;
}

function StudentEditForm({ student }: { student: StudentProfile }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { classes } = useCampus();
  const photoInput = useRef<HTMLInputElement>(null);
  const [firstName, setFirstName] = useState(student.firstName);
  const [lastName, setLastName] = useState(student.lastName);
  const [dateOfBirth, setDateOfBirth] = useState(student.dateOfBirth ? String(student.dateOfBirth).slice(0, 10) : "");
  const [phone, setPhone] = useState(student.phone);
  const [className, setClassName] = useState(student.class?.name ?? "");
  const [classId, setClassId] = useState(student.class?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const classOptions = useMemo(() => {
    const names = new Set(classes.map((cls) => cls.name));
    if (student.class?.name) names.add(student.class.name);
    return [...names].map((name) => ({ value: name, label: name }));
  }, [classes, student.class?.name]);
  const sectionOptions = useMemo(() => {
    const options = classes
      .filter((cls) => !className || cls.name === className)
      .map((cls) => ({ value: cls.id, label: cls.section }));
    if (
      student.class &&
      (!className || student.class.name === className) &&
      !options.some((option) => option.value === student.class!.id)
    ) {
      options.unshift({ value: student.class.id, label: student.class.section });
    }
    return options;
  }, [classes, className, student.class]);

  const savePhoto = useMutation({
    mutationFn: (dataUrl: string) => api.saveStudentPhoto(student.id, dataUrl),
    onSuccess: (next) => {
      queryClient.setQueryData(queryKeys.student(student.id), next);
      setCropFile(null);
      setToast("Photo updated.");
      window.setTimeout(() => setToast(null), 2200);
    },
    onError: (err) => {
      setPhotoError(err instanceof Error ? err.message : "Could not save this photo.");
    },
  });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      setError("First name and last name are required.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const next = await api.updateStudent(student.id, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        dateOfBirth: dateOfBirth || undefined,
        phone,
        classId: classId && classId !== student.class?.id ? classId : undefined,
      });
      queryClient.setQueryData(queryKeys.student(student.id), next);
      navigate(`/students/${student.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save these details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Link to={`/students/${student.id}`} className="text-sm text-indigo">
        Back to profile
      </Link>
      <div className="mt-4 rounded-3xl bg-surface p-6">
        <PageHeader
          title="Edit student"
          description={`${student.admissionNo} · Roll ${student.rollNo}`}
        />
        <div className="mt-6 flex flex-wrap items-start gap-5">
          <button type="button" className="relative shrink-0" onClick={() => photoInput.current?.click()} aria-label="Change photo">
            <Avatar name={`${student.firstName} ${student.lastName}`} photo={student.photo} />
            <span className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full bg-indigo text-white">
              <Camera size={14} />
            </span>
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (!file.type.startsWith("image/")) {
                setPhotoError("Choose a JPG, PNG, or WebP image.");
                return;
              }
              setPhotoError(null);
              setCropFile(file);
            }}
          />
          <p className="max-w-sm text-sm text-muted-foreground">
            Upload a JPG, PNG, or WebP photo, then crop it to a circle.
          </p>
        </div>
        {photoError ? <p className="mt-2 text-sm text-danger">{photoError}</p> : null}

        <form className="mt-8" onSubmit={(event) => void save(event)}>
          <FieldGroup className="grid grid-cols-1 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="student-first-name">First name</FieldLabel>
              <Input id="student-first-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="student-last-name">Last name</FieldLabel>
              <Input id="student-last-name" value={lastName} onChange={(event) => setLastName(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="student-dob">Date of birth</FieldLabel>
              <DatePicker id="student-dob" value={dateOfBirth} onChange={(value) => setDateOfBirth(value)} fromYear={1995} />
            </Field>
            <Field>
              <FieldLabel htmlFor="student-phone">Phone number</FieldLabel>
              <Input id="student-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="student-class">Class</FieldLabel>
              <FormSelect
                id="student-class"
                value={className || null}
                onValueChange={(value) => {
                  const nextName = value ?? "";
                  setClassName(nextName);
                  const match =
                    classes.find((cls) => cls.name === nextName && cls.id === classId) ??
                    classes.find((cls) => cls.name === nextName) ??
                    (student.class?.name === nextName ? student.class : undefined);
                  setClassId(match?.id ?? "");
                }}
                placeholder="Select class"
                options={classOptions}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="student-section">Section</FieldLabel>
              <FormSelect
                id="student-section"
                value={classId || null}
                onValueChange={(value) => setClassId(value ?? "")}
                placeholder="Select section"
                options={sectionOptions}
              />
            </Field>
          </FieldGroup>
          {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="submit" loading={saving}>Save details</Button>
            <Button type="button" variant="outline" render={<Link to={`/students/${student.id}`} />}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
      {cropFile ? (
        <PhotoCropper
          file={cropFile}
          uploading={savePhoto.isPending}
          onCancel={() => setCropFile(null)}
          onCropped={(dataUrl) => savePhoto.mutate(dataUrl)}
        />
      ) : null}
      <Toast message={toast} />
    </div>
  );
}

function Avatar({ name, photo }: { name: string; photo?: string }) {
  const src = mediaUrl(photo);
  if (src) return <img src={src} alt="" className="h-24 w-24 rounded-full object-cover" />;
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
  return <span className="flex h-24 w-24 items-center justify-center rounded-full bg-indigo text-2xl text-white">{initials || "S"}</span>;
}
