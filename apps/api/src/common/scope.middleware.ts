import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { schoolScope } from "./school-scope";

@Injectable()
export class ScopeMiddleware implements NestMiddleware {
  use(req: Request & { schoolScope?: ReturnType<typeof schoolScope> }, _res: Response, next: NextFunction) {
    req.schoolScope = schoolScope(req.headers as Record<string, unknown>);
    next();
  }
}
