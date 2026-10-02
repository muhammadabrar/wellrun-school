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

export const feeFrequencies = ["MONTHLY", "QUARTERLY", "ANNUAL", "ONE_TIME"] as const;
export const discountTypes = ["FIXED", "PERCENT"] as const;
export const lateFeeModes = ["NONE", "FIXED", "DAILY", "PERCENT"] as const;
export const paymentMethods = ["cash", "bank", "cheque", "online", "other"] as const;

export const createPaymentSchema = z.object({
  invoiceId: z.string().optional(),
  invoiceIds: z.array(z.string()).optional(),
  allocations: z
    .array(z.object({ invoiceId: z.string(), amountPkr: z.number().int().positive() }))
    .optional(),
  studentId: z.string().optional(),
  amountPkr: z.number().int().min(0),
  useCreditPkr: z.number().int().min(0).optional(),
  requestId: z.string().max(64).optional(),
  method: z.string().default("cash"),
  referenceNumber: z.string().optional(),
  notes: z.string().optional(),
  paymentDate: z.string().optional(),
});

export const feeHeadSchema = z.object({
  name: z.string().min(1),
  code: z.string().optional(),
  category: z.string().optional(),
  frequency: z.enum(feeFrequencies).optional(),
  recurring: z.boolean().optional(),
  taxable: z.boolean().optional(),
  description: z.string().optional(),
  active: z.boolean().optional(),
  amountPkr: z.number().int().min(0).optional(),
  campusId: z.string().nullable().optional(),
});

export const feeStructureItemSchema = z.object({
  feeHeadId: z.string().min(1),
  amountPkr: z.number().int().min(0),
  isOptional: z.boolean().optional(),
  taxable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export const feeStructureSchema = z.object({
  name: z.string().min(1),
  campusId: z.string().nullable().optional(),
  academicYearId: z.string().min(1),
  className: z.string().optional(),
  section: z.string().optional(),
  frequency: z.enum(feeFrequencies).optional(),
  effectiveFrom: z.string().optional(),
  effectiveUntil: z.string().nullable().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]).optional(),
  notes: z.string().optional(),
  items: z.array(feeStructureItemSchema).optional(),
});

export const studentFeeAssignmentSchema = z.object({
  studentId: z.string().min(1),
  academicYearId: z.string().min(1),
  feeStructureId: z.string().min(1),
  effectiveFrom: z.string().optional(),
  effectiveUntil: z.string().nullable().optional(),
  notes: z.string().optional(),
  overrides: z
    .array(
      z.object({
        feeHeadId: z.string(),
        amountPkr: z.number().int().min(0).nullable().optional(),
        enabled: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const discountSchema = z.object({
  name: z.string().min(1),
  type: z.enum(discountTypes),
  value: z.number().int().min(0),
  feeHeadIds: z.array(z.string()).optional(),
  classNames: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

export const studentDiscountSchema = z.object({
  studentId: z.string().min(1),
  discountId: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(discountTypes),
  value: z.number().int().min(0),
  feeHeadIds: z.array(z.string()).optional(),
  notes: z.string().optional(),
  active: z.boolean().optional(),
});

export const generateFeesSchema = z.object({
  billingPeriod: z.string().min(4),
  campusId: z.string().optional(),
  academicYearId: z.string().optional(),
  className: z.string().optional(),
  section: z.string().optional(),
  feeStructureId: z.string().optional(),
  confirm: z.boolean().optional(),
});

export const applyFeeCatalogSchema = z.object({
  academicYearId: z.string().min(1),
  campusId: z.string().nullable().optional(),
  classNames: z.array(z.string().min(1)).min(1),
});

export const generateRemainingForStudentSchema = z.object({
  academicYearId: z.string().min(1),
});

export const generateYearForStudentSchema = z.object({
  academicYearId: z.string().min(1),
  from: z.enum(["year_start", "this_month"]).default("this_month"),
});

export const feeSettingsSchema = z.object({
  defaultDueDay: z.number().int().min(1).max(28).optional(),
  graceDays: z.number().int().min(0).max(31).optional(),
  autoGenerateEnabled: z.boolean().optional(),
  lateFeeMode: z.enum(lateFeeModes).optional(),
  lateFeeAmountPkr: z.number().int().min(0).optional(),
  lateFeePercent: z.number().int().min(0).max(100).optional(),
  lateFeeCapPkr: z.number().int().min(0).optional(),
  invoicePrefix: z.string().optional(),
  paymentPrefix: z.string().optional(),
  receiptPrefix: z.string().optional(),
  receiptHeader: z.string().optional(),
  receiptFooter: z.string().optional(),
  showTaxOnReceipt: z.boolean().optional(),
  taxNumber: z.string().optional(),
  ntn: z.string().optional(),
  strn: z.string().optional(),
  primaryColor: z.string().optional(),
  fbrEnabled: z.boolean().optional(),
  fbrEnvironment: z.enum(["sandbox", "production"]).optional(),
  fbrCredentials: z.string().optional(),
});

export const applyCreditSchema = z.object({
  studentId: z.string().min(1),
  creditId: z.string().min(1),
  invoiceId: z.string().optional(),
  amountPkr: z.number().int().positive().optional(),
});

export const cancelInvoiceSchema = z.object({
  notes: z.string().optional(),
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
  campusId: z.string().optional(),
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

export const staffStatuses = ["ACTIVE", "ON_LEAVE", "SUSPENDED", "RESIGNED", "TERMINATED"] as const;
export const contractTypes = ["PERMANENT", "CONTRACT", "PROBATION", "PART_TIME", "VISITING"] as const;
export const payslipStatuses = ["DRAFT", "FINALIZED", "PAID", "CANCELLED"] as const;
export const staffLoginRoles = ["TEACHER", "SCHOOL_ADMIN"] as const;

export const STAFF_DEPARTMENTS = [
  "Academics",
  "Administration",
  "Accounts",
  "Admissions",
  "IT",
  "Library",
  "Transport",
  "Security",
  "Support staff",
] as const;

export const STAFF_DESIGNATIONS = [
  "Teacher",
  "Senior Teacher",
  "Head of Department",
  "Coordinator",
  "Vice Principal",
  "Principal",
  "Accountant",
  "Clerk",
  "Receptionist",
  "Librarian",
  "Lab Assistant",
  "IT Officer",
  "Driver",
  "Guard",
  "Peon",
] as const;

/** Pakistani CNIC: 12345-1234567-1 */
export const cnicPattern = /^\d{5}-\d{7}-\d$/;

const payLineSchema = z.object({
  label: z.string().trim().min(1),
  amountPkr: z.number().int().min(0),
});

export const staffContractSchema = z.object({
  type: z.enum(contractTypes).default("PERMANENT"),
  startDate: z.string().min(1),
  endDate: z.string().optional().or(z.literal("")),
  basicSalaryPkr: z.number().int().min(0),
  allowances: z.array(payLineSchema).default([]),
  notes: z.string().optional(),
});

export const staffAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters").optional().or(z.literal("")),
  role: z.enum(staffLoginRoles).default("TEACHER"),
});

/** Everything about a staff member that may change after they join. Name and CNIC are not here on purpose. */
export const staffUpdateSchema = z
  .object({
    gender: z.string().optional(),
    dateOfBirth: z.string().optional().or(z.literal("")),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.string().email().optional().or(z.literal("")),
    title: z.string().min(1).optional(),
    department: z.string().optional(),
    joinDate: z.string().optional().or(z.literal("")),
    campusId: z.string().optional().or(z.literal("")),
    bankName: z.string().optional(),
    bankAccountTitle: z.string().optional(),
    bankAccountNo: z.string().optional(),
    subjects: z.array(z.string()).optional(),
  })
  .strict();

export const staffCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter the full name"),
  cnic: z.string().regex(cnicPattern, "CNIC must look like 12345-1234567-1"),
  gender: z.string().optional(),
  dateOfBirth: z.string().optional().or(z.literal("")),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  title: z.string().min(1).default("Teacher"),
  department: z.string().optional(),
  joinDate: z.string().min(1, "Choose the joining date"),
  campusId: z.string().optional().or(z.literal("")),
  bankName: z.string().optional(),
  bankAccountTitle: z.string().optional(),
  bankAccountNo: z.string().optional(),
  subjects: z.array(z.string()).optional(),
  contract: staffContractSchema.optional(),
  account: staffAccountSchema.extend({ password: z.string().min(8, "Password must be at least 8 characters") }).optional(),
  classId: z.string().optional(),
  subject: z.string().optional(),
});

export const staffStatusSchema = z.object({
  status: z.enum(staffStatuses),
  effectiveOn: z.string().min(1),
  reason: z.string().optional(),
});

export const payrollGenerateSchema = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM"),
});

export const payslipUpdateSchema = z.object({
  basicPkr: z.number().int().min(0).optional(),
  allowances: z.array(payLineSchema).optional(),
  deductions: z.array(payLineSchema).optional(),
  notes: z.string().optional(),
});

export const payslipPaySchema = z.object({
  paidOn: z.string().min(1),
  method: z.string().min(1),
  reference: z.string().optional(),
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

const clockTime = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm");

export const bellScheduleSchema = z.object({
  startTime: clockTime,
  periodMinutes: z.number().int().min(20).max(90),
  periodsPerDay: z.number().int().min(1).max(12),
  breakAfter: z.number().int().min(0).max(12),
  breakMinutes: z.number().int().min(0).max(90),
});

export const generateTimetableSchema = z.object({
  classIds: z.array(z.string().min(1)).min(1),
  weekdays: z.array(z.number().int().min(1).max(6)).min(1).default([1, 2, 3, 4, 5]),
  mode: z.enum(["fill_empty", "replace"]).default("fill_empty"),
  schedule: bellScheduleSchema.optional(),
});

export const classSubjectsSchema = z.object({
  subjectIds: z.array(z.string().min(1)),
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
  feeStructureId: z.string().optional(),
  confirm: z.literal(true),
});

export const studentMoveSchema = z.object({
  classId: z.string().min(1),
  feeStructureId: z.string().optional(),
});

export const studentDeactivateSchema = z.object({
  reason: z.string().optional(),
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
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
export type FeeHeadInput = z.infer<typeof feeHeadSchema>;
export type FeeStructureInput = z.infer<typeof feeStructureSchema>;
export type GenerateFeesInput = z.infer<typeof generateFeesSchema>;
export type FeeSettingsInput = z.infer<typeof feeSettingsSchema>;

export * from "./templates";
export * from "./exams";
export * from "./syllabus";
export * from "./question-papers";
export * from "./diary";
export * from "./parent";
export * from "./reports";
export * from "./staff-attendance";
export * from "./attendance";
export * from "./dashboard";
export * from "./paging";
export * from "./academic-year";
