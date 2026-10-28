import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { OverlayBus } from "./bus.ts";
import { isAllowedHost, isAllowedOrigin } from "./security.ts";

export type { AuthPublicState, AuthRole } from "./auth.ts";
export { createTwitchAuth } from "./auth.ts";
export type { OverlayBus, PublicMoment } from "./bus.ts";
export { createOverlayBus } from "./bus.ts";
export type { ChatOutLog, Say } from "./chat-out/queue.ts";
export type { ChatOutPublicState } from "./chat-out/runner.ts";
export { createChatOut } from "./chat-out/runner.ts";
export type { CatalogPublicState, CatalogSource } from "./emotes/catalog.ts";
export { createEmoteCatalog, loadDemoCatalog } from "./emotes/catalog.ts";
export type { CatalogEmote, Provider } from "./emotes/providers.ts";
export type { ChatEvent, Emote, MessagePart } from "./eventsub/normalize.ts";
export { normalizeEvent } from "./eventsub/normalize.ts";
export type { EventSubPublicState } from "./eventsub/runner.ts";
export { createEventSub, eventSubEndpoints } from "./eventsub/runner.ts";
export { createHelix } from "./helix.ts";
export { startHttpServer } from "./server.ts";
export type { SimAction, SimConfig, SimScenario } from "./sim/engine.ts";
export type { SimulatorPublicState } from "./sim/runtime.ts";
export { createSimulator } from "./sim/runtime.ts";
export type { Migration, Store, StoreWrite } from "./store/index.ts";
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
    const origin = context.req.header("Origin");
    if (
      (context.req.path === "/events" || context.req.path.startsWith("/api/")) &&
      origin !== undefined &&
      !isAllowedOrigin(origin, options.port)
    )
      return context.json({ error: "Forbidden" }, 403);
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
  app.use("/events", async (context, next) => {
    if (context.req.method === "HEAD")
      return new Response(null, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
      });
    await next();
  });
  app.get("/events", (context) => {
    const kind = context.req.query("client") ?? "dashboard";
    if (kind !== "overlay" && kind !== "dashboard")
      return context.json({ error: "Choose an overlay or dashboard client." }, 400);
    return new Response(options.bus.connect(context.req.raw.signal, kind), {
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
