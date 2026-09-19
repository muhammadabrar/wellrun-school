import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { recordPrismaQuery } from "../trace/request-context";

function prismaDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  if (!raw.startsWith("postgres")) return raw;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("pooler")) {
      url.searchParams.set("pgbouncer", "true");
    }
    url.searchParams.delete("channel_binding");
    return url.toString();
  } catch {
    return raw;
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const url = prismaDatabaseUrl();
    super(url ? { datasources: { db: { url } } } : undefined);
    const base = this;
    const extended = this.$extends({
      query: {
        async $allOperations({ model, operation, args, query }) {
          const started = performance.now();
          try {
            return await query(args);
          } finally {
            recordPrismaQuery({
              model: String(model ?? "raw"),
              action: String(operation),
              durationMs: performance.now() - started,
            });
          }
        },
      },
    });
    Object.defineProperties(extended, {
      onModuleInit: { value: base.onModuleInit.bind(base) },
      onModuleDestroy: { value: base.onModuleDestroy.bind(base) },
      reconnect: { value: base.reconnect.bind(base) },
    });
    return extended as unknown as PrismaService;
  }

  async onModuleInit() {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      try {
        await this.$connect();
        return;
      } catch (error) {
        if (attempt === 6) throw error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 800));
      }
    }
  }

  async reconnect() {
    try {
      await this.$connect();
    } catch {
      // Next request retries via on-demand connect.
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
