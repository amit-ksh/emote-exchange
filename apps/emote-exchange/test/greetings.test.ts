import assert from "node:assert/strict";
import test from "node:test";
import { createSimulator, loadDemoCatalog, openStore } from "@emote-exchange/twitch-kit";
import { shownStreak } from "../src/engine/greetings.ts";
import { stepMarket } from "../src/engine/market.ts";
import { createMarketRuntime } from "../src/market-runtime.ts";
import { createMarketRepository, marketMigrations } from "../src/market-store.ts";
import { exchangeScenarios } from "../src/simulation.ts";
import { chat, market } from "./market-fixture.ts";

function ann(state: ReturnType<typeof market>) {
  const trader = state.traders.get("sim_ann");
  assert.ok(trader);
  return trader;
}

test("restart ticks cannot turn an unclosed broadcast older than two hours into the same Stream", () => {
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
    runtime.receive({ type: "StreamOnline", id: "old", origin: "twitch", at: 0 });
    now = 1000;
    runtime.tick();
    runtime.close();
    now = 7_201_000;
    runtime = createMarketRuntime(options);
    runtime.tick();
    runtime.receive({ type: "StreamOnline", id: "new", origin: "twitch", at: now });
    assert.equal(runtime.display().session?.streamNo, 2);
  } finally {
    runtime.close();
    store.close();
  }
});

test("Greeting bonuses reach one hundred at six and cap at one hundred forty from ten", () => {
  let state = market();
  for (let stream = 1; stream <= 12; stream++) {
    state = stepMarket(
      state,
      { type: "StreamOnline", id: `open:${stream}`, origin: "sim", at: stream },
      stream,
    ).state;
    const result = stepMarket(state, chat("sim_ann", stream, "greetings", ["hello"]), stream);
    state = result.state;
    const credit = result.effects
      .flatMap((effect) => (effect.type === "persist" ? effect.credits : []))
      .find((row) => row.kind === "greeting");
    if (stream === 6) assert.equal(credit?.coins, 100);
    if (stream >= 10) assert.equal(credit?.coins, 140);
  }
});

test("first greeting pays fifty, repeats once without credit, and next demo Stream builds Streak two", () => {
  let state = stepMarket(
    market(),
    { type: "StreamOnline", id: "sim:open1", origin: "sim", at: 0 },
    0,
  ).state;
  const result = stepMarket(state, chat("sim_ann", 1, "greetings", ["private-secret-greeting"]), 1);
  state = result.state;
  assert.equal(state.traders.get("sim_ann")?.coins, 1050);
  assert.equal(state.traders.get("sim_ann")?.greetingStreak, 1);
  assert.equal(JSON.stringify(result.effects).includes("private-secret-greeting"), false);
  assert.equal(state.participation.size, 0);
  const repeat = stepMarket(state, chat("sim_ann", 2, "greetings", ["again"]), 2);
  assert.equal(repeat.state.traders.get("sim_ann")?.coins, 1050);
  assert.equal(repeat.effects.filter((effect) => effect.type === "say").length, 1);
  state = stepMarket(
    repeat.state,
    { type: "StreamOnline", id: "sim:open2", origin: "sim", at: 3 },
    3,
  ).state;
  state = stepMarket(state, chat("sim_ann", 4, "greetings", ["hello"]), 4).state;
  assert.equal(state.traders.get("sim_ann")?.coins, 1110);
  assert.equal(state.traders.get("sim_ann")?.greetingStreak, 2);
});

test("live bells continue below two hours, start anew at the boundary, and skipped Streams hide then restart Streaks", () => {
  let state = stepMarket(
    market(),
    { type: "StreamOnline", id: "live1", origin: "twitch", at: 0 },
    0,
  ).state;
  state = stepMarket(state, chat("sim_ann", 1, "greetings", ["hi"]), 1).state;
  state = stepMarket(
    state,
    { type: "StreamOffline", id: "close1", origin: "twitch", at: 2 },
    2,
  ).state;
  state = stepMarket(
    state,
    { type: "StreamOnline", id: "live2", origin: "twitch", at: 7_200_001 },
    7_200_001,
  ).state;
  assert.equal(state.streamNo, 1);
  state = stepMarket(
    state,
    { type: "StreamOffline", id: "close2", origin: "twitch", at: 7_200_002 },
    7_200_002,
  ).state;
  state = stepMarket(
    state,
    { type: "StreamOnline", id: "live3", origin: "twitch", at: 14_400_002 },
    14_400_002,
  ).state;
  assert.equal(state.streamNo, 2);
  assert.equal(shownStreak(state, ann(state)), 1);
  state = stepMarket(
    state,
    { type: "StreamOnline", id: "demo3", origin: "sim", at: 14_400_003 },
    14_400_003,
  ).state;
  assert.equal(shownStreak(state, ann(state)), null);
  state = stepMarket(state, chat("sim_ann", 14_400_004, "greetings", ["return"]), 14_400_004).state;
  assert.equal(state.traders.get("sim_ann")?.greetingStreak, 1);
});

test("bare, closed and frozen greetings never credit, credits saturate, and Season reset clears Streaks", () => {
  let state = stepMarket(market(), chat("sim_ann", 0), 0).state;
  for (const args of [[], ["closed"]])
    state = stepMarket(state, chat("sim_ann", 0, "greetings", args), 0).state;
  assert.equal(state.traders.get("sim_ann")?.coins, 1000);
  state = stepMarket(state, { type: "StreamOnline", id: "open", origin: "sim", at: 0 }, 0).state;
  state = stepMarket(
    state,
    { type: "Freeze", id: "freeze", origin: "sim", userId: "sim_ann", value: true },
    0,
  ).state;
  state = stepMarket(state, chat("sim_ann", 0, "greetings", ["frozen"]), 0).state;
  assert.equal(state.traders.get("sim_ann")?.coins, 1000);
  state.traders.set("sim_ann", {
    ...ann(state),
    frozen: false,
    coins: 999_999_990,
  });
  const result = stepMarket(state, chat("sim_ann", 0, "greetings", ["unique-private-words"]), 0);
  assert.equal(result.state.traders.get("sim_ann")?.coins, 1_000_000_000);
  assert.ok(
    result.effects.some(
      (effect) =>
        effect.type === "persist" &&
        effect.credits.some((row) => row.kind === "greeting" && row.coins === 10),
    ),
  );
  assert.equal(JSON.stringify(result.effects).includes("unique-private-words"), false);
  state = stepMarket(
    result.state,
    { type: "Reset", id: "reset", origin: "sim", confirmation: "RESET" },
    0,
  ).state;
  assert.equal(state.traders.size, 0);
  assert.equal(state.streamNo, 0);
});

test("SQLite restore reproduces live Streak, Stream number and claim suppression exactly", () => {
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  try {
    const repo = createMarketRepository(store);
    let state = repo.load(0);
    for (const input of [
      { type: "StreamOnline" as const, id: "live", origin: "twitch" as const, at: 0 },
      chat("sim_ann", 0, "greetings", ["private-greeting"]),
    ]) {
      const next = stepMarket(state, input, 0);
      repo.commit(next.state, next.effects);
      state = next.state;
    }
    const restored = repo.load(0);
    assert.deepEqual(restored, { ...state, feed: [] });
    const repeated = stepMarket(restored, chat("sim_ann", 1, "greetings", ["again"]), 1);
    assert.equal(repeated.state.traders.get("sim_ann")?.coins, 1050);
    assert.equal(
      JSON.stringify(store.read("SELECT data FROM engine_state")).includes("private-greeting"),
      false,
    );
    const resumed = stepMarket(
      restored,
      { type: "StreamOnline", id: "restart", origin: "twitch", at: 1 },
      1,
    );
    assert.equal(resumed.state.streamNo, 1);
  } finally {
    store.close();
  }
});

test("Greeting streak simulator crosses four Streams and two chatters skip one", () => {
  const emotes = loadDemoCatalog(new URL("../client/public/demo-emotes/", import.meta.url));
  let now = 0;
  let state = market();
  const profile = exchangeScenarios.find((row) => row.id === "greeting-streak");
  assert.ok(profile);
  const simulator = createSimulator({
    emotes,
    scenarios: exchangeScenarios,
    autoTick: false,
    now: () => now,
    onEvent: (event) => {
      state = stepMarket(state, event, now).state;
    },
  });
  try {
    simulator.start({ seed: 42, scenario: profile.id, ...profile.defaults });
    for (now = 1000; now <= 48_000; now += 1000) simulator.tick();
    assert.equal(state.streamNo, 4);
    assert.equal([...state.traders.values()].filter((row) => row.greetingStreak === 4).length, 10);
    assert.equal([...state.traders.values()].filter((row) => row.greetingStreak === 1).length, 2);
  } finally {
    simulator.close();
  }
});
