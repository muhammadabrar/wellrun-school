export const INSTITUTE_TYPES = [
  { id: "private", label: "Private" },
  { id: "public", label: "Public" },
  { id: "trust", label: "Trust" },
  { id: "semi_government", label: "Semi-government" },
  { id: "other", label: "Other" },
] as const;

export const EDUCATION_LEVELS = [
  { id: "preschool", label: "Preschool" },
  { id: "primary", label: "Primary" },
  { id: "middle", label: "Middle" },
  { id: "secondary", label: "Secondary" },
  { id: "higher_secondary", label: "Higher secondary" },
  { id: "college", label: "College" },
] as const;

export const PROVINCES = [
  "Punjab",
  "Sindh",
  "Khyber Pakhtunkhwa",
  "Balochistan",
  "Islamabad Capital Territory",
  "Gilgit-Baltistan",
  "Azad Jammu and Kashmir",
] as const;

export const CLASS_TEMPLATES = {
  pakistan_school: [
    "Pre-Nursery",
    "Nursery",
    "Prep",
    "Grade 1",
    "Grade 2",
    "Grade 3",
    "Grade 4",
    "Grade 5",
    "Grade 6",
    "Grade 7",
    "Grade 8",
    "Grade 9",
    "Grade 10",
    "Grade 11",
    "Grade 12",
  ],
  cambridge: [
    "Early Years",
    "Year 1",
    "Year 2",
    "Year 3",
    "Year 4",
    "Year 5",
    "Year 6",
    "Year 7",
    "Year 8",
    "Year 9",
    "Year 10",
    "Year 11",
    "AS Level",
    "A Level",
  ],
  college: ["First Year", "Second Year", "ICS Year 1", "ICS Year 2", "ICom Year 1", "ICom Year 2"],
  custom: ["Grade 1"],
} as const;

export type ClassTemplateId = keyof typeof CLASS_TEMPLATES;

export const CLASS_TEMPLATE_LABELS: Record<ClassTemplateId, string> = {
  pakistan_school: "Pakistan School",
  cambridge: "Cambridge",
  college: "College",
  custom: "Custom",
};

export const SUBJECT_TEMPLATES: Record<ClassTemplateId, readonly string[]> = {
  pakistan_school: [
    "English",
    "Urdu",
    "Mathematics",
    "Science",
    "Islamiyat",
    "Social Studies",
    "Computer",
    "Physics",
    "Chemistry",
    "Biology",
    "Pakistan Studies",
    "Art",
    "Physical Education",
  ],
  cambridge: [
    "English",
    "Mathematics",
    "Science",
    "ICT",
    "Urdu",
    "Islamiyat",
    "Geography",
    "History",
    "Art",
    "Physical Education",
  ],
  college: [
    "English",
    "Urdu",
    "Islamiyat",
    "Pakistan Studies",
    "Mathematics",
    "Physics",
    "Chemistry",
    "Biology",
    "Computer",
    "Accounting",
    "Economics",
  ],
  custom: ["English", "Mathematics"],
};

export function admissionFieldKey(label: string) {
  const aliases: Record<string, string> = {
    firstname: "firstName",
    lastname: "lastName",
    admissionnumber: "admissionNo",
    admissionno: "admissionNo",
    gender: "gender",
    dateofbirth: "dateOfBirth",
    dob: "dateOfBirth",
    class: "className",
    classname: "className",
    grade: "className",
    section: "section",
    guardianname: "guardianName",
    parentname: "guardianName",
    guardianphone: "guardianPhone",
    parentphone: "guardianPhone",
    parentwhatsapp: "guardianPhone",
    phonenumber: "guardianPhone",
    cnic: "guardianCnic",
    guardiancnic: "guardianCnic",
    relation: "guardianRelation",
    guardianrelation: "guardianRelation",
    classid: "classId",
    address: "address",
    studentaddress: "address",
    phone: "phone",
    studentphone: "phone",
    mobilenumber: "phone",
  };
  const compact = label.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (aliases[compact]) return aliases[compact];
  const camel = label
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)?/g, (_, char: string) => (char ? char.toUpperCase() : ""))
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
  return camel || "field";
}

export const SUBJECT_LIBRARY_SEED = [
  "English",
  "Urdu",
  "Mathematics",
  "Science",
  "Islamiyat",
  "Social Studies",
  "Computer",
  "Physics",
  "Chemistry",
  "Biology",
  "Pakistan Studies",
  "Accounting",
  "Economics",
  "Art",
  "Physical Education",
] as const;

export const SUBJECTS_BY_GRADE: Record<string, string[]> = {
  "Grade 1": ["English", "Urdu", "Mathematics", "Islamiyat", "Social Studies"],
  "Grade 2": ["English", "Urdu", "Mathematics", "Islamiyat", "Social Studies"],
  "Grade 3": ["English", "Urdu", "Mathematics", "Science", "Islamiyat", "Social Studies"],
  "Grade 4": ["English", "Urdu", "Mathematics", "Science", "Islamiyat", "Social Studies", "Computer"],
  "Grade 5": ["English", "Urdu", "Mathematics", "Science", "Islamiyat", "Social Studies", "Computer"],
  "Grade 6": ["English", "Urdu", "Mathematics", "Science", "Islamiyat", "Pakistan Studies", "Computer"],
  "Grade 7": ["English", "Urdu", "Mathematics", "Science", "Islamiyat", "Pakistan Studies", "Computer"],
  "Grade 8": ["English", "Urdu", "Mathematics", "Science", "Islamiyat", "Pakistan Studies", "Computer"],
  "Grade 9": ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Islamiyat", "Pakistan Studies"],
  "Grade 10": ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Islamiyat", "Pakistan Studies"],
  "Grade 11": ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Islamiyat", "Pakistan Studies"],
  "Grade 12": ["English", "Urdu", "Mathematics", "Physics", "Chemistry", "Biology", "Islamiyat", "Pakistan Studies"],
  "Year 1": ["English", "Mathematics", "Science", "Urdu"],
  "Year 5": ["English", "Mathematics", "Science", "Urdu", "Computer"],
  "Year 10": ["English", "Mathematics", "Physics", "Chemistry", "Biology"],
  "First Year": ["English", "Urdu", "Islamiyat", "Pakistan Studies"],
  "ICS Year 1": ["English", "Mathematics", "Computer", "Physics"],
};

export const FEE_TEMPLATE = [
  "Admission Fee",
  "Tuition Fee",
  "Exam Fee",
  "Transport Fee",
  "Computer Fee",
  "Lab Fee",
  "Activity Fee",
  "Other",
] as const;

export type AdmissionFieldGroup = "guardian" | "student";

export type AdmissionFieldDef = {
  key: string;
  label: string;
  type: string;
  required: boolean;
  locked: boolean;
  group: AdmissionFieldGroup;
};

export const LOCKED_GUARDIAN_FIELDS: AdmissionFieldDef[] = [
  { key: "guardianName", label: "Guardian name", type: "text", required: true, locked: true, group: "guardian" },
  { key: "guardianPhone", label: "Phone number", type: "text", required: true, locked: true, group: "guardian" },
  { key: "guardianCnic", label: "CNIC", type: "text", required: true, locked: true, group: "guardian" },
  { key: "guardianRelation", label: "Relation", type: "text", required: true, locked: true, group: "guardian" },
];

export const LOCKED_STUDENT_FIELDS: AdmissionFieldDef[] = [
  { key: "firstName", label: "First name", type: "text", required: true, locked: true, group: "student" },
  { key: "lastName", label: "Last name", type: "text", required: true, locked: true, group: "student" },
  { key: "dateOfBirth", label: "Date of birth", type: "date", required: true, locked: true, group: "student" },
  { key: "className", label: "Class", type: "class", required: true, locked: true, group: "student" },
  { key: "section", label: "Section", type: "section", required: true, locked: true, group: "student" },
];

export const LOCKED_ADMISSION_FIELDS: AdmissionFieldDef[] = [...LOCKED_GUARDIAN_FIELDS, ...LOCKED_STUDENT_FIELDS];

export const SYSTEM_ADMISSION_KEYS = ["rollNo", "admissionNo", "admissionDate", "firstAdmissionDate"] as const;

export const DEFAULT_ADMISSION_FIELDS: AdmissionFieldDef[] = [
  ...LOCKED_ADMISSION_FIELDS,
  { key: "phone", label: "Phone number", type: "text", required: false, locked: false, group: "student" },
  { key: "address", label: "Address", type: "text", required: false, locked: false, group: "student" },
  { key: "gender", label: "Gender", type: "select", required: false, locked: false, group: "student" },
];

const LOCKED_KEYS = new Set(LOCKED_ADMISSION_FIELDS.map((field) => field.key));
const SYSTEM_KEYS = new Set<string>(SYSTEM_ADMISSION_KEYS);

export function isLockedAdmissionKey(key: string) {
  return LOCKED_KEYS.has(key);
}

export function isSystemAdmissionKey(key: string) {
  return SYSTEM_KEYS.has(key);
}

export function normalizeAdmissionFields(
  fields?: Array<{ key?: string; label: string; type?: string; required?: boolean; locked?: boolean; group?: string }>,
): AdmissionFieldDef[] {
  const incoming = (fields ?? []).filter((field) => {
    const key = field.key?.trim() || admissionFieldKey(field.label);
    return !SYSTEM_KEYS.has(key);
  });
  const byKey = new Map(incoming.map((field) => [field.key?.trim() || admissionFieldKey(field.label), field]));
  const locked = LOCKED_ADMISSION_FIELDS.map((field) => ({
    ...field,
    label: byKey.get(field.key)?.label?.trim() || field.label,
  }));
  const extras = incoming
    .map((field) => {
      const key = field.key?.trim() || admissionFieldKey(field.label);
      const group: AdmissionFieldGroup =
        field.group === "guardian" || key.startsWith("guardian") ? "guardian" : "student";
      return {
        key,
        label: field.label,
        type: field.type || "text",
        required: Boolean(field.required),
        locked: false,
        group,
      };
    })
    .filter((field) => !LOCKED_KEYS.has(field.key));
  return [
    ...locked.filter((field) => field.group === "guardian"),
    ...extras.filter((field) => field.group === "guardian"),
    ...locked.filter((field) => field.group === "student"),
    ...extras.filter((field) => field.group === "student"),
  ];
}

export function classSortIndex(name: string) {
  const order = CLASS_TEMPLATES.pakistan_school as readonly string[];
  const index = order.findIndex((item) => item.toLowerCase() === name.toLowerCase());
  return index === -1 ? 500 + name.charCodeAt(0) : index;
}

export const CAMPUS_ROLES = [
  { id: "SUPER_ADMIN", label: "Super admin" },
  { id: "ADMIN", label: "Campus admin" },
  { id: "PRINCIPAL", label: "Principal" },
  { id: "TEACHER", label: "Teacher" },
] as const;
