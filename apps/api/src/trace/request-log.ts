import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { dbTotals, type ClientTimings, type RequestTrace } from "./request-context";

const logsDir = join(__dirname, "..", "..", "logs", "requests");

function fileName(ctx: RequestTrace) {
  const stamp = ctx.receivedAtIso.replace(/[:.]/g, "-").slice(0, 19);
  const pathPart = ctx.path.replace(/^\//, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/-$/, "") || "root";
  return `${stamp}_${ctx.method}_${pathPart}_${ctx.id}.json`;
}

function filePathFor(ctx: RequestTrace) {
  return join(logsDir, fileName(ctx));
}

function payload(ctx: RequestTrace) {
  const { dbTotalMs, queryCount } = dbTotals(ctx);
  return {
    id: ctx.id,
    method: ctx.method,
    path: ctx.path,
    status: ctx.status ?? 0,
    server: {
      receivedAt: ctx.receivedAtIso,
      durationMs: ctx.serverDurationMs ?? atLeastZero(Date.now() - ctx.receivedAt),
      authMs: ctx.authMs ?? 0,
      handlerMs: ctx.handlerMs ?? 0,
      dbTotalMs,
      queryCount,
    },
    steps: ctx.steps,
    queries: ctx.queries,
    ...(ctx.client ? { client: ctx.client } : {}),
  };
}

function atLeastZero(value: number) {
  return Math.max(0, Math.round(value));
}

function writeFile(ctx: RequestTrace) {
  mkdirSync(logsDir, { recursive: true });
  writeFileSync(filePathFor(ctx), `${JSON.stringify(payload(ctx), null, 2)}\n`);
}

function stdoutLine(ctx: RequestTrace) {
  const { dbTotalMs, queryCount } = dbTotals(ctx);
  const slow = ctx.queries.filter((query) => query.slow).length;
  const parts = [
    `[trace] ${ctx.method} ${ctx.path} ${ctx.status ?? 0}`,
    `server=${ctx.serverDurationMs ?? 0}ms`,
    `auth=${ctx.authMs ?? 0}ms`,
    `db=${dbTotalMs}ms`,
    `queries=${queryCount}`,
  ];
  if (slow) parts.push(`slow=${slow}`);
  if (ctx.client) {
    parts.push(`clientTotal=${ctx.client.totalMs}ms`);
    if (ctx.client.networkMs != null) parts.push(`network=${ctx.client.networkMs}ms`);
  }
  return parts.join(" ");
}

export function writeRequestLog(ctx: RequestTrace) {
  writeFile(ctx);
  if (!ctx.logged) {
    console.log(stdoutLine(ctx));
    ctx.logged = true;
    return;
  }
  if (ctx.client) console.log(stdoutLine(ctx));
}

export function appendClientTimings(id: string, client: ClientTimings, lookup: RequestTrace | undefined) {
  if (!lookup) return false;
  lookup.client = {
    ttfbMs: Math.round(client.ttfbMs),
    downloadMs: client.downloadMs != null ? Math.round(client.downloadMs) : undefined,
    networkMs: client.networkMs != null ? Math.max(0, Math.round(client.networkMs)) : undefined,
    totalMs: Math.round(client.totalMs),
  };
  writeRequestLog(lookup);
  return true;
}
