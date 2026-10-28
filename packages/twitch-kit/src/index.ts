import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { OverlayBus } from "./bus.ts";
import { isAllowedHost, isAllowedOrigin } from "./security.ts";

export type { OverlayBus, PublicMoment } from "./bus.ts";
export { createOverlayBus } from "./bus.ts";
export { startHttpServer } from "./server.ts";
export { openStore } from "./store/index.ts";

export interface HttpAppOptions<Display extends object> {
  port: number;
  bus: Pick<OverlayBus<Display>, "snapshot" | "connect">;
}

export function createHttpApp<Display extends object>(options: HttpAppOptions<Display>) {
  const app = new Hono();
  app.onError((_, context) => context.json({ error: "Unable to complete the local action." }, 500));
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
    context.body(JSON.stringify(options.bus.snapshot()), 200, {
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
    return new Response(options.bus.connect(context.req.raw.signal), {
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
