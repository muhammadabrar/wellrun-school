import type { AdmissionStatus } from "../../lib/api";

export function admissionStatusLabel(status: AdmissionStatus | string) {
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    SUBMITTED: "Submitted",
    UNDER_REVIEW: "Under review",
    ASSESSMENT_PENDING: "Assessment pending",
    INTERVIEW_PENDING: "Interview pending",
    ACCEPTED: "Accepted",
    WAITLISTED: "Waitlisted",
    REJECTED: "Rejected",
    FEE_PENDING: "Fee pending",
    DOCUMENTS_PENDING: "Documents pending",
    ADMISSION_CONFIRMED: "Admission confirmed",
    WITHDRAWN: "Withdrawn",
  };
  return labels[status] ?? status;
}

export function admissionStatusTone(status: AdmissionStatus | string): "neutral" | "indigo" | "success" | "warning" | "danger" {
  if (status === "ADMISSION_CONFIRMED" || status === "ACCEPTED") return "success";
  if (status === "REJECTED" || status === "WITHDRAWN") return "danger";
  if (status === "FEE_PENDING" || status === "DOCUMENTS_PENDING" || status === "WAITLISTED") return "warning";
  if (status === "DRAFT") return "neutral";
  return "indigo";
}
