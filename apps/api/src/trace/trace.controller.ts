import { Body, Controller, Post } from "@nestjs/common";
import { appendClientTimings } from "./request-log";
import { getTraceById, type ClientTimings } from "./request-context";

@Controller("debug")
export class TraceController {
  @Post("trace")
  report(
    @Body()
    body: Partial<ClientTimings> & { id?: string },
  ) {
    if (!body?.id || body.ttfbMs == null || body.totalMs == null) return { ok: false };
    const ok = appendClientTimings(
      body.id,
      {
        ttfbMs: body.ttfbMs,
        networkMs: body.networkMs,
        downloadMs: body.downloadMs,
        totalMs: body.totalMs,
      },
      getTraceById(body.id),
    );
    return { ok };
  }
}
