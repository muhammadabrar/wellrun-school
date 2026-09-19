import { AsyncLocalStorage } from "async_hooks";
import { randomBytes } from "crypto";
import type { IncomingMessage } from "http";

export type TraceQuery = {
  model: string;
  action: string;
  durationMs: number;
  atMs: number;
  slow?: boolean;
  step?: string;
};

export type TraceStep = {
  name: string;
  atMs: number;
  durationMs?: number;
};

export type ClientTimings = {
  ttfbMs: number;
  networkMs?: number;
  downloadMs?: number;
  totalMs: number;
};

export type RequestTrace = {
  id: string;
  method: string;
  path: string;
  receivedAt: number;
  receivedAtIso: string;
  status?: number;
  handlerMs?: number;
  authMs?: number;
  serverDurationMs?: number;
  steps: TraceStep[];
  queries: TraceQuery[];
  client?: ClientTimings;
  logged?: boolean;
};

const storage = new AsyncLocalStorage<RequestTrace>();
const tracesById = new Map<string, RequestTrace>();

export function traceEnabled() {
  if (process.env.REQUEST_TRACE === "0") return false;
  if (process.env.REQUEST_TRACE === "1") return true;
  return process.env.NODE_ENV !== "production";
}

export function shouldSkipTrace(req: IncomingMessage & { originalUrl?: string; path?: string }) {
  const method = (req.method ?? "GET").toUpperCase();
  if (method === "OPTIONS") return true;
  const url = req.originalUrl ?? req.url ?? "";
  const path = url.split("?")[0] ?? "";
  if (path === "/debug/trace" || path === "/health" || path === "/health/db") return true;
  if (method === "GET" && (path === "/" || path === "")) return true;
  return false;
}

export function createRequestTrace(req: IncomingMessage & { originalUrl?: string; path?: string }): RequestTrace {
  const url = req.originalUrl ?? req.url ?? "";
  const ctx: RequestTrace = {
    id: randomBytes(4).toString("hex"),
    method: (req.method ?? "GET").toUpperCase(),
    path: url.split("?")[0] || "/",
    receivedAt: Date.now(),
    receivedAtIso: new Date().toISOString(),
    steps: [{ name: "received", atMs: 0 }],
    queries: [],
  };
  tracesById.set(ctx.id, ctx);
  setTimeout(() => tracesById.delete(ctx.id), 60_000);
  return ctx;
}

export function runWithTrace<T>(ctx: RequestTrace, fn: () => T) {
  return storage.run(ctx, fn);
}

export function enterTrace(ctx: RequestTrace) {
  storage.enterWith(ctx);
}

export function getRequestTrace() {
  return storage.getStore();
}

export function getTraceById(id: string) {
  return tracesById.get(id);
}

export function atMs(ctx: RequestTrace) {
  return Date.now() - ctx.receivedAt;
}

export function recordPrismaQuery(input: { model: string; action: string; durationMs: number }) {
  const ctx = getRequestTrace();
  if (!ctx) return;
  const durationMs = Math.max(0, Math.round(input.durationMs));
  const entry: TraceQuery = {
    model: input.model,
    action: input.action,
    durationMs,
    atMs: atMs(ctx),
  };
  if (durationMs >= 200) entry.slow = true;
  ctx.queries.push(entry);
}

export function dbTotals(ctx: RequestTrace) {
  return {
    dbTotalMs: ctx.queries.reduce((sum, query) => sum + query.durationMs, 0),
    queryCount: ctx.queries.length,
  };
}
