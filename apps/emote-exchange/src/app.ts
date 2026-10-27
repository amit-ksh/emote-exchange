import { createHttpApp } from "@emote-exchange/twitch-kit";
import type { FoundationSnapshot } from "./public-state.ts";

export function createExchangeApp({ port = 4100 }: { port?: number } = {}) {
  const snapshot: FoundationSnapshot = {
    v: 1,
    seq: 0,
    app: "Emote Exchange",
    mode: "demo",
    phase: "foundation",
    simulatorRunning: false,
    overlayUrl: `http://127.0.0.1:${port}/overlay`,
  };
  return createHttpApp({ port, getSnapshot: () => snapshot });
}
