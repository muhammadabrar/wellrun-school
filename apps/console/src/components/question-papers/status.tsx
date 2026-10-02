import { QUESTION_PAPER_STATUS_LABEL } from "@wellrun/shared";
import { Badge } from "@wellrun/ui";
import type { QuestionPaperStatus } from "@/lib/question-papers-api";

const TONE: Record<QuestionPaperStatus, "neutral" | "warning" | "success" | "danger"> = {
  DRAFT: "neutral",
  SUBMITTED: "warning",
  APPROVED: "success",
  RETURNED: "danger",
};

export function QuestionPaperStatusBadge({ status }: { status: QuestionPaperStatus }) {
  return <Badge tone={TONE[status]}>{QUESTION_PAPER_STATUS_LABEL[status]}</Badge>;
}
