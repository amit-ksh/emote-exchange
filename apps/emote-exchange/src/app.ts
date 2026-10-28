import { createHttpApp, createOverlayBus, openStore } from "@emote-exchange/twitch-kit";
import type { FoundationDisplay } from "./public-state.ts";

interface ExchangeRuntimeOptions {
  port?: number;
  filename?: string;
  now?: () => number;
}

export function createExchangeRuntime({
  port = 4100,
  filename = ":memory:",
  now = Date.now,
}: ExchangeRuntimeOptions = {}) {
  const store = openStore({ filename });
  try {
    const settings = store.settings({ connectionChecks: 0 });
    const projection: FoundationDisplay = {
      app: "Emote Exchange",
      mode: "demo",
      phase: "foundation",
      simulatorRunning: false,
      overlayUrl: `http://127.0.0.1:${port}/overlay`,
      connectionChecks: settings.get("connectionChecks"),
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
    app.post("/api/setup/check", (context) => {
      const count = settings.get("connectionChecks");
      if (count >= Number.MAX_SAFE_INTEGER) {
        return context.json({ error: "Local connection check limit reached." }, 409);
      }
      settings.set("connectionChecks", count + 1);
      bus.publish({ ...projection, connectionChecks: count + 1 }, [
        { id: `connection-check:${count + 1}`, at: now(), kind: "connection-check" },
      ]);
      return context.json({ ok: true });
    });
    let closed = false;
    return {
      app,
      close() {
        if (closed) return;
        closed = true;
        bus.close();
        store.close();
      },
    };
  } catch (error) {
    store.close();
    throw error;
  }
}
