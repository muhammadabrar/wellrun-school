import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import { join } from "path";
import { AppModule } from "./app.module";
import { PrismaFilter } from "./common/prisma.filter";
import { ZodFilter } from "./common/zod.filter";
import { PrismaService } from "./prisma/prisma.service";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalFilters(new ZodFilter(), new PrismaFilter(app.get(PrismaService)));
  app.useStaticAssets(join(process.cwd(), "uploads"), { prefix: "/uploads/" });
  const origins = (process.env.CORS_ORIGINS ?? "http://localhost:3001,http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins,
    credentials: true,
  });
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3000);
  await app.listen(port, "0.0.0.0");
  console.log(`Wellrun API on ${port}`);
}

bootstrap();
