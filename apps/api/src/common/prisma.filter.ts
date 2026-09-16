import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientInitializationError)
export class PrismaFilter implements ExceptionFilter {
  constructor(private readonly prisma?: PrismaService) {}

  catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientInitializationError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const code = "code" in exception ? exception.code : "P1001";
    console.error(`Prisma ${code}: ${exception.message}`);
    if (code === "P2002") {
      res.status(409).json({ message: "That record already exists. Try editing it instead of creating a duplicate." });
      return;
    }
    if (code === "P2021" || code === "P2022") {
      res.status(503).json({
        message: "The database is missing tables. Run prisma migrate deploy against DATABASE_URL.",
        code,
      });
      return;
    }
    if (code === "P1001" || code === "P1017" || code === "P1002" || code === "P1000" || code === "P1011") {
      void this.prisma?.reconnect();
      res.status(503).json({
        message: "The database dropped the connection. Check DATABASE_URL and try again.",
        code,
      });
      return;
    }
    res.status(400).json({
      message: "Could not save. Check the fields and try again.",
      code,
    });
  }
}
