import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { eventSubEndpoints } from "@emote-exchange/twitch-kit";

export interface ExchangeConfig {
  port: number;
  publicOrigin: string;
  dataDir: string;
  wsUrl: string;
  subscriptionsUrl: string;
  hosting?: { ownerLogin: string };
  database?: { url: string; authToken: string };
}

export function readConfig(environment: Record<string, string | undefined>): ExchangeConfig {
  const mode = environment.DEPLOYMENT_MODE ?? "local";
  if (mode !== "local" && mode !== "hosted")
    throw new Error("DEPLOYMENT_MODE must be local or hosted.");
  if (environment.RENDER === "true" && mode !== "hosted")
    throw new Error(
      "Render requires DEPLOYMENT_MODE=hosted with Turso storage or an attached persistent disk.",
    );
  const portText = environment.PORT ?? "4100";
  const port = Number(portText);
  if (!/^\d+$/.test(portText) || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be a whole number between 1 and 65535.");
  }
  const publicOrigin = environment.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
  let hosting: ExchangeConfig["hosting"];
  if (mode === "hosted") {
    try {
      const url = new URL(publicOrigin);
      if (
        url.protocol !== "https:" ||
        url.origin !== publicOrigin ||
        url.username ||
        url.password ||
        !url.hostname.includes(".") ||
        /^(localhost|127\.|0\.|\[|169\.254\.)/.test(url.hostname)
      )
        throw new Error();
    } catch {
      throw new Error(
        "PUBLIC_ORIGIN must be an exact public HTTPS origin without a path, credentials, query or fragment.",
      );
    }
    const ownerLogin = environment.TWITCH_OWNER_LOGIN ?? "";
    if (!/^[a-z0-9_]{3,25}$/.test(ownerLogin))
      throw new Error("TWITCH_OWNER_LOGIN must be the streamer's lowercase Twitch login.");
    for (const key of ["TWITCH_CLIENT_ID", "TWITCH_CLIENT_SECRET"] as const)
      if (!environment[key]?.trim()) throw new Error(`${key} is required in hosted mode.`);
    hosting = { ownerLogin };
  } else if (
    publicOrigin !== `http://localhost:${port}` &&
    publicOrigin !== `http://127.0.0.1:${port}`
  ) {
    throw new Error("PUBLIC_ORIGIN must be an exact HTTP loopback origin at PORT.");
  }
  const dataPath = environment.DATA_DIR ?? "./data";
  let database: ExchangeConfig["database"];
  const databaseUrl = environment.DB_URL || environment.TURSO_DATABASE_URL;
  if (hosting && databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      if (
        !["libsql:", "https:"].includes(url.protocol) ||
        !url.hostname.endsWith(".turso.io") ||
        url.username ||
        url.password ||
        url.port ||
        !["", "/"].includes(url.pathname) ||
        url.search ||
        url.hash
      )
        throw new Error();
    } catch {
      throw new Error(
        "DB_URL must be a Turso libSQL/HTTPS database URL without credentials, path or query.",
      );
    }
    if (!environment.TURSO_AUTH_TOKEN?.trim())
      throw new Error("TURSO_AUTH_TOKEN is required when DB_URL is set.");
    database = { url: databaseUrl, authToken: environment.TURSO_AUTH_TOKEN };
  }
  if (!dataPath.trim() || dataPath.includes("\0")) {
    throw new Error("DATA_DIR must be a nonempty local path.");
  }
  if (hosting && !database && (!environment.DATA_DIR || !isAbsolute(dataPath)))
    throw new Error(
      "DATA_DIR must be an explicit absolute path inside the persistent disk in hosted mode.",
    );
  const dataDir = resolve(fileURLToPath(new URL("../", import.meta.url)), dataPath);
  return {
    port,
    publicOrigin,
    dataDir,
    ...eventSubEndpoints(environment.EVENTSUB_WS_URL, environment.EVENTSUB_SUBSCRIPTIONS_URL),
    ...(hosting ? { hosting } : {}),
    ...(database ? { database } : {}),
  };
}
