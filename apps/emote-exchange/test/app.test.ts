import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createExchangeRuntime } from "../src/app.ts";

test("overlay checklist counts only overlay SSE clients and reconnects with a fresh snapshot", async (t) => {
  const runtime = createExchangeRuntime();
  t.after(() => runtime.close());
  const headers = { Host: "localhost:4100" };
  const snapshot = async () =>
    (await runtime.app.request("http://localhost:4100/api/snapshot", { headers })).json();
  const connect = async (kind: string) => {
    const abort = new AbortController();
    const response = await runtime.app.request(
      new Request(`http://localhost:4100/events?client=${kind}`, { headers, signal: abort.signal }),
    );
    const reader = response.body?.getReader();
    assert.ok(reader);
    const frame = new TextDecoder().decode((await reader.read()).value);
    assert.match(frame, /^event: snapshot/);
    return { abort, reader, snapshot: JSON.parse(frame.split("\n")[1].slice(6)) };
  };
  assert.equal(
    (await runtime.app.request("http://localhost:4100/events?client=other", { headers })).status,
    400,
  );
  const head = await runtime.app.request("http://localhost:4100/events?client=overlay", {
    method: "HEAD",
    headers,
  });
  assert.equal(head.status, 200);
  assert.equal((await snapshot()).overlayClients, 0);
  const dashboard = await connect("dashboard");
  assert.equal(dashboard.snapshot.overlayClients, 0);
  const first = await connect("overlay");
  const second = await connect("overlay");
  assert.equal(first.snapshot.overlayClients, 1);
  assert.equal(second.snapshot.overlayClients, 2);
  assert.equal((await snapshot()).overlayClients, 2);
  first.abort.abort();
  await second.reader.cancel();
  assert.equal((await snapshot()).overlayClients, 0);
  const next = await connect("overlay");
  assert.equal(next.snapshot.overlayClients, 1);
  assert.ok(next.snapshot.seq > first.snapshot.seq);
  assert.equal(next.snapshot.eventsub.streamStatus, "unknown");
  const actionHeaders = {
    ...headers,
    Origin: "http://localhost:4100",
    "X-CTA": "1",
    "Content-Type": "application/json",
  };
  const config = { ...next.snapshot.simulator.config, scenario: "opening-day" };
  assert.equal(
    (
      await runtime.app.request("http://localhost:4100/api/sim/start", {
        method: "POST",
        headers: actionHeaders,
        body: JSON.stringify(config),
      })
    ).status,
    200,
  );
  assert.equal(
    (await snapshot()).eventsub.streamStatus,
    "unknown",
    "simulated bells cannot mark Twitch online",
  );
  next.abort.abort();
  dashboard.abort.abort();
  assert.equal((await snapshot()).overlayClients, 0);
  runtime.close();
  const restarted = createExchangeRuntime();
  t.after(() => restarted.close());
  const packet = await (
    await restarted.app.request("http://localhost:4100/api/snapshot", { headers })
  ).json();
  assert.equal(packet.seq, 0);
  assert.equal(packet.overlayClients, 0);
});

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
  const { catalog, simulator, ...snapshot } = await response.json();
  assert.equal(simulator.running, false);
  assert.equal(simulator.eventCount, 0);
  assert.equal(simulator.scenarios.length, 7);
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
    overlayClients: 0,
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
      streamStatus: "unknown",
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

test("guarded simulator controls drive demo counters, previews and SIM state without raw chat", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let now = 1000;
  const runtime = createExchangeRuntime({ now: () => now });
  t.after(() => runtime.close());
  const headers = {
    Host: "localhost:4100",
    Origin: "http://localhost:4100",
    "X-CTA": "1",
    "Content-Type": "application/json",
  };
  const action = (path: string, body?: unknown) =>
    runtime.app.request(`http://localhost:4100/api/sim/${path}`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const snapshot = async () =>
    (
      await runtime.app.request("http://localhost:4100/api/snapshot", {
        headers: { Host: "localhost:4100" },
      })
    ).json();
  for (const path of ["start", "stop", "event"])
    assert.equal(
      (
        await runtime.app.request(`http://localhost:4100/api/sim/${path}`, {
          method: "POST",
          headers: { Host: "localhost:4100" },
        })
      ).status,
      403,
    );
  assert.equal((await action("start", { seed: 42, rate: 0, scenario: "opening-day" })).status, 400);
  const config = {
    seed: 42,
    rate: 4,
    chatters: 12,
    scenario: "opening-day",
    mix: { plain: 70, emote: 25, follow: 4, raid: 1 },
  };
  assert.equal((await action("start", config)).status, 200);
  assert.equal((await action("start", config)).status, 409);
  now = 3000;
  t.mock.timers.tick(2000);
  assert.equal((await action("event", { type: "raid", viewers: -1 })).status, 400);
  for (const type of ["follow", "raid", "online", "offline"])
    assert.equal((await action("event", { type, viewers: 40 })).status, 200);
  const running = await snapshot();
  assert.equal(running.mode, "demo");
  assert.equal(running.simulatorRunning, true);
  assert.equal(running.simulator.chatMessageCount, 8);
  assert.ok(running.simulator.eventCount >= 14);
  assert.equal(running.eventsub.eventCount, 0);
  assert.ok(
    running.chatOut.logs.every(
      (entry: { kind: string; origin: string }) =>
        entry.kind === "would-have-said" && entry.origin === "sim",
    ),
  );
  assert.equal(JSON.stringify(running).includes('"chatter"'), false);
  assert.equal((await action("stop")).status, 200);
  const stopped = await snapshot();
  assert.equal(stopped.simulatorRunning, false);
  now = 10_000;
  t.mock.timers.tick(7000);
  assert.equal((await snapshot()).simulator.eventCount, stopped.simulator.eventCount);
  assert.equal((await action("event", { type: "follow" })).status, 409);
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
