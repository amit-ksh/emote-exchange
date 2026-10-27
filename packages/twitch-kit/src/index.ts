import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { isAllowedHost, isAllowedOrigin } from "./security.ts";

export { startHttpServer } from "./server.ts";

export interface HttpAppOptions<Snapshot> {
  port: number;
  getSnapshot: () => Snapshot;
}

export function createHttpApp<Snapshot>(options: HttpAppOptions<Snapshot>) {
  const app = new Hono();
  app.use("*", async (context, next) => {
    if (!isAllowedHost(context.req.header("Host"), options.port)) {
      return context.json({ error: "Forbidden" }, 403);
    }
    if (context.req.method === "OPTIONS") {
      return context.json({ error: "Forbidden" }, 403);
    }
    if (
      context.req.method !== "GET" &&
      context.req.method !== "HEAD" &&
      (!isAllowedOrigin(context.req.header("Origin"), options.port) ||
        context.req.header("X-CTA") !== "1")
    ) {
      return context.json({ error: "Forbidden" }, 403);
    }
    await next();
  });
  app.use(
    "*",
    bodyLimit({
      maxSize: 65_536,
      onError: (context) => context.json({ error: "Request body too large" }, 413),
    }),
  );
  app.get("/healthz", (context) => context.json({ ok: true }));
  app.get("/api/snapshot", (context) =>
    context.body(JSON.stringify(options.getSnapshot()), 200, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    }),
  );
  app.on(
    "HEAD",
    "/events",
    () =>
      new Response(null, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
      }),
  );
  app.get("/events", (context) => {
    const signal = context.req.raw.signal;
    const encoder = new TextEncoder();
    let cancelStream: (() => void) | undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        const ping = setInterval(() => {
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            cleanup(true);
            return;
          }
          controller.enqueue(encoder.encode(": ping\n\n"));
        }, 15_000);
        ping.unref();
        const cleanup = (close: boolean) => {
          if (closed) return;
          closed = true;
          clearInterval(ping);
          signal.removeEventListener("abort", onAbort);
          if (close) controller.close();
        };
        const onAbort = () => cleanup(true);
        cancelStream = () => cleanup(false);
        signal.addEventListener("abort", onAbort, { once: true });
        if (signal.aborted) {
          cleanup(true);
          return;
        }
        controller.enqueue(
          encoder.encode(`event: snapshot\ndata: ${JSON.stringify(options.getSnapshot())}\n\n`),
        );
      },
      cancel() {
        cancelStream?.();
      },
    });
    return new Response(body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
  return app;
}
