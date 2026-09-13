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
  email: z.string().email().optional().or(z.literal("")),
  relation: z.string().min(1),
});

export const studentSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  admissionNo: z.string().min(1),
  gender: z.string().min(1),
  dateOfBirth: z.string().optional(),
  classId: z.string().optional(),
  status: z.string().default("active"),
  guardians: z.array(guardianSchema).optional(),
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

export type LoginInput = z.infer<typeof loginSchema>;
export type SaveAttendanceInput = z.infer<typeof saveAttendanceSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export * from "./templates";
