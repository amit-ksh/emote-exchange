import assert from "node:assert/strict";
import test from "node:test";
import { openStore } from "@emote-exchange/twitch-kit";
import { createExchangeRuntime } from "../src/app.ts";
import { createMarketRuntime } from "../src/market-runtime.ts";
import { marketMigrations } from "../src/market-store.ts";
import { chat } from "./market-fixture.ts";

test("restarting preserves Stream uptime while summary averages cover only time since restart", () => {
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  let now = 0;
  const options = {
    store,
    now: () => now,
    catalog: [],
    autoTick: false,
    say: () => {},
    publish: () => {},
  };
  let runtime = createMarketRuntime(options);
  try {
    runtime.receive({ type: "StreamOnline", id: "open", origin: "twitch", at: 0 });
    runtime.close();
    now = 600_000;
    runtime = createMarketRuntime(options);
    assert.equal(runtime.analytics().stream.uptimeMs, 600_000);
    const event = chat("ann", now);
    event.origin = "twitch";
    runtime.receive(event);
    now = 660_000;
    runtime.receive({ type: "StreamOffline", id: "close", origin: "twitch", at: now });
    const row = store.read<{ summary: string }>("SELECT summary FROM sessions WHERE id=?", [
      "open:session",
    ])[0];
    assert.equal(JSON.parse(row.summary).analytics.twitch.averageMessagesPerMinute, 1);
    assert.equal(JSON.parse(row.summary).analytics.since, 600_000);
  } finally {
    runtime.close();
    store.close();
  }
});

test("runtime writes closing analytics in sessions.summary and restarts with empty counters", () => {
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  let now = 0;
  const options = {
    store,
    now: () => now,
    catalog: [],
    autoTick: false,
    say: () => {},
    publish: () => {},
  };
  let runtime = createMarketRuntime(options);
  try {
    for (let stream = 0; stream < 2; stream++) {
      now = stream * 7_260_000;
      runtime.receive({ type: "StreamOnline", id: `open:${stream}`, origin: "twitch", at: now });
      const event = chat(`ann${stream}`, now);
      event.origin = "twitch";
      runtime.receive(event);
      now += 60_000;
      runtime.tick();
      runtime.receive({ type: "StreamOffline", id: `close:${stream}`, origin: "twitch", at: now });
    }
    const rows = store.read<{ summary: string }>(
      "SELECT summary FROM sessions WHERE closed_at IS NOT NULL ORDER BY rowid",
    );
    assert.equal(rows.length, 2);
    assert.equal(JSON.parse(rows[0].summary).analytics.twitch.averageMessagesPerMinute, 1);
    assert.equal(runtime.analytics().comparison?.messagesPerMinute, 1);
    runtime.close();
    runtime = createMarketRuntime(options);
    assert.equal(runtime.analytics().twitch.messagesPerMinute, 0);
    assert.equal(runtime.analytics().twitch.distinctChatters, 0);
    assert.equal(runtime.analytics().since, now);
    assert.equal(runtime.analytics().comparison?.messagesPerMinute, 1);
  } finally {
    runtime.close();
    store.close();
  }
});

test("analytics SSE enforces Host and Origin, has no CORS, and publishes at most once per second", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let now = 0;
  const runtime = createExchangeRuntime({ now: () => now, marketAutoTick: false });
  t.after(() => runtime.close());
  const url = "http://localhost:4100/api/analytics/events";
  for (const headers of [
    { Host: "evil.test:4100" },
    { Host: "localhost:4100", Origin: "https://evil.test" },
  ] as Record<string, string>[])
    assert.equal((await runtime.app.request(url, { headers })).status, 403);
  const abort = new AbortController();
  const response = await runtime.app.request(
    new Request(url, {
      headers: { Host: "localhost:4100", Origin: "http://localhost:4100" },
      signal: abort.signal,
    }),
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const reader = response.body?.getReader();
  assert.ok(reader);
  const frame = (value: Uint8Array | undefined) =>
    JSON.parse(new TextDecoder().decode(value).split("\n")[1].slice(6));
  assert.equal(frame((await reader.read()).value).sim.messagesPerMinute, 0);
  runtime.receiveEvent({ type: "StreamOnline", id: "open", origin: "sim", at: 0 });
  runtime.receiveEvent(chat("sim_ann", 0));
  let delivered = false;
  const pending = reader.read().then((value) => {
    delivered = true;
    return value;
  });
  now = 999;
  t.mock.timers.tick(999);
  await Promise.resolve();
  assert.equal(delivered, false);
  now = 1000;
  t.mock.timers.tick(1);
  assert.equal(frame((await pending).value).sim.messagesPerMinute, 1);
  abort.abort();
  assert.equal((await reader.read()).done, true);
});
