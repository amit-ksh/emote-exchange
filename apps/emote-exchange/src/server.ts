import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { openTursoStore, startHttpServer } from "@emote-exchange/twitch-kit";
import { createExchangeRuntime } from "./app.ts";
import { readConfig } from "./config.ts";
import { marketMigrations } from "./market-store.ts";

try {
  loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

try {
  const { port, dataDir, publicOrigin, wsUrl, subscriptionsUrl, hosting, database } = readConfig(
    process.env,
  );
  const store = database
    ? await openTursoStore({ ...database, migrations: marketMigrations })
    : undefined;
  const runtime = createExchangeRuntime({
    port,
    publicOrigin,
    wsUrl,
    subscriptionsUrl,
    clientId: process.env.TWITCH_CLIENT_ID ?? "",
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
    filename: join(dataDir, "emote-exchange.sqlite"),
    hosting,
    store,
  });
  let running: Awaited<ReturnType<typeof startHttpServer>>;
  try {
    await runtime.initialize();
    running = await startHttpServer({
      app: runtime.app,
      port,
      clientRoot: fileURLToPath(new URL("../client/", import.meta.url)),
      clientDist: fileURLToPath(new URL("../dist/client/", import.meta.url)),
      development: process.argv.includes("--dev") || process.env.NODE_ENV === "development",
      publicOrigin: hosting ? publicOrigin : undefined,
    });
  } catch (error) {
    await runtime.close();
    throw error;
  }
  console.log(`Emote Exchange · ${publicOrigin}`);
  console.log(`OBS overlay: ${hosting ? publicOrigin : `http://127.0.0.1:${port}`}/overlay`);
  const maintenance = setInterval(() => {
    void runtime.maintenance().catch(() => {});
  }, 60_000);
  maintenance.unref();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      clearInterval(maintenance);
      void running.close().then(async () => {
        await runtime.close();
        process.exit(0);
      });
    });
  }
} catch (error) {
  const code = (error as NodeJS.ErrnoException)?.code;
  console.error(
    code === "EACCES" || code === "EROFS"
      ? "Storage is not writable. On Render, attach a persistent disk at /var/data and set DATA_DIR=/var/data/emote-exchange (or a directory inside your actual disk mount). No temporary-storage fallback was used."
      : error instanceof Error
        ? error.message
        : "Unable to start Emote Exchange.",
  );
  process.exitCode = 1;
}
