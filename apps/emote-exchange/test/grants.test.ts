import assert from "node:assert/strict";
import test from "node:test";
import { openStore } from "@emote-exchange/twitch-kit";
import { createExchangeRuntime } from "../src/app.ts";
import { stepMarket } from "../src/engine/market.ts";
import { createMarketRepository, marketMigrations } from "../src/market-store.ts";
import { chat, market } from "./market-fixture.ts";

test("only a broadcaster grants an existing Trader, recording applied Coins and one Feed/reply", () => {
  const arrived = chat("ann", 0);
  arrived.origin = "twitch";
  let state = stepMarket(market(), arrived, 0).state;
  const command = chat("streamer", 0, "grant", ["@ann", "500"]);
  command.origin = "twitch";
  command.chatter.isBroadcaster = true;
  const result = stepMarket(state, command, 0);
  assert.equal(result.state.traders.get("ann")?.coins, 1500);
  const writes = result.effects.flatMap((effect) =>
    effect.type === "persist" ? effect.grants : [],
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].amount, 500);
  assert.equal(writes[0].source, "chat");
  assert.equal(result.effects.filter((effect) => effect.type === "say").length, 1);
  assert.ok(result.effects.some((effect) => effect.type === "say" && effect.origin === "twitch"));
  assert.equal(
    result.effects
      .flatMap((effect) => (effect.type === "broadcast" ? effect.moments : []))
      .filter((row) => row.kind === "GRANT").length,
    1,
  );
  state = result.state;
  assert.equal(
    stepMarket(state, { ...command, id: "different-delivery-same-message" }, 1).state.traders.get(
      "ann",
    )?.coins,
    1500,
  );
});

test("Grant maximum has a validated range and reset-to-default", async (t) => {
  const runtime = createExchangeRuntime({ now: () => 0, marketAutoTick: false });
  t.after(() => runtime.close());
  const headers = {
    Host: "localhost:4100",
    Origin: "http://localhost:4100",
    "X-CTA": "1",
    "Content-Type": "application/json",
  };
  const settings = (body: unknown) =>
    runtime.app.request("http://localhost:4100/api/market/settings", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  for (const value of [0, 1.5, 1_000_001])
    assert.equal((await settings({ GRANT_MAX: value })).status, 400);
  assert.equal((await (await settings({ GRANT_MAX: 100 })).json()).GRANT_MAX, 100);
  assert.equal((await (await settings({ reset: true })).json()).GRANT_MAX, 10_000);
});

test("Mods viewers invalid amounts and unknown targets cannot grant or create Traders", () => {
  const state = stepMarket(market(), chat("ann", 0), 0).state;
  for (const [role, amount, target] of [
    ["viewer", "500", "ann"],
    ["mod", "500", "ann"],
    ...["0", "-1", "1.5", "text", "10001", "9007199254740993"].map((amount) => [
      "broadcaster",
      amount,
      "ann",
    ]),
    ["broadcaster", "500", "unknown"],
  ]) {
    const command = chat("caller", 0, "grant", [target, amount]);
    command.chatter.isBroadcaster = role === "broadcaster";
    command.chatter.isMod = role === "mod";
    const result = stepMarket(state, command, 0);
    assert.deepEqual(result.state.traders, state.traders);
    assert.equal(
      result.effects.flatMap((effect) => (effect.type === "persist" ? effect.grants : [])).length,
      0,
    );
  }
});

test("mention IDs beat renamed logins and grants to simulated targets only produce local replies", () => {
  let state = stepMarket(market(), chat("sim_ann", 0), 0).state;
  const command = chat("streamer", 0, "grant", ["@oldname", "500"]);
  command.chatter.isBroadcaster = true;
  command.origin = "twitch";
  command.parts = [
    {
      type: "mention",
      text: "@oldname",
      user: { id: "sim_ann", login: "oldname", displayName: "Old Name" },
    },
  ];
  const result = stepMarket(state, command, 0);
  state = result.state;
  assert.equal(state.traders.get("sim_ann")?.coins, 1500);
  assert.ok(
    result.effects.filter((effect) => effect.type === "say").every((say) => say.origin === "sim"),
  );
});

test("saturated grants persist applied amounts including zero and repeated requests survive restart", () => {
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  try {
    const repo = createMarketRepository(store);
    let state = repo.load(0);
    const created = stepMarket(state, chat("sim_ann", 0), 0);
    state = created.state;
    repo.commit(state, created.effects);
    const trader = state.traders.get("sim_ann");
    assert.ok(trader);
    state.traders.set(trader.id, { ...trader, coins: 999_999_990 });
    for (const requestId of ["gift1", "gift2"]) {
      const result = stepMarket(
        state,
        {
          type: "Grant",
          id: requestId,
          requestId,
          origin: "sim",
          userId: "sim_ann",
          amount: 500,
          source: "dashboard",
        },
        0,
      );
      state = result.state;
      repo.commit(state, result.effects);
    }
    assert.deepEqual(
      store
        .read<{ amount: number }>("SELECT amount FROM grants ORDER BY rowid")
        .map((row) => row.amount),
      [10, 0],
    );
    state = repo.load(0);
    const duplicate = stepMarket(
      state,
      {
        type: "Grant",
        id: "again",
        requestId: "gift1",
        origin: "sim",
        userId: "sim_ann",
        amount: 500,
        source: "dashboard",
      },
      1,
    );
    repo.commit(duplicate.state, duplicate.effects);
    assert.equal(store.read("SELECT id FROM grants").length, 2);
    assert.equal(duplicate.state.traders.get("sim_ann")?.coins, 1_000_000_000);
  } finally {
    store.close();
  }
});

test("dashboard grants require Origin and X-CTA, validate amounts and credit once per request", async (t) => {
  const runtime = createExchangeRuntime({ now: () => 0, marketAutoTick: false });
  t.after(() => runtime.close());
  runtime.receiveEvent(chat("sim_ann", 0));
  const headers = {
    Host: "localhost:4100",
    Origin: "http://localhost:4100",
    "X-CTA": "1",
    "Content-Type": "application/json",
  };
  const post = (body: unknown, extra = headers) =>
    runtime.app.request("http://localhost:4100/api/market/grant", {
      method: "POST",
      headers: extra,
      body: JSON.stringify(body),
    });
  const body = { userId: "sim_ann", amount: 500, requestId: "dashboard-gift" };
  for (const field of ["Origin", "X-CTA"])
    assert.equal((await post(body, { ...headers, [field]: "" })).status, 403);
  assert.equal((await post({ ...body, amount: 1.5 })).status, 400);
  assert.equal((await post({ ...body, userId: "unknown" })).status, 400);
  assert.equal((await post(body)).status, 200);
  const again = await post(body);
  assert.equal(again.status, 200);
  assert.equal(again.headers.has("Access-Control-Allow-Origin"), false);
  const packet = await (
    await runtime.app.request("http://localhost:4100/api/snapshot", { headers })
  ).json();
  assert.equal(packet.market.traders[0].coins, 1500);
  assert.ok(packet.chatOut.logs.every((row: { origin: string }) => row.origin === "sim"));
});
