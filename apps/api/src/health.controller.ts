import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";

@Controller()
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get()
  root() {
    return { ok: true, service: "wellrun-api" };
  }

  @Get("health")
  health() {
    return { ok: true, service: "wellrun-api" };
  }

  @Get("health/db")
  async db() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true, database: "up" };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Database unavailable";
      throw new ServiceUnavailableException({ ok: false, database: "down", message });
    }
  }
}
