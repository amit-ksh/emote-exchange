import assert from "node:assert/strict";
import test from "node:test";
import type { Store } from "@emote-exchange/twitch-kit";
import { openStore } from "@emote-exchange/twitch-kit";
import { createMarketRuntime } from "../src/market-runtime.ts";
import { marketMigrations } from "../src/market-store.ts";
import { chat, emote } from "./market-fixture.ts";

test("remote market serializes events and delivers nothing until durable commit; failure retains the last committed Portfolio", async () => {
  const local = openStore({ filename: ":memory:", migrations: marketMigrations });
  let release: (() => void) | undefined;
  let fail = false;
  let blocked = false;
  const store: Store = {
    ...local,
    asyncWrites: true,
    async writeBatch(writes) {
      if (blocked)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (fail) throw new Error("private database failure");
      local.writeBatch(writes);
    },
  };
  const published: unknown[] = [];
  const says: unknown[] = [];
  const runtime = createMarketRuntime({
    store,
    now: () => 1000,
    catalog: [emote("X")],
    autoTick: false,
    publish: (value) => published.push(value),
    say: (value) => says.push(value),
  });
  try {
    await runtime.ready;
    blocked = true;
    const pending = runtime.receive(chat("sim_ann", 1000));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(runtime.display().traders.length, 0);
    assert.equal(published.length, 0);
    assert.ok(release);
    blocked = false;
    release();
    await pending;
    assert.equal(runtime.display().traders.length, 1);
    const before = runtime.display().traders;
    published.length = 0;
    fail = true;
    await assert.rejects(Promise.resolve(runtime.receive(chat("sim_bob", 1000))), /storage failed/);
    assert.deepEqual(runtime.display().traders, before);
    assert.equal(says.length, 0);
    assert.equal(runtime.display().status, "storage-error");
    assert.equal(JSON.stringify(published).includes("private"), false);
  } finally {
    runtime.close();
    local.close();
  }
});
