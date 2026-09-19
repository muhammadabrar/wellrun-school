import { QueryClient } from "@tanstack/react-query";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => count < 1 && error instanceof ApiError && error.status >= 500,
    },
  },
});

export const queryKeys = {
  setupStatus: ["setup", "status"] as const,
  schoolSession: ["school", "session"] as const,
  setup: ["setup"] as const,
  admissionForm: ["admission", "form"] as const,
  admission: ["admission"] as const,
  dashboard: ["dashboard"] as const,
  studentsRoot: ["students"] as const,
  students: (query: Record<string, string | number | boolean | undefined>) => ["students", query] as const,
  student: (id: string) => ["students", "detail", id] as const,
  studentTab: (id: string, tab: string) => ["students", "detail", id, tab] as const,
  admissions: (query: Record<string, string | number | boolean | undefined>) => ["admissions", query] as const,
  admissionsSummary: ["admissions", "summary"] as const,
  admissionApplication: (id: string) => ["admissions", "detail", id] as const,
  admissionDuplicates: (query: Record<string, string | undefined>) => ["admissions", "duplicates", query] as const,
  exams: ["exams"] as const,
  guardians: ["guardians"] as const,
  campuses: ["campuses"] as const,
  academics: ["academics"] as const,
  feeStructure: ["fee-structure"] as const,
  schoolProfile: ["school-profile"] as const,
  classes: ["classes"] as const,
  attendance: (classId: string, date: string) => ["attendance", classId, date] as const,
  absent: (date: string) => ["absent", date] as const,
  invoices: ["invoices"] as const,
  receipt: (id: string) => ["receipt", id] as const,
  staff: ["staff"] as const,
  invites: ["invites"] as const,
  timetable: (classId?: string) => ["timetable", classId ?? ""] as const,
  adminSchools: ["admin", "schools"] as const,
  adminClaims: ["admin", "claims"] as const,
};
