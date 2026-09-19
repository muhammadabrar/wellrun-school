import { z } from "zod";

export const roles = [
  "PLATFORM_ADMIN",
  "SCHOOL_ADMIN",
  "TEACHER",
  "PARENT",
  "PUBLIC",
] as const;

export type Role = (typeof roles)[number];

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  confirm: z.string().min(8),
}).refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const forgotSchema = z.object({ email: z.string().email() });
export const resetSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
  confirm: z.string().min(8),
}).refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const attendanceStatus = ["PRESENT", "ABSENT", "LATE", "LEAVE", "EXCUSED"] as const;
export type AttendanceStatus = (typeof attendanceStatus)[number];

export const saveAttendanceSchema = z.object({
  classId: z.string(),
  date: z.string(),
  records: z.array(
    z.object({
      studentId: z.string(),
      status: z.enum(attendanceStatus),
    }),
  ),
});

export const createPaymentSchema = z.object({
  invoiceId: z.string(),
  amountPkr: z.number().int().positive(),
  method: z.string().default("cash"),
});

export const guardianSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  cnic: z.string().min(5).optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  relation: z.string().min(1),
  extra: z.record(z.string(), z.unknown()).optional(),
});

export const studentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  admissionNo: z.string().min(1).optional(),
  gender: z.string().min(1).optional(),
  dateOfBirth: z.string().optional(),
  classId: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  status: z.string().default("active"),
  extra: z.record(z.string(), z.unknown()).optional(),
  guardians: z.array(guardianSchema).optional(),
});

export const admitStudentSchema = z
  .object({
    studentId: z.string().optional(),
    guardianId: z.string().optional(),
    guardian: guardianSchema.optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    dateOfBirth: z.string().optional(),
    className: z.string().min(1),
    section: z.string().min(1),
    classId: z.string().optional(),
    gender: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    extra: z.record(z.string(), z.unknown()).optional(),
    guardianExtra: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.studentId) return;
    if (!value.firstName) ctx.addIssue({ code: "custom", message: "First name is required", path: ["firstName"] });
    if (!value.lastName) ctx.addIssue({ code: "custom", message: "Last name is required", path: ["lastName"] });
    if (!value.dateOfBirth) ctx.addIssue({ code: "custom", message: "Date of birth is required", path: ["dateOfBirth"] });
    if (!value.guardianId && !value.guardian) {
      ctx.addIssue({ code: "custom", message: "Add a guardian or choose one that already exists.", path: ["guardian"] });
    }
  });

export const studentListQuerySchema = z.object({
  q: z.string().optional(),
  guardian: z.string().optional(),
  address: z.string().optional(),
  dateOfBirth: z.string().optional(),
  classId: z.string().optional(),
  className: z.string().optional(),
  section: z.string().optional(),
  campusId: z.string().optional(),
  status: z.string().optional(),
  topScorer: z.enum(["true", "false"]).optional(),
  perfectAttendance: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["SCHOOL_ADMIN", "TEACHER"]),
  name: z.string().optional(),
});

export const adminSchoolSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  city: z.string().min(2),
  area: z.string().optional(),
  type: z.string().optional(),
  feeBand: z.string().optional(),
  whatsapp: z.string().optional(),
  published: z.boolean().optional(),
});

export const FEE_BANDS = [
  { id: "under_5k", label: "Under Rs. 5,000" },
  { id: "5k_10k", label: "Rs. 5,000–10,000" },
  { id: "10k_20k", label: "Rs. 10,000–20,000" },
  { id: "20k_40k", label: "Rs. 20,000–40,000" },
  { id: "40k_80k", label: "Rs. 40,000–80,000" },
  { id: "80k_plus", label: "Rs. 80,000+" },
  { id: "not_published", label: "Not published" },
] as const;

export const SCHOOL_TYPES = [
  { id: "public", label: "Public" },
  { id: "private", label: "Private" },
  { id: "trust", label: "Trust" },
  { id: "semi_government", label: "Semi-government" },
  { id: "other", label: "Other" },
] as const;

export const FACILITIES = [
  "Science lab",
  "Computer lab",
  "Library",
  "Sports ground",
  "Indoor sports",
  "Transport",
  "Prayer room",
  "Canteen",
  "AC classrooms",
  "Playground",
  "Swimming pool",
  "Hostel",
  "Daycare",
  "STEM lab",
  "Art room",
] as const;

export const classSchema = z.object({
  name: z.string().min(1),
  section: z.string().default("A"),
  yearId: z.string().optional(),
});

export const yearSchema = z.object({
  name: z.string().min(1),
  startsOn: z.string(),
  endsOn: z.string(),
  current: z.boolean().optional(),
});

export const campusSchema = z.object({
  name: z.string().min(1),
  address: z.string().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
  principal: z.string().optional(),
  code: z.string().optional(),
  isMain: z.boolean().optional(),
});

export const orgProfileSchema = z.object({
  name: z.string().min(2),
  type: z.string().min(1),
  educationLevel: z.string().optional(),
  registrationNo: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().min(2),
  province: z.string().optional(),
  country: z.string().optional(),
  logoUrl: z.string().optional(),
  coverUrl: z.string().optional(),
});

export const registerSchoolSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  confirm: z.string().min(8),
  schoolName: z.string().min(2),
}).refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

export const applyClassesSchema = z.object({
  yearId: z.string(),
  campusId: z.string().optional(),
  template: z.enum(["pakistan_school", "cambridge", "college", "custom"]),
  grades: z.array(
    z.object({
      name: z.string(),
      selected: z.boolean(),
      sections: z.array(z.string()).default(["A"]),
    }),
  ),
});

export const subjectSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  code: z.string().optional(),
  enabled: z.boolean().optional(),
  classIds: z.array(z.string()).optional(),
});

export const admissionFieldSchema = z.object({
  key: z.string().optional(),
  label: z.string().min(1),
  type: z.string().default("text"),
  required: z.boolean().optional(),
  locked: z.boolean().optional(),
  group: z.enum(["guardian", "student"]).optional(),
});

export const applySubjectsSchema = z.object({
  template: z.enum(["pakistan_school", "cambridge", "college", "custom"]),
});

export const admissionFormSchema = z.object({
  name: z.string().optional(),
  fields: z.array(admissionFieldSchema),
});

export const importStudentsSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
  mapping: z.record(z.string(), z.string()),
});

export const feeItemSchema = z.object({
  name: z.string().min(1),
  amountPkr: z.number().int().min(0),
  enabled: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const feeItemsSchema = z.object({
  items: z.array(feeItemSchema),
});

export const campusRoleSchema = z.object({
  campusId: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "PRINCIPAL", "TEACHER"]),
});

export const staffSchema = z.object({
  name: z.string().min(1),
  title: z.string().default("Teacher"),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  classId: z.string().optional(),
  subject: z.string().optional(),
});

export const profileSchema = z.object({
  about: z.string().optional(),
  location: z.string().optional(),
  principal: z.string().optional(),
  establishedYear: z.number().int().optional(),
  studentCount: z.number().int().optional(),
  teacherCount: z.number().int().optional(),
  facilities: z.array(z.string()).optional(),
  labs: z.array(z.string()).optional(),
  sports: z.array(z.string()).optional(),
  activities: z.array(z.string()).optional(),
  programs: z.array(z.string()).optional(),
  feeMinPkr: z.number().int().optional(),
  feeMaxPkr: z.number().int().optional(),
  feeNotes: z.string().optional(),
  whatsapp: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  area: z.string().optional(),
  type: z.string().optional(),
  feeBand: z.string().optional(),
});

export const claimSchema = z.object({
  slug: z.string(),
  roleAtSchool: z.string(),
  whatsapp: z.string().min(10),
  note: z.string().optional(),
});

export const lessonSchema = z.object({
  classId: z.string(),
  periodId: z.string(),
  weekday: z.number().int().min(1).max(6),
  subject: z.string().min(1),
  staffId: z.string().optional(),
  override: z.boolean().optional(),
});

export const periodSchema = z.object({
  label: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  isBreak: z.boolean().optional(),
  sortOrder: z.number().int(),
});

export const admissionStatuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "ASSESSMENT_PENDING",
  "INTERVIEW_PENDING",
  "ACCEPTED",
  "WAITLISTED",
  "REJECTED",
  "FEE_PENDING",
  "DOCUMENTS_PENDING",
  "ADMISSION_CONFIRMED",
  "WITHDRAWN",
] as const;

export const assessmentModes = ["NONE", "TEST", "INTERVIEW", "BOTH"] as const;
export const studentTypes = ["new", "transfer", "returning"] as const;
export const communicationTypes = ["NOTE", "MEETING", "EMAIL", "SMS", "NOTIFICATION"] as const;

export const admissionListQuerySchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  campusId: z.string().optional(),
  className: z.string().optional(),
  yearId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const admissionScoreSchema = z.object({
  subject: z.string().min(1),
  maxMarks: z.coerce.number().int().positive(),
  obtainedMarks: z.coerce.number().int().min(0),
});

export const admissionFeeQuoteSchema = z.object({
  feeItemId: z.string().min(1),
  name: z.string().min(1),
  catalogAmountPkr: z.coerce.number().int().min(0),
  amountPkr: z.coerce.number().int().min(0),
});

export const admissionDraftSchema = z.object({
  studentId: z.string().optional(),
  studentType: z.enum(studentTypes).optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  middleName: z.string().optional(),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional(),
  cnic: z.string().optional(),
  bloodGroup: z.string().optional(),
  nationality: z.string().optional(),
  address: z.string().optional(),
  photoUrl: z.string().optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
  yearId: z.string().optional(),
  campusId: z.string().optional(),
  className: z.string().optional(),
  section: z.string().optional(),
  targetClassId: z.string().optional(),
  previousSchool: z.string().optional(),
  previousClass: z.string().optional(),
  previousYear: z.string().optional(),
  previousResult: z.string().optional(),
  previousPct: z.string().optional(),
  transferNotes: z.string().optional(),
  guardianId: z.string().optional(),
  family: z.record(z.string(), z.unknown()).optional(),
  feeQuotes: z.array(admissionFeeQuoteSchema).optional(),
  wizardStep: z.coerce.number().int().min(1).max(6).optional(),
  assessmentMode: z.enum(assessmentModes).optional(),
  interviewAt: z.string().optional(),
  interviewer: z.string().optional(),
  interviewNotes: z.string().optional(),
  recommendation: z.string().optional(),
  scores: z.array(admissionScoreSchema).optional(),
});

export const admissionDecisionSchema = z.object({
  note: z.string().optional(),
});

export const admissionConfirmSchema = z.object({
  classId: z.string().optional(),
});

export const admissionDuplicatesQuerySchema = z.object({
  cnic: z.string().optional(),
  phone: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  dateOfBirth: z.string().optional(),
  guardianPhone: z.string().optional(),
});

export const studentBulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  action: z.enum(["assign_class", "promote", "transfer", "deactivate", "export"]),
  classId: z.string().optional(),
  confirm: z.literal(true),
});

export const studentMoveSchema = z.object({
  classId: z.string().min(1),
});

export const studentDeactivateSchema = z.object({
  reason: z.string().optional(),
});

export const examCreateSchema = z.object({
  name: z.string().min(1),
  heldOn: z.string().min(1),
  yearId: z.string().optional(),
});

export const examResultWriteSchema = z.object({
  studentId: z.string().min(1),
  subject: z.string().default(""),
  totalMarks: z.coerce.number().int().positive(),
  obtainedMarks: z.coerce.number().int().min(0),
});

export const communicationCreateSchema = z.object({
  type: z.enum(["NOTE", "MEETING"]),
  subject: z.string().optional(),
  body: z.string().min(1),
  recipient: z.string().optional(),
});

export const documentUploadSchema = z.object({
  kind: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().optional(),
  dataUrl: z.string().min(20),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export * from "./templates";
