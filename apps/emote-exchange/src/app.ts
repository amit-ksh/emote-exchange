import {
  createChatOut,
  createEmoteCatalog,
  createEventSub,
  createHelix,
  createHttpApp,
  createOverlayBus,
  createTwitchAuth,
  loadDemoCatalog,
  openStore,
} from "@emote-exchange/twitch-kit";
import type { FoundationDisplay } from "./public-state.ts";

interface ExchangeRuntimeOptions {
  port?: number;
  filename?: string;
  now?: () => number;
  clientId?: string;
  clientSecret?: string;
  publicOrigin?: string;
  wsUrl?: string;
  subscriptionsUrl?: string;
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
}: ExchangeRuntimeOptions = {}) {
  const store = openStore({ filename });
  try {
    const settings = store.settings({ connectionChecks: 0, quietMode: false });
    let publishState = () => {};
    let syncAuth = () => {};
    const auth = createTwitchAuth({
      store,
      clientId,
      clientSecret,
      publicOrigin,
      now,
      onChange: () => {
        syncAuth();
        publishState();
      },
    });
    const helix = createHelix({ auth, clientId, now });
    const catalog = createEmoteCatalog({
      store,
      auth,
      helix,
      now,
      demo: loadDemoCatalog(new URL("../client/public/demo-emotes/", import.meta.url)),
      onChange: () => publishState(),
    });
    const chatOut = createChatOut({
      auth,
      helix,
      now,
      quiet: settings.get("quietMode"),
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
    });
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
      overlayUrl: `http://127.0.0.1:${port}/overlay`,
      connectionChecks: settings.get("connectionChecks"),
      auth: auth.publicState(),
      eventsub: eventsub.publicState(),
      chatOut: chatOut.publicState(),
      catalog: catalog.publicState(),
    };
    if (!Number.isSafeInteger(projection.connectionChecks) || projection.connectionChecks < 0) {
      throw new Error("Stored local connection check count is invalid.");
    }
    const bus = createOverlayBus({
      initial: projection,
      now,
      schedule(callback, delayMs) {
        const timer = setTimeout(callback, delayMs);
        timer.unref();
        return () => clearTimeout(timer);
      },
    });
    const app = createHttpApp({ port, bus });
    auth.mount(app);
    const display = (): FoundationDisplay => ({
      ...projection,
      mode: auth.publicState().broadcaster.connected ? "live" : "demo",
      connectionChecks: settings.get("connectionChecks"),
      auth: auth.publicState(),
      eventsub: eventsub.publicState(),
      chatOut: chatOut.publicState(),
      catalog: catalog.publicState(),
    });
    publishState = () =>
      bus.publish({
        ...display(),
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
      settings.set("quietMode", body.quiet);
      chatOut.setQuiet(body.quiet);
      return context.json({ ok: true });
    });
    app.post("/api/setup/check", (context) => {
      const count = settings.get("connectionChecks");
      if (count >= Number.MAX_SAFE_INTEGER) {
        return context.json({ error: "Local connection check limit reached." }, 409);
      }
      settings.set("connectionChecks", count + 1);
      bus.publish(display(), [
        { id: `connection-check:${count + 1}`, at: now(), kind: "connection-check" },
      ]);
      return context.json({ ok: true });
    });
    let closed = false;
    return {
      app,
      enqueueSay: chatOut.enqueue,
      initialize: async () => {
        await auth.initialize();
        eventsub.syncAuth();
        catalog.start();
      },
      maintenance: () => auth.maintenance(),
      close() {
        if (closed) return;
        closed = true;
        catalog.close();
        chatOut.close();
        eventsub.close();
        helix.close();
        auth.close();
        bus.close();
        store.close();
      },
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
