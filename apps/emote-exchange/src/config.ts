import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eventSubEndpoints } from "@emote-exchange/twitch-kit";

export interface ExchangeConfig {
  port: number;
  publicOrigin: string;
  dataDir: string;
  wsUrl: string;
  subscriptionsUrl: string;
}

export function readConfig(environment: Record<string, string | undefined>): ExchangeConfig {
  const portText = environment.PORT ?? "4100";
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a whole number between 1 and 65535.");
  }
  const publicOrigin = environment.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
  if (publicOrigin !== `http://localhost:${port}` && publicOrigin !== `http://127.0.0.1:${port}`) {
    throw new Error("PUBLIC_ORIGIN must be an exact HTTP loopback origin at PORT.");
  }
  const dataPath = environment.DATA_DIR ?? "./data";
  if (!dataPath.trim() || dataPath.includes("\0")) {
    throw new Error("DATA_DIR must be a nonempty local path.");
  }
  const dataDir = resolve(fileURLToPath(new URL("../", import.meta.url)), dataPath);
  return {
    port,
    publicOrigin,
    dataDir,
    ...eventSubEndpoints(environment.EVENTSUB_WS_URL, environment.EVENTSUB_SUBSCRIPTIONS_URL),
  };
}
