import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { defaultOverlayUrl, isOverlayUrl } from "../client/src/overlay-url.ts";
import { createExchangeRuntime } from "../src/app.ts";
import { readConfig } from "../src/config.ts";
import { chat } from "./market-fixture.ts";

const origin = "https://exchange.example";
const host = { Host: "exchange.example" };

test("hosted Turso configuration accepts DB_URL without a disk and fails closed on missing credentials or hostile URLs", () => {
  const environment = {
    DEPLOYMENT_MODE: "hosted",
    PUBLIC_ORIGIN: origin,
    TWITCH_OWNER_LOGIN: "ammit_ksh",
    TWITCH_CLIENT_ID: "id",
    TWITCH_CLIENT_SECRET: "secret",
    DB_URL: "libsql://exchange.example.turso.io",
    TURSO_AUTH_TOKEN: "private-test-token",
  };
  assert.equal(readConfig(environment).database?.url, environment.DB_URL);
  assert.equal(
    readConfig({ ...environment, DB_URL: "", TURSO_DATABASE_URL: environment.DB_URL }).database
      ?.url,
    environment.DB_URL,
  );
  assert.equal(
    readConfig({ DB_URL: environment.DB_URL, TURSO_AUTH_TOKEN: "private" }).database,
    undefined,
  );
  assert.throws(() => readConfig({ ...environment, TURSO_AUTH_TOKEN: "" }), /TURSO_AUTH_TOKEN/);
  for (const url of [
    "libsql://evil.example",
    "libsql://example.turso.io.evil.test",
    "https://user:secret@example.turso.io",
    "libsql://example.turso.io?token=private",
    "file:./data.sqlite",
  ])
    assert.throws(() => readConfig({ ...environment, DB_URL: url }), /DB_URL/);
});

test("overlay URLs retain the hosted origin and accept only same-origin HTTPS or exact local aliases", () => {
  assert.equal(defaultOverlayUrl(origin), `${origin}/overlay`);
  assert.equal(defaultOverlayUrl("http://localhost:4100"), "http://127.0.0.1:4100/overlay");
  assert.equal(isOverlayUrl(`${origin}/overlay`, origin), true);
  assert.equal(isOverlayUrl("http://127.0.0.1:4100/overlay", "http://localhost:4100"), true);
  for (const value of [
    "https://evil.example/overlay",
    "https://127.0.0.1/overlay",
    `${origin}/overlay?token=private`,
    `${origin}/overlay#x`,
    `${origin}/other`,
    "http://exchange.example/overlay",
    "https://user:secret@exchange.example/overlay",
  ])
    assert.equal(isOverlayUrl(value, origin), false);
});

test("hosted configuration is explicit, requires HTTPS, private storage and an owner", () => {
  const environment = {
    DEPLOYMENT_MODE: "hosted",
    PUBLIC_ORIGIN: origin,
    DATA_DIR: "/var/data/emote-exchange",
    TWITCH_OWNER_LOGIN: "ammit_ksh",
    TWITCH_CLIENT_ID: "id",
    TWITCH_CLIENT_SECRET: "secret",
    PORT: "10000",
  };
  const config = readConfig(environment);
  assert.deepEqual(config.hosting, { ownerLogin: "ammit_ksh" });
  assert.equal(config.publicOrigin, origin);
  assert.equal(config.port, 10000);
  for (const publicOrigin of [
    "http://exchange.example",
    `${origin}/`,
    `${origin}/path`,
    `${origin}?x=1`,
    "https://user:secret@exchange.example",
    "https://localhost",
    "https://127.0.0.1",
  ]) {
    assert.throws(
      () => readConfig({ ...environment, PUBLIC_ORIGIN: publicOrigin }),
      /PUBLIC_ORIGIN/,
    );
  }
  for (const key of [
    "TWITCH_OWNER_LOGIN",
    "TWITCH_CLIENT_ID",
    "TWITCH_CLIENT_SECRET",
    "DATA_DIR",
  ]) {
    assert.throws(() => readConfig({ ...environment, [key]: "" }), new RegExp(key));
  }
  assert.throws(() => readConfig({ ...environment, DATA_DIR: "./data" }), /DATA_DIR/);
  assert.throws(() => readConfig({ RENDER: "true" }), /DEPLOYMENT_MODE/);
  assert.throws(() => readConfig({ DEPLOYMENT_MODE: "typo" }), /DEPLOYMENT_MODE/);
});

test("hosted routes isolate the public OBS projection and protect dashboard data and all actions", async (t) => {
  const runtime = createExchangeRuntime({
    publicOrigin: origin,
    hosting: { ownerLogin: "ammit_ksh" },
    marketAutoTick: false,
  });
  t.after(() => runtime.close());
  async function request(path: string, init: RequestInit = {}) {
    return runtime.app.request(`${origin}${path}`, {
      ...init,
      headers: { ...host, ...init.headers },
    });
  }
  assert.equal((await request("/healthz")).status, 200);
  const gate = await request("/");
  assert.match(await gate.text(), /Sign in with Twitch/);
  for (const path of [
    "/api/snapshot",
    "/events?client=dashboard",
    "/api/analytics/events",
    "/api/market/settings",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 401, path);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  }
  for (const route of runtime.app.routes.filter((route) => route.method === "POST")) {
    assert.equal(
      (
        await request(route.path, {
          method: "POST",
          headers: { Origin: origin, "X-CTA": "1" },
          body: "{}",
        })
      ).status,
      401,
      route.path,
    );
  }
  const overlay = await request("/api/snapshot?client=overlay");
  assert.equal(overlay.status, 200);
  const data = await overlay.json();
  assert.deepEqual(Object.keys(data).sort(), [
    "app",
    "market",
    "moments",
    "seq",
    "simulatorRunning",
    "v",
  ]);
  for (const key of ["auth", "chatOut", "catalog", "simulator", "connectionChecks"])
    assert.equal(key in data, false);
  assert.equal(
    (await request("/api/snapshot?client=overlay", { headers: { Origin: "https://evil.example" } }))
      .status,
    403,
  );
  assert.equal(
    (
      await request("/healthz", {
        headers: { Host: "evil.example", "X-Forwarded-Host": "exchange.example" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await request("/api/setup/check", { method: "POST", headers: { "X-CTA": "1" } })).status,
    403,
  );
  assert.equal(
    (await request("/api/setup/check", { method: "POST", headers: { Origin: origin } })).status,
    403,
  );
  const controller = new AbortController();
  const stream = await request("/events?client=overlay", { signal: controller.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get("Content-Type") ?? "", /text\/event-stream/);
  const reader = stream.body?.getReader();
  assert.ok(reader);
  const frame = new TextDecoder().decode((await reader.read()).value);
  assert.equal("auth" in JSON.parse(frame.split("\n")[1].slice(6)), false);
  controller.abort();
});

test("a hosted runtime restores Portfolios from the mounted SQLite path after restart", async () => {
  const dir = mkdtempSync(join(tmpdir(), "exchange-hosted-"));
  const options = {
    filename: join(dir, "nested", "exchange.sqlite"),
    publicOrigin: origin,
    hosting: { ownerLogin: "ammit_ksh" },
    marketAutoTick: false,
    now: () => 1000,
  };
  let runtime = createExchangeRuntime(options);
  try {
    runtime.receiveEvent(chat("sim_ann", 1000));
    const before = await (
      await runtime.app.request(`${origin}/api/snapshot?client=overlay`, { headers: host })
    ).json();
    assert.equal(before.market.traders.length, 1);
    runtime.close();
    runtime = createExchangeRuntime(options);
    const after = await (
      await runtime.app.request(`${origin}/api/snapshot?client=overlay`, { headers: host })
    ).json();
    assert.deepEqual(after.market.traders, before.market.traders);
    assert.equal(
      (await runtime.app.request(`${origin}/api/snapshot`, { headers: host })).status,
      401,
    );
  } finally {
    runtime.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
