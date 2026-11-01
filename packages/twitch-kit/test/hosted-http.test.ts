import assert from "node:assert/strict";
import { request as httpRequest } from "node:http";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  createHttpApp,
  createOverlayBus,
  createTwitchAuth,
  openStore,
  startHttpServer,
} from "../src/index.ts";

const origin = "https://exchange.example";

test("production listener serves a hosted owner, guards Origin and Host and closes expired SSE", async (t) => {
  let at = 1000;
  const store = openStore({ filename: ":memory:" });
  const auth = createTwitchAuth({
    store,
    publicOrigin: origin,
    ownerLogin: "ammit_ksh",
    clientId: "client",
    clientSecret: "private-secret",
    now: () => at,
    fetcher: async (input) =>
      Response.json(
        String(input).endsWith("/validate")
          ? {
              client_id: "client",
              user_id: "123",
              login: "ammit_ksh",
              scopes: ["user:read:chat", "user:write:chat", "moderator:read:followers"],
              expires_in: 7200,
            }
          : { access_token: "private-access", refresh_token: "private-refresh" },
      ),
  });
  const bus = createOverlayBus({
    initial: { label: "private dashboard" },
    now: () => at,
    schedule: () => () => {},
  });
  const app = createHttpApp({
    port: 0,
    publicOrigin: origin,
    bus,
    authorizeDashboard: auth.authorizeDashboard,
    dashboardSignal: auth.dashboardSignal,
  });
  auth.mount(app);
  let writes = 0;
  app.post("/api/check", (c) => {
    writes++;
    return c.json({ ok: true });
  });
  const root = fileURLToPath(new URL("../../../apps/emote-exchange/", import.meta.url));
  const running = await startHttpServer({
    app,
    port: 0,
    publicOrigin: origin,
    development: false,
    clientRoot: resolve(root, "client"),
    clientDist: resolve(root, "dist/client"),
  });
  t.after(async () => {
    auth.close();
    bus.close();
    store.close();
    await running.close();
  });
  const address = running.server.address();
  assert.ok(address && typeof address !== "string");
  assert.equal(address.address, "0.0.0.0");
  const port = address.port;
  async function request(path: string, headers: Record<string, string> = {}, method = "GET") {
    return new Promise<{
      status: number;
      headers: import("node:http").IncomingHttpHeaders;
      body: string;
    }>((resolveResult, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          path,
          method,
          headers: { Host: "exchange.example", ...headers },
        },
        (response) => {
          let body = "";
          response.setEncoding("utf8");
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () =>
            resolveResult({ status: response.statusCode ?? 0, headers: response.headers, body }),
          );
        },
      );
      req.setTimeout(5000, () => req.destroy(new Error("Test request timed out")));
      req.on("error", reject);
      req.end();
    });
  }
  assert.equal((await request("/healthz")).status, 200);
  assert.equal(
    (await request("/", { Host: "evil.example", "X-Forwarded-Host": "exchange.example" })).status,
    403,
  );
  assert.equal((await request("/api/snapshot")).status, 401);
  const start = await request("/auth/login");
  const state = new URL(start.headers.location ?? "").searchParams.get("state");
  assert.equal(
    new URL(start.headers.location ?? "").searchParams.get("redirect_uri"),
    `${origin}/auth/callback`,
  );
  const nonce = start.headers["set-cookie"]?.[0].split(";")[0];
  assert.ok(nonce);
  const callback = await request(`/auth/callback?state=${state}&code=private-code`, {
    Cookie: nonce,
  });
  const session = callback.headers["set-cookie"]
    ?.find((cookie) => cookie.startsWith("exchange_dashboard="))
    ?.split(";")[0];
  assert.ok(session);
  assert.equal((await request("/", { Cookie: session })).status, 200);
  const snapshot = await request("/api/snapshot", { Cookie: session });
  assert.equal(snapshot.status, 200);
  assert.equal(JSON.parse(snapshot.body).label, "private dashboard");
  assert.equal(snapshot.body.includes("private-access"), false);
  const invalidHeaders: Record<string, string>[] = [
    { Cookie: session },
    { Cookie: session, Origin: origin },
    { Cookie: session, "X-CTA": "1" },
    { Cookie: session, Origin: "https://evil.example", "X-CTA": "1" },
  ];
  for (const headers of invalidHeaders) {
    assert.equal((await request("/api/check", headers, "POST")).status, 403);
  }
  const accepted = await request(
    "/api/check",
    { Cookie: session, Origin: origin, "X-CTA": "1" },
    "POST",
  );
  assert.equal(accepted.status, 200);
  assert.equal(accepted.headers["access-control-allow-origin"], undefined);
  assert.equal(writes, 1);
  const abort = new AbortController();
  const events = await app.request(`${origin}/events?client=dashboard`, {
    headers: { Host: "exchange.example", Cookie: session },
    signal: abort.signal,
  });
  const reader = events.body?.getReader();
  assert.ok(reader);
  assert.equal((await reader.read()).done, false);
  at += 12 * 60 * 60 * 1000;
  assert.equal(auth.authorizeDashboard(session), false);
  assert.equal((await reader.read()).done, true);
  assert.equal((await request("/api/snapshot", { Cookie: session })).status, 401);
});
