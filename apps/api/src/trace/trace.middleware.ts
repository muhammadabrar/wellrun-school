import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { dbTotals } from "./request-context";
import {
  createRequestTrace,
  enterTrace,
  shouldSkipTrace,
  traceEnabled,
  type RequestTrace,
} from "./request-context";
import { writeRequestLog } from "./request-log";

export function applyTraceHeaders(res: Response, ctx: RequestTrace) {
  if (res.headersSent) return;
  const durationMs = Math.max(0, Math.round(ctx.serverDurationMs ?? Date.now() - ctx.receivedAt));
  const { dbTotalMs } = dbTotals(ctx);
  const authMs = ctx.authMs ?? 0;
  const appMs = Math.max(0, durationMs - dbTotalMs);
  res.setHeader("X-Request-Id", ctx.id);
  res.setHeader("X-Server-Duration-Ms", String(durationMs));
  res.setHeader(
    "Server-Timing",
    `app;dur=${appMs}, db;dur=${dbTotalMs}, auth;dur=${authMs}`,
  );
}

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (!traceEnabled() || shouldSkipTrace(req)) {
      next();
      return;
    }
    const ctx = createRequestTrace(req);
    let ended = false;
    const originalEnd = res.end.bind(res);
    res.end = ((...args: unknown[]) => {
      if (!ended) {
        ended = true;
        ctx.status = res.statusCode;
        ctx.serverDurationMs = Math.max(0, Date.now() - ctx.receivedAt);
        ctx.steps.push({ name: "responded", atMs: ctx.serverDurationMs, durationMs: ctx.serverDurationMs });
        applyTraceHeaders(res, ctx);
        writeRequestLog(ctx);
      }
      return (originalEnd as (...endArgs: unknown[]) => Response)(...args);
    }) as Response["end"];
    enterTrace(ctx);
    next();
  }
}
