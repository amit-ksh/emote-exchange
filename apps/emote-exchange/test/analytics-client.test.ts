import assert from "node:assert/strict";
import test from "node:test";
import { readAnalytics } from "../client/src/analytics-model.ts";
import { createAnalyticsFeed } from "../src/analytics-feed.ts";
import { analyticsProjection, initialAnalytics } from "../src/engine/analytics.ts";
import { market } from "./market-fixture.ts";

const payload = () => ({ ...analyticsProjection(initialAnalytics(0), market(), 0), seq: 1 });
test("analytics reader rejects malformed versions, counters, sources and charts and strips unapproved fields", () => {
  const value = payload();
  assert.ok(readAnalytics(value));
  assert.equal(readAnalytics({ ...value, v: 2 }), null);
  assert.equal(readAnalytics({ ...value, sim: { ...value.sim, messagesPerMinute: -1 } }), null);
  assert.equal(
    readAnalytics({
      ...value,
      sim: { ...value.sim, sparkline: [...value.sim.sparkline, value.sim.sparkline[0]] },
    }),
    null,
  );
  const { grant: _, ...issued } = value.sim.issued;
  assert.equal(readAnalytics({ ...value, sim: { ...value.sim, issued } }), null);
  const clean = readAnalytics({ ...value, token: "private-token", chat: "private-chat" });
  assert.ok(clean);
  assert.equal(JSON.stringify(clean).includes("private-"), false);
});

test("analytics feed produces no projection without clients and stops on cancellation", async () => {
  let calls = 0;
  let now = 0;
  const feed = createAnalyticsFeed({
    now: () => now,
    autoTick: false,
    snapshot: () => {
      calls++;
      return payload();
    },
  });
  try {
    feed.tick();
    assert.equal(calls, 0);
    const abort = new AbortController();
    const reader = feed.connect(abort.signal).getReader();
    await reader.read();
    assert.equal(calls, 1);
    now = 999;
    feed.tick();
    assert.equal(calls, 1);
    now = 1000;
    feed.tick();
    await reader.read();
    assert.equal(calls, 2);
    await reader.cancel();
    now = 2000;
    feed.tick();
    assert.equal(calls, 2);
  } finally {
    feed.close();
  }
});
