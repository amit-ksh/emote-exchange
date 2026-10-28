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
  const { catalog, ...snapshot } = await response.json();
  assert.equal(catalog.ready, true);
  assert.equal(catalog.demoCount, 24);
  assert.equal(catalog.total, 24);
  assert.ok(
    catalog.examples.every((emote: { imageUrl: string }) =>
      emote.imageUrl.startsWith("/demo-emotes/"),
    ),
  );
  assert.equal(
    (
      await app.request("http://localhost:4100/api/emotes/refresh", {
        method: "POST",
        headers: { Host: "localhost:4100" },
      })
    ).status,
    403,
  );
  assert.deepEqual(snapshot, {
    v: 1,
    seq: 0,
    app: "Emote Exchange",
    mode: "demo",
    phase: "foundation",
    simulatorRunning: false,
    overlayUrl: "http://127.0.0.1:4100/overlay",
    connectionChecks: 0,
    moments: [],
    chatOut: { quiet: false, pending: 0, sending: false, sender: null, logs: [] },
    eventsub: {
      status: "disconnected",
      sessionStartedAt: null,
      lastEventAt: null,
      eventCount: 0,
      chatMessageCount: 0,
      issue: null,
      subscriptions: [
        "channel.chat.message",
        "channel.follow",
        "channel.raid",
        "stream.online",
        "stream.offline",
      ].map((type) => ({ type, status: "disconnected", httpStatus: null })),
    },
    auth: {
      configured: false,
      broadcaster: { connected: false, login: null, scopes: [], reconnect: false },
      bot: { connected: false, login: null, scopes: [], reconnect: false },
    },
  });
});

test("chat actions are guarded, demo preview stays local, and quiet mode persists", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "emote-exchange-k4-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const filename = join(directory, "state.sqlite");
  const runtime = createExchangeRuntime({ filename });
  const action = (path: string, body?: unknown) =>
    runtime.app.request(`http://localhost:4100/api/chat-out/${path}`, {
      method: "POST",
      headers: {
        Host: "localhost:4100",
        Origin: "http://localhost:4100",
        "X-CTA": "1",
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    for (const path of ["test", "preview", "quiet"])
      assert.equal(
        (
          await runtime.app.request(`http://localhost:4100/api/chat-out/${path}`, {
            method: "POST",
            headers: { Host: "localhost:4100" },
          })
        ).status,
        403,
      );
    assert.equal((await action("test")).status, 409);
    assert.equal((await action("preview")).status, 200);
    assert.equal((await action("quiet", { quiet: "true" })).status, 400);
    assert.equal((await action("quiet", { quiet: true })).status, 200);
    const view = await (
      await runtime.app.request("http://localhost:4100/api/snapshot", {
        headers: { Host: "localhost:4100" },
      })
    ).json();
    assert.equal(view.chatOut.quiet, true);
    assert.equal(view.chatOut.pending, 0);
    assert.equal(view.chatOut.logs[0].kind, "would-have-said");
    assert.equal(view.chatOut.logs[0].text, "Emote Exchange connected");
    assert.equal(view.chatOut.logs[0].origin, "sim");
  } finally {
    runtime.close();
  }
  const restored = createExchangeRuntime({ filename });
  try {
    const view = await (
      await restored.app.request("http://localhost:4100/api/snapshot", {
        headers: { Host: "localhost:4100" },
      })
    ).json();
    assert.equal(view.chatOut.quiet, true);
    assert.deepEqual(view.chatOut.logs, []);
  } finally {
    restored.close();
  }
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
