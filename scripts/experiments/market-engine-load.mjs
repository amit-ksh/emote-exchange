// E1 input/engine probe only: no trading, storage, SSE, live chat or overlay rendering.
import assert from "node:assert/strict";
import { cpus } from "node:os";
import { initialMarketState, stepMarket } from "../../apps/emote-exchange/src/engine/market.ts";
import { exchangeScenarios } from "../../apps/emote-exchange/src/simulation.ts";
import { createSimulator, loadDemoCatalog } from "../../packages/twitch-kit/src/index.ts";

const catalog = loadDemoCatalog(
  new URL("../../apps/emote-exchange/client/public/demo-emotes/", import.meta.url),
);
let state = initialMarketState({ now: 0, catalog });
let now = 0;
let messages = 0;
const ticks = [];
let peakHeap = 0;
const start = performance.now();
const simulator = createSimulator({
  emotes: catalog,
  scenarios: exchangeScenarios,
  now: () => now,
  autoTick: false,
  onEvent(event) {
    state = stepMarket(state, event, event.at).state;
    if (event.type === "ChatMessage") messages++;
  },
});
simulator.start({
  seed: 42,
  rate: 50,
  chatters: 500,
  scenario: "soak",
  mix: { plain: 10, emote: 90, follow: 0, raid: 0 },
});
for (let second = 1; second <= 2400; second++) {
  now = second * 1000;
  simulator.tick();
  const before = performance.now();
  state = stepMarket(state, { type: "Tick" }, now).state;
  const elapsed = performance.now() - before;
  if (second > 600) ticks.push(elapsed);
  peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed);
  if (second >= 600) {
    assert.equal(state.listings.size, 24);
    assert.equal(state.traders.size, 500);
  }
  for (const listing of state.listings.values()) {
    assert.ok(listing.candles.length <= 11);
    assert.ok(listing.priceHistory.length <= 602);
    assert.ok(Number.isFinite(listing.price) && listing.price >= 1);
  }
  for (const traders of state.repeats.values())
    for (const uses of traders.values()) assert.ok(uses.every((at) => now - at < 30_000));
  for (const pending of state.pending.values())
    assert.ok(pending.uses.every((use) => now - use.at < 600_000));
}
simulator.close();
assert.equal(messages, 120_000);
assert.ok(
  [...state.traders.values()].every(
    (trader) =>
      Number.isSafeInteger(trader.coins) &&
      trader.coins === 1000 &&
      trader.isSim &&
      trader.login.startsWith("sim_"),
  ),
);
ticks.sort((a, b) => a - b);
console.log(
  JSON.stringify(
    {
      scope: "E1 input/engine probe; full trading/runtime soak remains pending",
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: cpus()[0]?.model ?? "unavailable",
      seed: 42,
      virtualMinutes: 40,
      warmupMinutes: 10,
      measuredTicks: ticks.length,
      messages,
      listings: state.listings.size,
      traders: state.traders.size,
      tickP95Ms: ticks[Math.ceil(ticks.length * 0.95) - 1],
      tickMaxMs: ticks.at(-1),
      peakHeapMiB: peakHeap / 1024 ** 2,
      elapsedSeconds: (performance.now() - start) / 1000,
    },
    null,
    2,
  ),
);
