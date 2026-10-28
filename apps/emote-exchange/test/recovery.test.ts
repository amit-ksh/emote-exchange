import assert from "node:assert/strict";
import test from "node:test";
import type { MarketState } from "../src/engine/market.ts";
import { initialMarketState, stepMarket } from "../src/engine/market.ts";
import { checkpointMarket, restoreMarket } from "../src/engine/recovery.ts";
import { chat, emote, market } from "./market-fixture.ts";

function rows(state: MarketState) {
  return {
    checkpoint: checkpointMarket(state),
    traders: [...state.traders.values()],
    listings: [...state.listings.values()],
    holdings: [...state.holdings.values()].flatMap((holdings) => [...holdings.values()]),
    candles: [...state.listings.values()].flatMap((listing) =>
      listing.candles.map((candle) => ({ ticker: listing.emote.name, ...candle })),
    ),
    sessions: state.session ? [state.session] : [],
    firstMessages: [...state.firstMessages].map(([userId, at]) => ({ userId, at })),
  };
}
test("same-timestamp restore preserves business and bounded rule state without replaying Feed", () => {
  let state = market();
  state = stepMarket(state, { type: "StreamOnline", id: "open", at: 0, origin: "sim" }, 0).state;
  state = stepMarket(state, chat("sim_ann", 0, "buy", ["X", "5"]), 0).state;
  state = stepMarket(state, chat("sim_ann", 1000, null, [], ["Y"]), 1000).state;
  const stored = rows(state);
  const restored = restoreMarket(stored, 1000, [...state.catalog.values()]);
  assert.deepEqual(restored, { ...state, feed: [] });
  assert.equal(restored.traders.get("sim_ann")?.coins, 495);
  assert.equal(restored.holdings.get("sim_ann")?.get("X")?.shares, 5);
  assert.equal(JSON.stringify(stored.checkpoint).includes("private incoming chat"), false);
  assert.equal(JSON.stringify(stored.checkpoint).includes("costBasis"), false);
  const trader = restored.traders.get("sim_ann");
  assert.ok(trader);
  trader.coins = 0;
  assert.equal(state.traders.get("sim_ann")?.coins, 495);
});

test("short and long downtime expire windows without invented Stipends candles or repeated Moon effects", () => {
  let state = initialMarketState({
    now: 60_000,
    catalog: [emote("Y")],
    seedListings: [
      {
        emote: emote("X"),
        ipoAt: 0,
        lastUseAt: 0,
        base: 100,
        impact: 0.8,
        heat: 8,
        sessionOpenPrice: 10,
        moonFired: true,
        haltedUntil: 90_000,
        lastHaltAt: 60_000,
      },
    ],
  });
  state = stepMarket(state, chat("sim_ann", 60_000, null, [], ["Y"]), 60_000).state;
  state.cooldowns.set("sim_ann", 93_000);
  const stored = rows(state);
  const short = restoreMarket(stored, 75_000, [...state.catalog.values()]);
  assert.equal(short.at, 75_000);
  assert.ok(Math.abs((short.listings.get("X")?.heat ?? 0) - 7.127189745122714) < 1e-10);
  assert.ok(Math.abs((short.listings.get("X")?.impact ?? 0) - 0.5656854249492381) < 1e-10);
  assert.equal(short.listings.get("X")?.price, 180, "cached Price waits for a normal tick");
  assert.equal(short.listings.get("X")?.haltedUntil, 90_000);
  assert.equal(short.cooldowns.get("sim_ann"), 93_000);
  assert.deepEqual(short.listings.get("X")?.candles, state.listings.get("X")?.candles);
  const next = stepMarket(short, { type: "Tick" }, 75_000);
  assert.equal(next.state.listings.get("X")?.price, 156.57);
  assert.equal(
    next.effects
      .flatMap((effect) => (effect.type === "broadcast" ? effect.moments : []))
      .some((moment) => moment.kind === "MOON"),
    false,
  );
  const minuteGap = restoreMarket(stored, 120_000);
  assert.equal(minuteGap.participation.size, 0);
  assert.equal(minuteGap.cooldowns.size, 0);
  assert.equal(
    stepMarket(minuteGap, { type: "Tick" }, 120_000).state.traders.get("sim_ann")?.coins,
    1000,
  );
  const long = restoreMarket(stored, 660_000);
  assert.equal(long.listings.get("X")?.heat, 0);
  assert.equal(long.listings.get("X")?.impact, 0);
  assert.equal(long.listings.get("X")?.price, 180);
  assert.equal(long.listings.get("X")?.haltedUntil, 0);
  assert.equal(long.listings.get("X")?.lastHaltAt, 60_000);
  assert.equal(long.listings.get("X")?.moonFired, true);
  assert.equal(long.pending.size, 0);
  assert.equal(long.repeats.size, 0);
  assert.equal(long.feed.length, 0);
  assert.equal(long.traders.get("sim_ann")?.coins, 1000);
  assert.throws(() => restoreMarket(stored, 59_999), /backwards/);
  assert.throws(
    () =>
      restoreMarket(
        { ...stored, checkpoint: stored.checkpoint.replace('"version":1', '"version":99') },
        60_000,
      ),
    /unsupported/,
  );
});

test("malformed persisted rules cannot silently become a fresh or numerically invalid market", () => {
  const stored = rows(market());
  const saved = JSON.parse(stored.checkpoint);
  for (const patch of [
    { paused: "yes" },
    { startedAt: -1 },
    { cooldowns: [["sim_ann", null]] },
    { listings: [{ ...saved.listings[0], heat: null }] },
    { listings: [{ ...saved.listings[0], impact: 2 }] },
    { listings: [{ ...saved.listings[0], moonFired: "yes" }] },
    { listings: [{ ...saved.listings[0], priceHistory: [{ at: 0, price: 0 }] }] },
  ])
    assert.throws(
      () => restoreMarket({ ...stored, checkpoint: JSON.stringify({ ...saved, ...patch }) }, 0),
      /Invalid/,
    );
  assert.throws(() => restoreMarket({ ...stored, checkpoint: null }, 0), /checkpoint/);
});
