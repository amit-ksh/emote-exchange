import assert from "node:assert/strict";
import test from "node:test";
import { createChatOut, openStore } from "@emote-exchange/twitch-kit";
import { createMarketRuntime } from "../src/market-runtime.ts";
import { createMarketRepository, marketMigrations } from "../src/market-store.ts";
import { chat, emote } from "./market-fixture.ts";

test("runtime persists before publishing or queuing and per-Trader reply budgets survive restart without reversing Trades", () => {
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  let now = 0;
  const replies: string[] = [];
  const repo = createMarketRepository(store);
  const options = {
    store,
    now: () => now,
    catalog: [emote("X")],
    autoTick: false,
    say: (say: { text: string }) => {
      assert.ok(repo.load(now).traders.size > 0);
      replies.push(say.text);
    },
    publish: () => {
      assert.equal(repo.load(now).at, now);
    },
  };
  let runtime = createMarketRuntime(options);
  try {
    runtime.receive(chat("sim_ann", 0, null, [], ["X"]));
    runtime.receive(chat("sim_bob", 0, null, [], ["X"]));
    runtime.receive(chat("sim_ann", 0, "buy", ["X", "5"]));
    assert.equal(replies.length, 1);
    now = 3000;
    runtime.receive(chat("sim_ann", now, "buy", ["X", "1"]));
    assert.equal(replies.length, 1, "a suppressed reply cannot cancel a successful second fill");
    assert.equal(repo.load(now).holdings.get("sim_ann")?.get("X")?.shares, 6);
    runtime.close();
    runtime = createMarketRuntime(options);
    runtime.receive(chat("sim_ann", now, "pf"));
    assert.equal(replies.length, 1);
    now = 20_000;
    runtime.receive(chat("sim_ann", now, "pf"));
    assert.equal(replies.length, 2);
    assert.ok(
      runtime
        .display()
        .traders.some((trader) => trader.userId === "sim_ann" && trader.holdings[0]?.shares === 6),
    );
    assert.equal(JSON.stringify(runtime.display()).includes("private incoming chat"), false);
  } finally {
    runtime.close();
    store.close();
  }
});

test("a storage failure delivers no reply or success moment and leaves the last committed Portfolio intact", (t) => {
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  const says: string[] = [];
  const moments: string[] = [];
  const runtime = createMarketRuntime({
    store,
    now: () => 0,
    catalog: [emote("X")],
    autoTick: false,
    say: (say) => says.push(say.text),
    publish: (items) => moments.push(...items.map((item) => item.kind)),
  });
  try {
    runtime.receive(chat("sim_ann", 0, null, [], ["X"]));
    runtime.receive(chat("sim_bob", 0, null, [], ["X"]));
    const before = runtime.display();
    moments.length = 0;
    t.mock.method(store, "writeBatch", () => {
      throw new Error("private storage detail");
    });
    assert.throws(() => runtime.receive(chat("sim_ann", 0, "buy", ["X", "5"])), /storage failed/);
    assert.equal(says.length, 0);
    assert.equal(moments.length, 0);
    assert.deepEqual(runtime.display(), { ...before, status: "storage-error" });
    assert.throws(() => runtime.receive(chat("sim_ann", 0, "portfolio")), /unavailable/);
    assert.equal(JSON.stringify(runtime.display()).includes("private storage detail"), false);
  } finally {
    runtime.close();
    store.close();
  }
});

test("100 live portfolio commands respect the real queue limits and simulated replies or bells never send live", async () => {
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  let now = 0;
  const sends: { at: number; text: string }[] = [];
  const queue = createChatOut({
    now: () => now,
    autoTick: false,
    auth: { identity: () => "connected", accessToken: () => "private-test-token" },
    helix: {
      close() {},
      async request(options) {
        if (options.beforeAttempt && !(await options.beforeAttempt(new AbortController().signal)))
          throw new Error("Denied");
        sends.push({ at: now, text: String((options.body as { message?: string })?.message) });
        return Response.json({ data: [{ is_sent: true, message_id: `out-${sends.length}` }] });
      },
    },
  });
  const runtime = createMarketRuntime({
    store,
    now: () => now,
    catalog: [emote("X")],
    autoTick: false,
    say: queue.enqueue,
    publish: () => {},
  });
  try {
    for (let i = 0; i < 100; i++) {
      const input = chat(`viewer_${i}`, now, "portfolio");
      input.origin = "twitch";
      runtime.receive(input);
      now += 90;
      await queue.tick();
    }
    for (; now <= 60_000; now += 1000) await queue.tick();
    assert.ok(sends.length > 0);
    for (const send of sends)
      assert.ok(
        sends.filter((value) => value.at > send.at - 30_000 && value.at <= send.at).length <= 18,
      );
    for (let i = 1; i < sends.length; i++) assert.ok(sends[i].at - sends[i - 1].at >= 1000);
    const before = sends.length;
    runtime.receive(chat("sim_ann", now, "portfolio"));
    runtime.receive({ type: "StreamOnline", id: "sim-open", at: now, origin: "sim" });
    runtime.receive({
      type: "Raid",
      id: "sim-raid",
      at: now,
      origin: "sim",
      from: { id: "sim_raid", login: "sim_raid", displayName: "sim_raid" },
      viewers: 40,
    });
    runtime.receive({
      type: "Follow",
      id: "sim-follow",
      at: now,
      origin: "sim",
      user: { id: "sim_fan", login: "sim_fan", displayName: "sim_fan" },
    });
    runtime.receive({ type: "StreamOffline", id: "sim-close", at: now, origin: "sim" });
    await queue.tick();
    assert.equal(sends.length, before);
    assert.ok(queue.publicState().logs.some((log) => log.text.startsWith("Closing bell:")));
  } finally {
    runtime.close();
    queue.close();
    store.close();
  }
});
