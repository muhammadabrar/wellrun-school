import { z } from "zod";

/** Certificates the school issues to a student. Wording comes from a template the school can edit; the issued text is saved as written. */

export const CERTIFICATE_TYPES = ["BONAFIDE", "CHARACTER", "LEAVING", "MERIT"] as const;
export type CertificateType = (typeof CERTIFICATE_TYPES)[number];

export const CERTIFICATE_LABEL: Record<CertificateType, string> = {
  BONAFIDE: "Bonafide certificate",
  CHARACTER: "Character certificate",
  LEAVING: "School leaving certificate",
  MERIT: "Certificate of merit",
};

export const CERTIFICATE_HELP: Record<CertificateType, string> = {
  BONAFIDE: "Confirms the child is a student of the school. Used for passports, scholarships and bank accounts.",
  CHARACTER: "Speaks to the child's conduct while at the school.",
  LEAVING: "Given when a child leaves the school, with the date and reason.",
  MERIT: "Recognises an achievement such as a top position or a prize.",
};

export const CONDUCT_LEVELS = ["Excellent", "Very good", "Good", "Satisfactory"] as const;

export type CertificateField = { key: string; label: string; kind: "text" | "date" | "choice"; required: boolean; choices?: readonly string[]; hint?: string; default?: string };

/** What the person issuing the certificate fills in, beyond what the student record already knows. */
export const CERTIFICATE_FIELDS: Record<CertificateType, CertificateField[]> = {
  BONAFIDE: [{ key: "purpose", label: "What is it for? (optional)", kind: "text", required: false, hint: "For example: for a passport application" }],
  CHARACTER: [{ key: "conduct", label: "Conduct", kind: "choice", required: true, choices: CONDUCT_LEVELS, default: "Good" }],
  LEAVING: [
    { key: "leavingDate", label: "Date of leaving", kind: "date", required: true },
    { key: "reason", label: "Reason for leaving", kind: "text", required: true, hint: "For example: family moved to another city" },
    { key: "conduct", label: "Conduct", kind: "choice", required: true, choices: CONDUCT_LEVELS, default: "Good" },
  ],
  MERIT: [{ key: "achievement", label: "What is the award for?", kind: "text", required: true, hint: "For example: first position in the annual exams" }],
};

/** Words a template may use between double braces. Each is filled from the student record or the fields above. */
export const COMMON_PLACEHOLDERS = ["student", "guardian", "admissionNo", "class", "year", "dob", "school", "date", "son_daughter", "his_her", "him_her"] as const;

export const TEMPLATE_PLACEHOLDERS: Record<CertificateType, readonly string[]> = {
  BONAFIDE: [...COMMON_PLACEHOLDERS, "purposeLine"],
  CHARACTER: [...COMMON_PLACEHOLDERS, "conduct"],
  LEAVING: [...COMMON_PLACEHOLDERS, "leavingDate", "reason", "conduct"],
  MERIT: [...COMMON_PLACEHOLDERS, "achievement"],
};

export const PLACEHOLDER_HELP: Record<string, string> = {
  student: "The student's name",
  guardian: "The guardian's name",
  admissionNo: "Admission number",
  class: "Class and section",
  year: "Academic year",
  dob: "Date of birth",
  school: "The school's name",
  date: "The date it is issued",
  son_daughter: "son or daughter, or child when not recorded",
  his_her: "his or her, or their when not recorded",
  him_her: "him or her, or them when not recorded",
  purposeLine: "A sentence about the purpose, if one was given",
  conduct: "The conduct level chosen",
  leavingDate: "Date of leaving",
  reason: "Reason for leaving",
  achievement: "What the award is for",
};

export const DEFAULT_CERTIFICATES: Record<CertificateType, { title: string; body: string }> = {
  BONAFIDE: {
    title: "Bonafide Certificate",
    body: "This is to certify that {{student}}, {{son_daughter}} of {{guardian}}, is a bonafide student of {{school}}. {{student}} is enrolled in {{class}} for the academic year {{year}} under admission number {{admissionNo}}.{{purposeLine}}",
  },
  CHARACTER: {
    title: "Character Certificate",
    body: "This is to certify that {{student}}, {{son_daughter}} of {{guardian}}, is a student of {{school}}, currently studying in {{class}} under admission number {{admissionNo}}. During {{his_her}} time at the school, {{his_her}} conduct and character have been {{conduct}}. We wish {{him_her}} every success.",
  },
  LEAVING: {
    title: "School Leaving Certificate",
    body: "This is to certify that {{student}}, {{son_daughter}} of {{guardian}}, admission number {{admissionNo}}, date of birth {{dob}}, was a student of {{school}} and last studied in {{class}}. {{student}} left the school on {{leavingDate}}. Reason for leaving: {{reason}}. Conduct during the stay was {{conduct}}.",
  },
  MERIT: {
    title: "Certificate of Merit",
    body: "This certificate is proudly awarded to {{student}} of {{class}} in recognition of {{achievement}}. {{school}} congratulates {{him_her}} and wishes {{him_her}} continued success.",
  },
};

const TOKEN = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

/** Fills {{placeholders}}. A word nobody supplied becomes empty rather than showing as raw braces on a printed certificate. */
export function renderTemplate(body: string, vars: Record<string, string>) {
  return body.replace(TOKEN, (_, key: string) => vars[key] ?? "").replace(/[ \t]{2,}/g, " ").replace(/ +([.,;:])/g, "$1").trim();
}

/** Placeholders in a template that this kind of certificate doesn't know, so a typo is caught before anything is issued. */
export function unknownPlaceholders(type: CertificateType, body: string) {
  const allowed = new Set(TEMPLATE_PLACEHOLDERS[type]);
  return [...new Set([...body.matchAll(TOKEN)].map((m) => m[1]!))].filter((key) => !allowed.has(key));
}

/**
 * Words that depend on the child's recorded gender. When it isn't recorded as male or female, the wording stays neutral
 * instead of guessing.
 */
export function genderWords(gender: string | null | undefined) {
  const g = (gender ?? "").trim().toLowerCase();
  if (["male", "m", "boy"].includes(g)) return { son_daughter: "son", his_her: "his", him_her: "him" };
  if (["female", "f", "girl"].includes(g)) return { son_daughter: "daughter", his_her: "her", him_her: "her" };
  return { son_daughter: "child", his_her: "their", him_her: "them" };
}

/** What is still missing from the fields for this kind of certificate, in plain words, or null when it is complete. */
export function certificateProblem(type: CertificateType, fields: Record<string, string | undefined>, today: string) {
  for (const field of CERTIFICATE_FIELDS[type]) {
    const value = (fields[field.key] ?? "").trim();
    if (field.required && !value) return `${field.label.replace(/\?$/, "")} is needed`;
    if (value && field.kind === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${field.label} must be a date`;
    if (value && field.kind === "choice" && !field.choices?.includes(value)) return `Choose a ${field.label.toLowerCase()} from the list`;
    if (value.length > 300) return `${field.label} is too long`;
  }
  const leaving = fields.leavingDate;
  if (type === "LEAVING" && leaving && leaving > today) return "The leaving date can't be in the future";
  return null;
}

export const certificateIssueSchema = z.object({
  studentId: z.string().min(1, "Choose a student"),
  type: z.enum(CERTIFICATE_TYPES),
  fields: z.record(z.string(), z.string()).default({}),
});

export const certificateRevokeSchema = z.object({ reason: z.string().trim().min(3, "Say why it is being withdrawn").max(300) });

export const certificateTemplateSchema = z.object({
  title: z.string().trim().min(3, "Give the certificate a title").max(80),
  body: z.string().trim().min(20, "Write the wording of the certificate").max(1500, "Keep the wording under 1500 characters"),
});

export type CertificateIssueInput = z.input<typeof certificateIssueSchema>;

export type CertificateTemplateView = { type: CertificateType; title: string; body: string; custom: boolean; defaultTitle: string; defaultBody: string };

export type CertificateView = {
  id: string;
  serial: string;
  type: CertificateType;
  title: string;
  studentId: string;
  studentName: string;
  admissionNo: string;
  className: string;
  issuedOn: string;
  status: "ISSUED" | "REVOKED";
  revokedAt: string | null;
  revokeReason: string;
  issuedBy: string | null;
};

export type CertificateList = { items: CertificateView[]; total: number; page: number; pageSize: number };

export type CertificatePreview = { title: string; text: string };
