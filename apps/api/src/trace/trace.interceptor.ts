import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { finalize } from "rxjs";
import { atMs, getRequestTrace } from "./request-context";

@Injectable()
export class TraceInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const ctx = getRequestTrace();
    if (!ctx) return next.handle();
    const started = performance.now();
    ctx.steps.push({ name: "handler", atMs: atMs(ctx) });
    return next.handle().pipe(
      finalize(() => {
        ctx.handlerMs = Math.max(0, Math.round(performance.now() - started));
        const handlerStep = ctx.steps.find((step) => step.name === "handler");
        if (handlerStep) handlerStep.durationMs = ctx.handlerMs;
      }),
    );
  }
}
