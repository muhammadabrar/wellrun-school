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
    relation: "guardianRelation",
    guardianrelation: "guardianRelation",
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

export const DEFAULT_ADMISSION_FIELDS = [
  { key: "firstName", label: "First name", type: "text", required: true },
  { key: "lastName", label: "Last name", type: "text", required: true },
  { key: "admissionNo", label: "Admission number", type: "text", required: true },
  { key: "gender", label: "Gender", type: "select", required: true },
  { key: "dateOfBirth", label: "Date of birth", type: "date", required: false },
  { key: "className", label: "Class", type: "text", required: false },
  { key: "section", label: "Section", type: "text", required: false },
  { key: "guardianName", label: "Guardian name", type: "text", required: true },
  { key: "guardianPhone", label: "Guardian phone", type: "text", required: true },
  { key: "guardianRelation", label: "Relation", type: "text", required: false },
] as const;

export const CAMPUS_ROLES = [
  { id: "SUPER_ADMIN", label: "Super admin" },
  { id: "ADMIN", label: "Campus admin" },
  { id: "PRINCIPAL", label: "Principal" },
  { id: "TEACHER", label: "Teacher" },
] as const;
