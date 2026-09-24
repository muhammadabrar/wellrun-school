import { ForbiddenException } from "@nestjs/common";
import type { CurrentUser } from "../common/current-user";
import { requireSchoolId } from "../common/roles";

export const FEE_ACTIONS = [
  "fees.view",
  "fees.create",
  "fees.update",
  "fees.delete",
  "fees.generate",
  "fees.collect",
  "fees.refund",
  "fees.void",
  "fees.receipt.view",
  "fees.receipt.print",
  "fees.report.view",
  "fees.settings.manage",
] as const;

export type FeeAction = (typeof FEE_ACTIONS)[number];

const TEACHER_ACTIONS = new Set<FeeAction>(["fees.view", "fees.receipt.view"]);

export function assertFeeAccess(user: CurrentUser, action: FeeAction) {
  const schoolId = requireSchoolId(user);
  if (user.role === "SCHOOL_ADMIN") return schoolId;
  if (user.role === "TEACHER" && TEACHER_ACTIONS.has(action)) return schoolId;
  throw new ForbiddenException("You do not have permission for this fee action");
}
