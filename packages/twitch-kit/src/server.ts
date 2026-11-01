import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Hono } from "hono";
import type { ViteDevServer } from "vite";
import { isAllowedHost, isAllowedOrigin } from "./security.ts";

export interface StartHttpServerOptions {
  app: Hono;
  port: number;
  clientRoot: string;
  clientDist: string;
  development: boolean;
  publicOrigin?: string;
}

export async function startHttpServer(options: StartHttpServerOptions) {
  const { app, port, clientRoot, clientDist, development, publicOrigin } = options;
  if (publicOrigin && development)
    throw new Error("Hosted mode requires a production client build.");
  if (!development) {
    try {
      await access(resolve(clientDist, "index.html"));
    } catch {
      throw new Error("Client build missing. Run pnpm build before starting production.");
    }
    app.use("/assets/*", serveStatic({ root: clientDist }));
    app.use("/demo-emotes/*", serveStatic({ root: clientDist }));
    app.use("/fonts/*", serveStatic({ root: clientDist }));
    app.get("/", serveStatic({ path: resolve(clientDist, "index.html") }));
    app.get("/overlay", serveStatic({ path: resolve(clientDist, "index.html") }));
  }

  const handleApp = getRequestListener(app.fetch);
  let vite: ViteDevServer | undefined;
  const server = createServer(
    {
      shouldUpgradeCallback: (request) =>
        development &&
        isAllowedHost(request.headers.host, port) &&
        isAllowedOrigin(request.headers.origin, port),
    },
    (request, response) => {
      const mutation = request.method !== "GET" && request.method !== "HEAD";
      if (
        !(
          isAllowedHost(request.headers.host, port, publicOrigin) ||
          (publicOrigin &&
            request.url === "/healthz" &&
            (request.method === "GET" || request.method === "HEAD") &&
            isAllowedHost(request.headers.host, port))
        ) ||
        request.method === "OPTIONS" ||
        (mutation &&
          (!isAllowedOrigin(request.headers.origin, port, publicOrigin) ||
            request.headers["x-cta"] !== "1")) ||
        (request.headers.upgrade &&
          (!development || !isAllowedOrigin(request.headers.origin, port)))
      ) {
        response.writeHead(403, { "Content-Type": "application/json" });
        response.end('{"error":"Forbidden"}');
        return;
      }
      let pathname: string;
      try {
        if (!request.url?.startsWith("/") || request.url.startsWith("//")) {
          throw new Error("Expected a local request path.");
        }
        pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
      } catch {
        response.writeHead(400, { "Content-Type": "application/json" });
        response.end('{"error":"Invalid request path"}');
        return;
      }
      const appRoute =
        mutation ||
        pathname === "/healthz" ||
        pathname === "/events" ||
        pathname === "/api" ||
        pathname.startsWith("/api/") ||
        pathname === "/auth" ||
        pathname.startsWith("/auth/");
      if (vite && !appRoute) {
        vite.middlewares(request, response, () => {
          void handleApp(request, response);
        });
      } else {
        void handleApp(request, response);
      }
    },
  );

  if (development) {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      root: clientRoot,
      configFile: resolve(clientRoot, "..", "vite.config.ts"),
      server: {
        middlewareMode: true,
        cors: false,
        allowedHosts: ["localhost", "127.0.0.1"],
        ws: { server },
      },
    });
  }

  try {
    await new Promise<void>((resolveListening, reject) => {
      server.once("error", reject);
      server.listen(port, publicOrigin ? "0.0.0.0" : "127.0.0.1", () => {
        server.off("error", reject);
        resolveListening();
      });
    });
  } catch (error) {
    await vite?.close();
    throw error;
  }

  return {
    server,
    async close() {
      await vite?.close();
      await new Promise<void>((resolveClosed, reject) => {
        server.close((error) => (error ? reject(error) : resolveClosed()));
        server.closeAllConnections();
      });
    },
  };
}
