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
export { openTursoStore } from "./store/turso.ts";

export interface HttpAppOptions<Display extends object> {
  port: number;
  bus: Pick<OverlayBus<Display>, "snapshot" | "connect">;
  publicOrigin?: string;
  overlayBus?: Pick<OverlayBus<object>, "snapshot" | "connect">;
  authorizeDashboard?: (cookie: string | undefined) => boolean;
  dashboardSignal?: (cookie: string | undefined) => AbortSignal | undefined;
}

export function createHttpApp<Display extends object>(options: HttpAppOptions<Display>) {
  const app = new Hono();
  app.onError((_, context) => context.json({ error: "Unable to complete the local action." }, 500));
  app.use("*", async (context, next) => {
    if (
      !(
        isAllowedHost(context.req.header("Host"), options.port, options.publicOrigin) ||
        (options.publicOrigin &&
          context.req.path === "/healthz" &&
          ["GET", "HEAD"].includes(context.req.method) &&
          isAllowedHost(context.req.header("Host"), options.port))
      )
    ) {
      return context.json({ error: "Forbidden" }, 403);
    }
    if (context.req.method === "OPTIONS") {
      return context.json({ error: "Forbidden" }, 403);
    }
    const origin = context.req.header("Origin");
    if (
      (context.req.path === "/events" || context.req.path.startsWith("/api/")) &&
      origin !== undefined &&
      !isAllowedOrigin(origin, options.port, options.publicOrigin)
    )
      return context.json({ error: "Forbidden" }, 403);
    if (
      context.req.method !== "GET" &&
      context.req.method !== "HEAD" &&
      (!isAllowedOrigin(context.req.header("Origin"), options.port, options.publicOrigin) ||
        context.req.header("X-CTA") !== "1")
    ) {
      return context.json({ error: "Forbidden" }, 403);
    }
    if (options.publicOrigin) {
      context.header("Referrer-Policy", "no-referrer");
      context.header("X-Content-Type-Options", "nosniff");
      context.header("Cache-Control", "no-store");
      const publicRead =
        ["GET", "HEAD"].includes(context.req.method) &&
        (context.req.path === "/healthz" ||
          context.req.path === "/overlay" ||
          ["/assets/", "/fonts/", "/demo-emotes/"].some((prefix) =>
            context.req.path.startsWith(prefix),
          ) ||
          ["/auth/login", "/auth/callback"].includes(context.req.path) ||
          (["/api/snapshot", "/events"].includes(context.req.path) &&
            context.req.query("client") === "overlay"));
      if (!publicRead && !options.authorizeDashboard?.(context.req.header("Cookie"))) {
        if (context.req.path === "/" && ["GET", "HEAD"].includes(context.req.method)) {
          return context.html(
            `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Emote Exchange · Sign in</title><link rel="icon" href="/demo-emotes/DemoBull.svg"><style>body{margin:0;background:#161616;color:#f6f6f2;font:18px system-ui;display:grid;place-items:center;min-height:100svh}main{max-width:440px;margin:24px;padding:40px;background:#222;border-radius:28px}h1{font-size:36px;letter-spacing:-1px}p{line-height:1.6;color:#c3c3bc}a{display:inline-block;margin-top:16px;padding:16px 24px;border-radius:32px;background:#d4f25c;color:#171717;font-weight:650;text-decoration:none}a:focus-visible{outline:3px solid white;outline-offset:5px}</style></head><body><main><p>EMOTE EXCHANGE</p><h1>Your chat. Your market.</h1><p>Sign in with your streamer's Twitch account to open the dashboard.</p>${context.req.query("auth") === "failed" ? '<p role="alert">Sign-in failed. Use the Twitch account configured as this app\'s owner and try again.</p>' : ""}<a href="/auth/login?role=broadcaster">Sign in with Twitch</a><p>Looking for the stream graphics? <a href="/overlay">Open overlay</a></p></main></body></html>`,
          );
        }
        return context.json({ error: "Sign in with the streamer's Twitch account." }, 401);
      }
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
    context.body(
      JSON.stringify(
        (context.req.query("client") === "overlay"
          ? (options.overlayBus ?? options.bus)
          : options.bus
        ).snapshot(),
      ),
      200,
      {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    ),
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
    const session =
      kind === "dashboard" ? options.dashboardSignal?.(context.req.header("Cookie")) : undefined;
    const signal = session
      ? AbortSignal.any([context.req.raw.signal, session])
      : context.req.raw.signal;
    return new Response(
      (kind === "overlay" ? (options.overlayBus ?? options.bus) : options.bus).connect(
        signal,
        kind,
      ),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      },
    );
  });
  return app;
}
