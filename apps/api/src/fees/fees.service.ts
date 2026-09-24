import { Inject, Injectable } from "@nestjs/common";
import type { CreatePaymentInput } from "@wellrun/shared";
import type { SchoolScope } from "../common/school-scope";
import { FeePaymentService } from "./payment.service";

@Injectable()
export class FeesService {
  constructor(@Inject(FeePaymentService) private readonly payments: FeePaymentService) {}

  invoices(schoolId: string, scope: SchoolScope = {}) {
    return this.payments.invoices(schoolId, scope);
  }

  pay(schoolId: string, input: CreatePaymentInput, actorId?: string) {
    return this.payments.pay(schoolId, actorId ?? "", input);
  }

  receipt(schoolId: string, id: string) {
    return this.payments.receipt(schoolId, id);
  }
}
