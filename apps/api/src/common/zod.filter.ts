import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { ZodError } from "zod";

@Catch(ZodError)
export class ZodFilter implements ExceptionFilter {
  catch(exception: ZodError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    res.status(400).json({
      message: exception.issues[0]?.message ?? "Invalid input",
      issues: exception.issues,
    });
  }
}
