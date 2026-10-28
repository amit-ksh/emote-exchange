import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createExchangeRuntime } from "../src/app.ts";

test("Twitch configuration exposes only safe state and disconnect remains guarded", async (t) => {
  const runtime = createExchangeRuntime({
    clientId: "private-test-id",
    clientSecret: "private-test-secret",
  });
  t.after(() => runtime.close());
  const snapshot = await (
    await runtime.app.request("http://localhost:4100/api/snapshot", {
      headers: { Host: "localhost:4100" },
    })
  ).text();
  assert.equal(JSON.parse(snapshot).auth.configured, true);
  assert.equal(snapshot.includes("private-test"), false);
  const denied = await runtime.app.request("http://localhost:4100/api/auth/disconnect", {
    method: "POST",
    headers: { Host: "localhost:4100" },
    body: JSON.stringify({ role: "broadcaster" }),
  });
  assert.equal(denied.status, 403);
  const accepted = await runtime.app.request("http://localhost:4100/api/auth/disconnect", {
    method: "POST",
    headers: {
      Host: "localhost:4100",
      Origin: "http://localhost:4100",
      "X-CTA": "1",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "broadcaster" }),
  });
  assert.equal(accepted.status, 200);
});

test("Exchange exposes an honest foundation-only display snapshot", async (context) => {
  const runtime = createExchangeRuntime();
  context.after(() => runtime.close());
  const { app } = runtime;
  const response = await app.request("http://localhost:4100/api/snapshot", {
    headers: { Host: "localhost:4100" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    v: 1,
    seq: 0,
    app: "Emote Exchange",
    mode: "demo",
    phase: "foundation",
    simulatorRunning: false,
    overlayUrl: "http://127.0.0.1:4100/overlay",
    connectionChecks: 0,
    moments: [],
    auth: {
      configured: false,
      broadcaster: { connected: false, login: null, scopes: [], reconnect: false },
      bot: { connected: false, login: null, scopes: [], reconnect: false },
    },
  });
});

test("a guarded local connection check is published and survives restart", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "emote-exchange-k1-"));
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "emote-exchange.sqlite");
  const runtime = createExchangeRuntime({ filename, now: () => 10_000 });
  try {
    const denied = await runtime.app.request("http://localhost:4100/api/setup/check", {
      method: "POST",
      headers: { Host: "localhost:4100" },
    });
    assert.equal(denied.status, 403);
    const response = await runtime.app.request("http://localhost:4100/api/setup/check", {
      method: "POST",
      headers: { Host: "localhost:4100", Origin: "http://localhost:4100", "X-CTA": "1" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    const snapshot = await (
      await runtime.app.request("http://localhost:4100/api/snapshot", {
        headers: { Host: "localhost:4100" },
      })
    ).json();
    assert.equal(snapshot.connectionChecks, 1);
    assert.equal(snapshot.seq, 1);
    assert.deepEqual(snapshot.moments, [
      { id: "connection-check:1", at: 10_000, kind: "connection-check" },
    ]);
  } finally {
    runtime.close();
  }
  const restored = createExchangeRuntime({ filename });
  try {
    const snapshot = await (
      await restored.app.request("http://localhost:4100/api/snapshot", {
        headers: { Host: "localhost:4100" },
      })
    ).json();
    assert.equal(snapshot.connectionChecks, 1);
    assert.deepEqual(snapshot.moments, []);
  } finally {
    restored.close();
  }
});
