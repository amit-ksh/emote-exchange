import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { startHttpServer } from "@emote-exchange/twitch-kit";
import { createExchangeApp } from "./app.ts";
import { readConfig } from "./config.ts";

try {
  loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

try {
  const { port } = readConfig(process.env);
  const running = await startHttpServer({
    app: createExchangeApp({ port }),
    port,
    clientRoot: fileURLToPath(new URL("../client/", import.meta.url)),
    clientDist: fileURLToPath(new URL("../dist/client/", import.meta.url)),
    development: process.argv.includes("--dev") || process.env.NODE_ENV === "development",
  });
  console.log(`Emote Exchange foundation · Demo mode · http://localhost:${port}`);
  console.log(`OBS overlay: http://127.0.0.1:${port}/overlay`);
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      void running.close().then(() => process.exit(0));
    });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Unable to start Emote Exchange.");
  process.exitCode = 1;
}
