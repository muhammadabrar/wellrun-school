import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientInitializationError)
export class PrismaFilter implements ExceptionFilter {
  constructor(private readonly prisma?: PrismaService) {}

  catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientInitializationError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    const code = "code" in exception ? exception.code : "P1001";
    if (code === "P2002") {
      res.status(409).json({ message: "That record already exists. Try editing it instead of creating a duplicate." });
      return;
    }
    if (code === "P1001" || code === "P1017" || code === "P1002") {
      void this.prisma?.reconnect();
      res.status(503).json({
        message: "The local database dropped the connection. Try the action once more.",
      });
      return;
    }
    res.status(400).json({ message: "Could not save. Check the fields and try again." });
  }
}
