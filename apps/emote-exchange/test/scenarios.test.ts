import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { createSimulator, loadDemoCatalog } from "@emote-exchange/twitch-kit";
import type { MarketMoment } from "../src/engine/market.ts";
import { initialMarketState, stepMarket } from "../src/engine/market.ts";
import { exchangeScenarios } from "../src/simulation.ts";

const emotes = loadDemoCatalog(new URL("../client/public/demo-emotes/", import.meta.url));
function run(id: string, seconds: number) {
  let now = 0;
  let state = initialMarketState({ now, catalog: emotes });
  const moments: MarketMoment[] = [];
  const timings: number[] = [];
  let peakHeap = 0;
  let peak = 0;
  let trades = 0;
  let visas = 0;
  let warmTraders = 0;
  const apply = (event: Parameters<typeof stepMarket>[1]) => {
    const result = stepMarket(state, event, now);
    state = result.state;
    for (const effect of result.effects) {
      if (effect.type === "broadcast") {
        moments.push(...effect.moments);
        if (moments.length > 500) moments.splice(0, moments.length - 500);
      }
      if (effect.type === "persist") {
        trades += effect.trades.length;
        visas += effect.credits.filter((row) => row.kind === "visa").length;
      }
    }
  };
  const profile = exchangeScenarios.find((row) => row.id === id);
  assert.ok(profile);
  const simulator = createSimulator({
    emotes,
    scenarios: exchangeScenarios,
    autoTick: false,
    now: () => now,
    onEvent: apply,
  });
  try {
    simulator.start({ seed: 42, scenario: id, ...profile.defaults });
    for (let second = 1; second <= seconds; second++) {
      now = second * 1000;
      simulator.tick();
      const start = performance.now();
      apply({ type: "Tick" });
      if (second > 600) timings.push(performance.now() - start);
      peak = Math.max(peak, state.listings.get(emotes[0].name)?.price ?? 0);
      if (second === 600) warmTraders = state.traders.size;
      if (second % 60 === 0) peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
    }
    return { state, moments, peak, trades, visas, timings, peakHeap, warmTraders };
  } finally {
    simulator.close();
  }
}
test("Pump and dump lists, fills early buys, reaches a Moon or Halt and drops at least forty percent", () => {
  const result = run("pump-and-dump", 360);
  assert.ok(result.trades > 0, "early buyers must actually fill");
  assert.ok(result.moments.some((row) => row.kind === "MOON" || row.kind === "HALT"));
  assert.ok((result.state.listings.get(emotes[0].name)?.price ?? Infinity) <= result.peak * 0.6);
});

test("Opening day creates six Listings and accepted Trades", () => {
  const result = run("opening-day", 120);
  assert.equal(result.state.listings.size, 6);
  assert.ok(result.trades > 0);
});

test("Raid wave applies exactly twenty first-message visas after a forty-viewer Raid", () => {
  const result = run("raid-wave", 30);
  assert.equal(result.visas, 20);
  assert.ok(result.moments.some((row) => row.kind === "RAID" && row.viewers === 40));
});

test("Quiet market closes after five minutes and Solo spammer cannot outgain the group", () => {
  const quiet = run("quiet-market", 300);
  assert.equal(quiet.state.session?.closedAt, 300_000);
  const solo = run("solo-spammer", 30);
  assert.equal(solo.state.listings.size, 4);
  assert.ok(solo.peak <= 125);
  assert.ok((solo.state.listings.get("DemoBolt")?.price ?? 0) > solo.peak);
});

test("Soak retains fixed cohorts and bounded histories after ten-minute warm-up plus thirty minutes", (t) => {
  const result = run("soak", 2400);
  const state = result.state;
  assert.equal(result.warmTraders, 500);
  assert.equal(state.traders.size, 500);
  assert.equal(state.listings.size, 24);
  assert.ok(state.feed.length <= 5);
  assert.ok(state.seenEvents.size <= 2000);
  assert.ok(state.pending.size <= emotes.length);
  assert.ok(state.participation.size <= 500);
  for (const trader of state.traders.values())
    assert.ok(
      Number.isSafeInteger(trader.coins) && trader.coins >= 0 && trader.coins <= 1_000_000_000,
    );
  for (const listing of state.listings.values()) {
    assert.ok(listing.candles.length <= 11);
    assert.ok(listing.priceHistory.length <= 601);
  }
  for (const users of state.repeats.values())
    for (const times of users.values()) assert.ok(times.every((at) => state.at - at < 30_000));
  result.timings.sort((a, b) => a - b);
  t.diagnostic(
    `tick p95 ${result.timings[Math.floor(result.timings.length * 0.95)]?.toFixed(3)} ms; sampled peak heap ${(result.peakHeap / 1024 / 1024).toFixed(1)} MiB`,
  );
});
