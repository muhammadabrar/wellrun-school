import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
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
