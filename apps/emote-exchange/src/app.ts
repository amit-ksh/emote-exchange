import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Store } from "@emote-exchange/twitch-kit";
import {
  createChatOut,
  createEmoteCatalog,
  createEventSub,
  createHelix,
  createHttpApp,
  createOverlayBus,
  createSimulator,
  createTwitchAuth,
  loadDemoCatalog,
  openStore,
} from "@emote-exchange/twitch-kit";
import { createAnalyticsFeed } from "./analytics-feed.ts";
import type { MarketMoment } from "./engine/market.ts";
import { defaultMarketSettings } from "./engine/settings.ts";
import { createMarketRuntime } from "./market-runtime.ts";
import { marketMigrations } from "./market-store.ts";
import type { FoundationDisplay } from "./public-state.ts";
import { exchangeScenarios } from "./simulation.ts";

interface ExchangeRuntimeOptions {
  port?: number;
  filename?: string;
  now?: () => number;
  clientId?: string;
  clientSecret?: string;
  publicOrigin?: string;
  wsUrl?: string;
  subscriptionsUrl?: string;
  marketAutoTick?: boolean;
  hosting?: { ownerLogin: string };
  store?: Store;
}

export function createExchangeRuntime({
  port = 4100,
  filename = ":memory:",
  now = Date.now,
  clientId = "",
  clientSecret = "",
  publicOrigin = `http://localhost:${port}`,
  wsUrl,
  subscriptionsUrl,
  marketAutoTick,
  hosting,
  store: providedStore,
}: ExchangeRuntimeOptions = {}) {
  const store = providedStore ?? openStore({ filename, migrations: marketMigrations });
  const cleanup: (() => void)[] = [];
  try {
    const settings = store.settings({ connectionChecks: 0, quietMode: false, simulationRuns: 0 });
    let publishState = () => {};
    let syncAuth = () => {};
    let syncMarketCatalog = () => {};
    let publishMarket = (_moments: MarketMoment[]) => {};
    const auth = createTwitchAuth({
      store,
      clientId,
      clientSecret,
      publicOrigin,
      ownerLogin: hosting?.ownerLogin,
      now,
      onChange: () => {
        syncAuth();
        publishState();
      },
    });
    const helix = createHelix({ auth, clientId, now });
    cleanup.push(
      () => auth.close(),
      () => helix.close(),
    );
    const demoEmotes = loadDemoCatalog(new URL("../client/public/demo-emotes/", import.meta.url));
    const catalog = createEmoteCatalog({
      store,
      auth,
      helix,
      now,
      demo: demoEmotes,
      onChange: () => {
        syncMarketCatalog();
        publishState();
      },
    });
    const chatOut = createChatOut({
      auth,
      helix,
      now,
      quiet: settings.get("quietMode"),
      onChange: () => publishState(),
    });
    cleanup.push(
      () => catalog.close(),
      () => chatOut.close(),
    );
    const market = createMarketRuntime({
      store,
      now,
      catalog: catalog.entries(),
      autoTick: marketAutoTick,
      say: chatOut.enqueue,
      publish: (moments) => publishMarket(moments),
    });
    cleanup.push(() => market.close());
    syncMarketCatalog = () => market.setCatalog(catalog.entries());
    const receiveEvent: typeof market.receive = (event) => {
      const result = market.receive(event);
      if (result instanceof Promise) void result.catch(() => {});
      return result;
    };
    const simulator = createSimulator({
      emotes: demoEmotes,
      scenarios: exchangeScenarios,
      now,
      initialRun: settings.get("simulationRuns"),
      onRun: (run) => {
        void Promise.resolve(settings.set("simulationRuns", run)).catch(() => {});
      },
      onEvent: receiveEvent,
      onChange: () => publishState(),
    });
    const eventsub = createEventSub({
      auth,
      helix,
      clientId,
      wsUrl,
      subscriptionsUrl,
      now,
      onChange: () => publishState(),
      wasSent: (messageId) => chatOut.wasSent(messageId),
      lookupEmote: (word) => catalog.lookup(word),
      onEvent: receiveEvent,
    });
    cleanup.push(
      () => simulator.close(),
      () => eventsub.close(),
    );
    syncAuth = () => {
      chatOut.syncAuth();
      catalog.syncAuth();
      eventsub.syncAuth();
    };
    const projection: FoundationDisplay = {
      app: "Emote Exchange",
      mode: "demo",
      phase: "foundation",
      simulatorRunning: false,
      overlayUrl: hosting ? `${publicOrigin}/overlay` : `http://127.0.0.1:${port}/overlay`,
      connectionChecks: settings.get("connectionChecks"),
      auth: auth.publicState(),
      eventsub: eventsub.publicState(),
      chatOut: chatOut.publicState(),
      catalog: catalog.publicState(),
      simulator: simulator.publicState(),
      overlayClients: 0,
      market: market.display(),
    };
    if (!Number.isSafeInteger(projection.connectionChecks) || projection.connectionChecks < 0) {
      throw new Error("Stored local connection check count is invalid.");
    }
    const bus = createOverlayBus({
      onClientsChange: () => publishState(),
      initial: projection,
      now,
      schedule(callback, delayMs) {
        const timer = setTimeout(callback, delayMs);
        timer.unref();
        return () => clearTimeout(timer);
      },
    });
    // OBS receives only the market projection, never account status or chat-out diagnostics.
    const overlayDisplay = () => ({
      app: "Emote Exchange",
      simulatorRunning: simulator.publicState().running,
      market: market.display(),
    });
    const overlayBus = hosting
      ? createOverlayBus({
          initial: overlayDisplay(),
          now,
          onClientsChange: () => publishState(),
          schedule(callback, delayMs) {
            const timer = setTimeout(callback, delayMs);
            timer.unref();
            return () => clearTimeout(timer);
          },
        })
      : undefined;
    cleanup.push(() => overlayBus?.close());
    const app = createHttpApp({
      port,
      bus,
      overlayBus,
      publicOrigin: hosting ? publicOrigin : undefined,
      authorizeDashboard: auth.authorizeDashboard,
      dashboardSignal: auth.dashboardSignal,
    });
    const analyticsFeed = createAnalyticsFeed({ now, snapshot: market.analytics });
    cleanup.push(() => analyticsFeed.close());
    app.get("/api/analytics/events", (context) => {
      const sessionSignal = auth.dashboardSignal(context.req.header("Cookie"));
      const signal = sessionSignal
        ? AbortSignal.any([context.req.raw.signal, sessionSignal])
        : context.req.raw.signal;
      return new Response(context.req.method === "HEAD" ? null : analyticsFeed.connect(signal), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    });
    cleanup.push(() => bus.close());
    auth.mount(app);
    app.get("/setup-guide", (context) =>
      context.text(readFileSync(new URL("../../../docs/setup-guide.md", import.meta.url), "utf8")),
    );
    const display = (): FoundationDisplay => ({
      ...projection,
      overlayClients: (overlayBus ?? bus).clientCounts().overlay,
      mode: auth.publicState().broadcaster.connected ? "live" : "demo",
      connectionChecks: settings.get("connectionChecks"),
      auth: auth.publicState(),
      eventsub: eventsub.publicState(),
      chatOut: chatOut.publicState(),
      catalog: catalog.publicState(),
      simulatorRunning: simulator.publicState().running,
      simulator: simulator.publicState(),
      market: market.display(),
    });
    publishMarket = (moments) => {
      overlayBus?.publish(
        overlayDisplay(),
        moments.map((moment) => ({ ...moment })),
      );
      bus.publish(
        display(),
        moments.map((moment) => ({ ...moment })),
      );
    };
    publishState = () => publishMarket([]);
    app.post("/api/market/grant", async (context) => {
      const body: unknown = await context.req.json().catch(() => null);
      if (
        !body ||
        typeof body !== "object" ||
        !("userId" in body) ||
        typeof body.userId !== "string" ||
        !("amount" in body) ||
        typeof body.amount !== "number" ||
        !("requestId" in body) ||
        typeof body.requestId !== "string"
      )
        return context.json({ error: "Choose a Trader and a valid whole-Coin amount." }, 400);
      try {
        await market.receive({
          type: "Grant",
          id: `dashboard:${body.requestId}`,
          userId: body.userId,
          amount: body.amount,
          requestId: body.requestId,
          source: "dashboard",
          origin: auth.publicState().broadcaster.connected ? "twitch" : "sim",
        });
        return context.json({ ok: true });
      } catch {
        return context.json(
          { error: "Choose an existing Trader and an amount within the Grant limit." },
          400,
        );
      }
    });
    app.post("/api/market/action", async (context) => {
      const body: unknown = await context.req.json().catch(() => null);
      if (!body || typeof body !== "object" || !("type" in body))
        return context.json({ error: "Choose a valid market action." }, 400);
      const cause = { id: `dashboard:${randomUUID()}`, origin: "sim" as const };
      if (body.type === "Pause" && "value" in body && typeof body.value === "boolean")
        await market.receive({ type: "Pause", ...cause, value: body.value });
      else if (
        body.type === "Freeze" &&
        "userId" in body &&
        typeof body.userId === "string" &&
        "value" in body &&
        typeof body.value === "boolean" &&
        market.display().traders.some((row) => row.userId === body.userId)
      )
        await market.receive({ type: "Freeze", ...cause, userId: body.userId, value: body.value });
      else if (
        body.type === "Delist" &&
        "ticker" in body &&
        typeof body.ticker === "string" &&
        market.display().listings.some((row) => row.ticker === body.ticker)
      )
        await market.receive({ type: "Delist", ...cause, ticker: body.ticker });
      else if (body.type === "Reset" && "confirmation" in body && body.confirmation === "RESET")
        await market.receive({ type: "Reset", ...cause, confirmation: "RESET" });
      else return context.json({ error: "Choose a valid action, target and confirmation." }, 400);
      return context.json({ ok: true });
    });
    app.get("/api/market/settings", (context) => context.json(market.settings()));
    app.post("/api/market/settings", async (context) => {
      const body: unknown = await context.req.json().catch(() => null);
      if (!body || typeof body !== "object" || Array.isArray(body))
        return context.json({ error: "Choose valid market settings." }, 400);
      const keys = ["STARTING_COINS", "FEE", "TRADE_COOLDOWN_MS", "HEAT_HALF_LIFE", "GRANT_MAX"];
      const reset = Object.keys(body).length === 1 && "reset" in body && body.reset === true;
      if (!reset && Object.keys(body).some((key) => !keys.includes(key)))
        return context.json({ error: "Choose valid market settings." }, 400);
      try {
        await market.receive({
          type: "Settings",
          settings: reset
            ? {
                ...market.settings(),
                ...Object.fromEntries(
                  keys.map((key) => [
                    key,
                    defaultMarketSettings[key as keyof typeof defaultMarketSettings],
                  ]),
                ),
              }
            : { ...market.settings(), ...body },
        });
        return context.json(market.settings());
      } catch {
        return context.json({ error: "Choose settings within the allowed ranges." }, 400);
      }
    });
    app.post("/api/sim/start", async (context) => {
      if (simulator.publicState().running)
        return context.json({ error: "Stop the current simulation before starting another." }, 409);
      const body: unknown = await context.req.json().catch(() => null);
      if (simulator.publicState().running)
        return context.json({ error: "Stop the current simulation before starting another." }, 409);
      try {
        simulator.start(body);
        await market.settled();
        await store.settled?.();
      } catch {
        return context.json(
          { error: "Use a valid scenario, seed, rate, chatter count and persona weights." },
          400,
        );
      }
      return context.json({ ok: true });
    });
    app.post("/api/sim/stop", (context) => {
      simulator.stop();
      return context.json({ ok: true });
    });
    app.post("/api/sim/event", async (context) => {
      if (!simulator.publicState().running)
        return context.json({ error: "Start the simulator before injecting an event." }, 409);
      const body: unknown = await context.req.json().catch(() => null);
      if (
        !body ||
        typeof body !== "object" ||
        !("type" in body) ||
        !["follow", "raid", "online", "offline"].includes(body.type as string)
      )
        return context.json({ error: "Choose a supported simulated event." }, 400);
      const type = body.type as "follow" | "raid" | "online" | "offline";
      if (type === "raid") {
        const viewers = "viewers" in body ? body.viewers : 40;
        if (
          !Number.isSafeInteger(viewers) ||
          (viewers as number) < 1 ||
          (viewers as number) > 10_000
        )
          return context.json({ error: "Raid viewers must be between 1 and 10000." }, 400);
        simulator.inject({ type, chatter: 0, viewers: viewers as number });
      } else if (type === "follow") simulator.inject({ type, chatter: 0 });
      else simulator.inject({ type });
      await market.settled();
      return context.json({ ok: true });
    });
    app.post("/api/emotes/refresh", (context) => {
      void catalog.refresh();
      return context.json({ ok: true }, 202);
    });
    app.post("/api/chat-out/test", (context) => {
      if (!auth.publicState().broadcaster.connected)
        return context.json({ error: "Connect the broadcaster before sending a live test." }, 409);
      if (chatOut.publicState().quiet)
        return context.json({ error: "Turn off quiet mode before sending a live test." }, 409);
      const accepted = chatOut.enqueue({
        text: "Emote Exchange connected",
        origin: "twitch",
        priority: "reply",
      });
      return accepted
        ? context.json({ ok: true })
        : context.json({ error: "The test message could not be queued. Check the chat log." }, 409);
    });
    app.post("/api/chat-out/preview", (context) => {
      chatOut.enqueue({ text: "Emote Exchange connected", origin: "sim", priority: "reply" });
      return context.json({ ok: true });
    });
    app.post("/api/chat-out/quiet", async (context) => {
      const body: unknown = await context.req.json().catch(() => null);
      if (
        !body ||
        typeof body !== "object" ||
        !("quiet" in body) ||
        typeof body.quiet !== "boolean"
      )
        return context.json({ error: "Choose a valid quiet-mode setting." }, 400);
      await settings.set("quietMode", body.quiet);
      chatOut.setQuiet(body.quiet);
      return context.json({ ok: true });
    });
    app.post("/api/setup/check", async (context) => {
      const count = settings.get("connectionChecks");
      if (count >= Number.MAX_SAFE_INTEGER) {
        return context.json({ error: "Local connection check limit reached." }, 409);
      }
      await settings.set("connectionChecks", count + 1);
      bus.publish(display(), [
        { id: `connection-check:${count + 1}`, at: now(), kind: "connection-check" },
      ]);
      return context.json({ ok: true });
    });
    let closed = false;
    return {
      app,
      enqueueSay: chatOut.enqueue,
      receiveEvent,
      tickMarket: market.tick,
      initialize: async () => {
        await market.ready;
        await auth.initialize();
        eventsub.syncAuth();
        catalog.start();
      },
      maintenance: () => auth.maintenance(),
      close() {
        if (closed) return;
        closed = true;
        simulator.close();
        market.close();
        catalog.close();
        chatOut.close();
        eventsub.close();
        helix.close();
        auth.close();
        bus.close();
        overlayBus?.close();
        analyticsFeed.close();
        return store.close();
      },
    };
  } catch (error) {
    for (const close of cleanup.reverse()) close();
    store.close();
    throw error;
  }
}
