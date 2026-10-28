import {
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
}

export function createExchangeRuntime({
  port = 4100,
  filename = ":memory:",
  now = Date.now,
  clientId = "",
  clientSecret = "",
  publicOrigin = `http://localhost:${port}`,
}: ExchangeRuntimeOptions = {}) {
  const store = openStore({ filename });
  try {
    const settings = store.settings({ connectionChecks: 0 });
    let publishAuth = () => {};
    const auth = createTwitchAuth({
      store,
      clientId,
      clientSecret,
      publicOrigin,
      now,
      onChange: () => publishAuth(),
    });
    const projection: FoundationDisplay = {
      app: "Emote Exchange",
      mode: "demo",
      phase: "foundation",
      simulatorRunning: false,
      overlayUrl: `http://127.0.0.1:${port}/overlay`,
      connectionChecks: settings.get("connectionChecks"),
      auth: auth.publicState(),
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
    publishAuth = () =>
      bus.publish({
        ...projection,
        connectionChecks: settings.get("connectionChecks"),
        auth: auth.publicState(),
      });
    app.post("/api/setup/check", (context) => {
      const count = settings.get("connectionChecks");
      if (count >= Number.MAX_SAFE_INTEGER) {
        return context.json({ error: "Local connection check limit reached." }, 409);
      }
      settings.set("connectionChecks", count + 1);
      bus.publish({ ...projection, connectionChecks: count + 1, auth: auth.publicState() }, [
        { id: `connection-check:${count + 1}`, at: now(), kind: "connection-check" },
      ]);
      return context.json({ ok: true });
    });
    let closed = false;
    return {
      app,
      initialize: () => auth.initialize(),
      maintenance: () => auth.maintenance(),
      close() {
        if (closed) return;
        closed = true;
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
