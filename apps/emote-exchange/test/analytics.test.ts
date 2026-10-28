import assert from "node:assert/strict";
import test from "node:test";
import {
  analyticsProjection,
  analyticsSummary,
  initialAnalytics,
  recentBaseline,
  reduceAnalytics,
} from "../src/engine/analytics.ts";
import type { MarketInput } from "../src/engine/market.ts";

test("analytics counts saturated reward credits by their applied amount", () => {
  const f = fixture();
  f.apply(chat("sim_ann", 0), 0);
  const trader = f.engine().traders.get("sim_ann");
  assert.ok(trader);
  f.engine().traders.set(trader.id, { ...trader, coins: 999_999_995 });
  const value = f.apply(
    {
      type: "Grant",
      id: "cap",
      origin: "sim",
      userId: trader.id,
      amount: 500,
      requestId: "cap",
      source: "dashboard",
    },
    0,
  );
  assert.equal(value.sim.issued.grant, 5);
  assert.equal(value.sim.coinsHeld, 1_000_000_000);
});

import { stepMarket } from "../src/engine/market.ts";
import { chat, market } from "./market-fixture.ts";

function fixture() {
  let engine = market();
  let state = initialAnalytics(0);
  const apply = (event: MarketInput, now: number) => {
    const next = stepMarket(engine, event, now);
    state = reduceAnalytics(
      state,
      { event, before: engine, after: next.state, effects: next.effects },
      now,
    );
    engine = next.state;
    return analyticsProjection(state, engine, now);
  };
  apply({ type: "StreamOnline", id: "open", origin: "sim", at: 0 }, 0);
  return { apply, state: () => state, engine: () => engine };
}

test("analytics counts eligible messages and distinct chatters with exact five-minute expiry", () => {
  let engine = stepMarket(
    market(),
    { type: "StreamOnline", id: "open", origin: "sim", at: 0 },
    0,
  ).state;
  let state = initialAnalytics(0, engine.streamNo);
  for (const event of [chat("sim_ann", 0), chat("sim_ann", 0, "pf"), chat("sim_bob", 0)]) {
    const next = stepMarket(engine, event, 0);
    state = reduceAnalytics(
      state,
      { event, before: engine, after: next.state, effects: next.effects },
      0,
    );
    engine = next.state;
  }
  let value = analyticsProjection(state, engine, 0);
  assert.equal(value.sim.messagesPerMinute, 3);
  assert.equal(value.sim.activeChatters, 2);
  for (const [now, expected] of [
    [299_999, 2],
    [300_000, 0],
  ]) {
    const event = { type: "Tick" as const };
    const next = stepMarket(engine, event, now);
    state = reduceAnalytics(
      state,
      { event, before: engine, after: next.state, effects: next.effects },
      now,
    );
    engine = next.state;
    value = analyticsProjection(state, engine, now);
    assert.equal(value.sim.activeChatters, expected);
  }
});

test("participation uses distinct chatters and first-Trade conversion expires exactly at ten minutes", () => {
  for (const [at, converted] of [
    [599_999, 1],
    [600_000, 0],
  ]) {
    const f = fixture();
    f.apply(chat("sim_ann", 0), 0);
    f.apply(chat("sim_bob", 0), 0);
    const value = f.apply(chat("sim_ann", at, "buy", ["X", "1"]), at);
    assert.equal(value.sim.participation, 50);
    assert.equal(value.sim.newChatters, 2);
    assert.equal(value.sim.convertedNewChatters, converted);
    assert.equal(value.sim.tradesPerMinute, 1);
    assert.equal(value.sim.coinsPerMinute, 101);
  }
});

test("analytics issued sources use applied engine ledger amounts and Fees stay separate", () => {
  const f = fixture();
  f.apply(
    {
      type: "Follow",
      id: "follow",
      origin: "sim",
      at: 0,
      user: { id: "sim_ann", login: "sim_ann", displayName: "Ann" },
    },
    0,
  );
  f.apply(
    {
      type: "Raid",
      id: "raid",
      origin: "sim",
      at: 0,
      from: { id: "sim_raider", login: "sim_raider", displayName: "Raider" },
      viewers: 40,
    },
    0,
  );
  f.apply(chat("sim_bob", 0), 0);
  f.apply(chat("sim_ann", 0, "greetings", ["never-publish-these-words"]), 0);
  f.apply(
    {
      type: "Grant",
      id: "grant",
      origin: "sim",
      userId: "sim_ann",
      amount: 500,
      requestId: "gift",
      source: "dashboard",
    },
    0,
  );
  f.apply(chat("sim_ann", 1000, "buy", ["X", "1"]), 1000);
  const value = f.apply({ type: "Tick" }, 60_000);
  assert.deepEqual(value.sim.issued, {
    starting: 2000,
    stipend: 10,
    follow: 200,
    visa: 1000,
    greeting: 50,
    grant: 500,
  });
  assert.equal(value.sim.fees, 1);
  assert.equal(value.sim.greetings.claims, 1);
  assert.equal(value.sim.follows, 1);
  assert.equal(value.sim.raids, 1);
  assert.equal(JSON.stringify(value).includes("never-publish-these-words"), false);
});

test("analytics origins stay separate, broadcaster/self/foreign messages are excluded and buckets/Moments/sets stay bounded", () => {
  const f = fixture();
  const live = chat("ann", 0);
  live.origin = "twitch";
  f.apply(live, 0);
  f.apply(chat("sim_bob", 0), 0);
  for (const kind of ["foreign", "selfSent", "broadcaster"]) {
    const event = chat("excluded", 0);
    if (kind === "broadcaster") event.chatter.isBroadcaster = true;
    else event[kind as "foreign" | "selfSent"] = true;
    f.apply(event, 0);
  }
  let value = f.apply({ type: "Tick" }, 60_000);
  assert.equal(value.twitch.messagesPerMinute, 0);
  assert.equal(value.sim.messagesPerMinute, 0);
  assert.equal(value.twitch.activeChatters, 1);
  assert.equal(value.sim.activeChatters, 1);
  assert.equal(value.all.activeChatters, 2);
  assert.equal(value.sim.sparkline.at(-2)?.messages, 1);
  assert.equal(value.sim.sparkline.at(-1)?.messages, 0);
  for (let index = 1; index <= 30; index++)
    value = f.apply(
      {
        type: "Raid",
        id: `raid:${index}`,
        origin: "sim",
        at: 60_000,
        from: { id: "sim_raid", login: "sim_raid", displayName: "Raid" },
        viewers: 40,
      },
      60_000,
    );
  assert.equal(value.moments.length, 20);
  value = f.apply({ type: "Tick" }, 3_660_000);
  assert.equal(value.sim.sparkline.length, 60);
  assert.ok(f.state().sim.buckets.length <= 60);
  value = f.apply({ type: "StreamOnline", id: "next", origin: "sim", at: 3_660_001 }, 3_660_001);
  assert.equal(value.sim.distinctChatters, 0);
  assert.equal(value.sim.newChatters, 0);
  assert.equal(value.sim.participation, 0);
  assert.equal(f.state().sim.chatters.size, 0);
  assert.equal(value.moments.length, 20);
  assert.equal(JSON.stringify(value).includes("private incoming chat"), false);
});

test("closing summaries compare against the median of five completed live Streams only after two exist", () => {
  const f = fixture();
  f.apply(chat("sim_ann", 0), 0);
  f.apply(chat("sim_ann", 0, "buy", ["X", "1"]), 0);
  const summary = analyticsSummary(f.state(), 60_000, false);
  assert.equal(summary.sim.averageMessagesPerMinute, 2);
  assert.equal(summary.sim.participation, 100);
  assert.equal(summary.sim.newChatterConversion, 100);
  assert.equal(recentBaseline([summary]), null);
  const first = {
    ...summary,
    live: true,
    twitch: { ...summary.sim, averageMessagesPerMinute: 10 },
  };
  const second = {
    ...first,
    streamNo: first.streamNo + 1,
    twitch: { ...first.twitch, averageMessagesPerMinute: 30 },
  };
  assert.equal(recentBaseline([first, second])?.messagesPerMinute, 20);
  const recent = Array.from({ length: 7 }, (_, index) => ({
    ...first,
    streamNo: index + 1,
    closedAt: 60_000 + index,
    twitch: { ...first.twitch, averageMessagesPerMinute: (index + 1) * 10 },
  }));
  assert.equal(recentBaseline([...recent, summary])?.messagesPerMinute, 50);
  assert.equal(recentBaseline(recent)?.streams, 5);
});
