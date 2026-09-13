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
  app.enableCors({
    origin: ["http://localhost:3001", "http://localhost:5173"],
    credentials: true,
  });
  const port = Number(process.env.API_PORT ?? 3000);
  await app.listen(port);
  console.log(`Wellrun API on http://localhost:${port}`);
}

bootstrap();
