import { join } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { startHttpServer } from "@emote-exchange/twitch-kit";
import { createExchangeRuntime } from "./app.ts";
import { readConfig } from "./config.ts";

try {
  loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

try {
  const { port, dataDir, publicOrigin, wsUrl, subscriptionsUrl } = readConfig(process.env);
  const runtime = createExchangeRuntime({
    port,
    publicOrigin,
    wsUrl,
    subscriptionsUrl,
    clientId: process.env.TWITCH_CLIENT_ID ?? "",
    clientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
    filename: join(dataDir, "emote-exchange.sqlite"),
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
    });
  } catch (error) {
    runtime.close();
    throw error;
  }
  console.log(`Emote Exchange foundation · http://localhost:${port}`);
  console.log(`OBS overlay: http://127.0.0.1:${port}/overlay`);
  const maintenance = setInterval(() => {
    void runtime.maintenance().catch(() => {});
  }, 60_000);
  maintenance.unref();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      clearInterval(maintenance);
      void running.close().then(() => {
        runtime.close();
        process.exit(0);
      });
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to start Emote Exchange.");
  process.exitCode = 1;
}
