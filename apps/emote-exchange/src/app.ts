import {
  createEventSub,
  createHttpApp,
  createOverlayBus,
  createTwitchAuth,
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
    const settings = store.settings({ connectionChecks: 0 });
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
    const eventsub = createEventSub({
      auth,
      clientId,
      wsUrl,
      subscriptionsUrl,
      now,
      onChange: () => publishState(),
    });
    syncAuth = () => eventsub.syncAuth();
    const projection: FoundationDisplay = {
      app: "Emote Exchange",
      mode: "demo",
      phase: "foundation",
      simulatorRunning: false,
      overlayUrl: `http://127.0.0.1:${port}/overlay`,
      connectionChecks: settings.get("connectionChecks"),
      auth: auth.publicState(),
      eventsub: eventsub.publicState(),
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
    });
    publishState = () =>
      bus.publish({
        ...display(),
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
      initialize: async () => {
        await auth.initialize();
        eventsub.syncAuth();
      },
      maintenance: () => auth.maintenance(),
      close() {
        if (closed) return;
        closed = true;
        eventsub.close();
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
