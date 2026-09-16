import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

function prismaDatabaseUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.hostname.includes("pooler")) {
      url.searchParams.set("pgbouncer", "true");
    }
    // Node's TLS stack often fails Neon's channel_binding=require.
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
