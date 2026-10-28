import assert from "node:assert/strict";
import test from "node:test";
import {
  createChatOut,
  createHelix,
  createSimulator,
  loadDemoCatalog,
  openStore,
} from "@emote-exchange/twitch-kit";
import { createMarketRuntime } from "../src/market-runtime.ts";
import { marketMigrations } from "../src/market-store.ts";
import { exchangeScenarios } from "../src/simulation.ts";

const emotes = loadDemoCatalog(new URL("../client/public/demo-emotes/", import.meta.url));
test("real simulator follow raid and bell effects pass through the market and never send live chat", async (t) => {
  let now = 1000;
  let fetches = 0;
  const auth = {
    identity: () => "100",
    accessToken: () => "private-token",
    refresh: async () => {},
  };
  const helix = createHelix({
    auth,
    clientId: "id",
    now: () => now,
    log: () => {},
    fetcher: async () => {
      fetches++;
      throw new Error("Sim output reached Twitch");
    },
  });
  const chat = createChatOut({ auth, helix, now: () => now, autoTick: false });
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  const market = createMarketRuntime({
    store,
    now: () => now,
    catalog: emotes,
    autoTick: false,
    say: chat.enqueue,
    publish: () => {},
  });
  const events: string[] = [];
  const simulator = createSimulator({
    emotes,
    scenarios: exchangeScenarios,
    now: () => now,
    autoTick: false,
    onEvent: (event) => {
      events.push(event.type);
      market.receive(event);
    },
  });
  t.after(() => {
    simulator.close();
    market.close();
    chat.close();
    helix.close();
    store.close();
  });
  simulator.start({
    seed: 42,
    scenario: "opening-day",
    rate: 4,
    chatters: 12,
    mix: { plain: 70, emote: 25, follow: 4, raid: 1 },
  });
  for (const action of [
    { type: "follow", chatter: 0 },
    { type: "raid", chatter: 1, viewers: 40 },
    { type: "offline" },
  ] as const)
    simulator.inject(action);
  now = 3000;
  simulator.tick();
  await chat.tick();
  assert.ok(
    ["StreamOnline", "StreamOffline", "Follow", "Raid", "ChatMessage"].every((type) =>
      events.includes(type),
    ),
  );
  assert.equal(fetches, 0);
  assert.ok(chat.publicState().logs.some((entry) => entry.text.startsWith("Closing bell:")));
  assert.ok(
    chat
      .publicState()
      .logs.every((entry) => entry.origin === "sim" && entry.kind === "would-have-said"),
  );
  assert.equal(simulator.publicState().running, true);
  assert.equal(simulator.publicState().chatMessageCount, 8);
  simulator.stop();
  const count = simulator.publicState().eventCount;
  now = 50_000;
  simulator.tick();
  assert.equal(simulator.publicState().eventCount, count);
});
test("Exchange scenarios supply input patterns and fixed bundled emotes without claiming market results", () => {
  assert.deepEqual(
    exchangeScenarios.map((scenario) => scenario.id),
    [
      "greeting-streak",
      "opening-day",
      "pump-and-dump",
      "solo-spammer",
      "raid-wave",
      "quiet-market",
      "soak",
    ],
  );
  for (const scenario of exchangeScenarios) {
    let now = 0;
    const simulator = createSimulator({
      emotes,
      scenarios: exchangeScenarios,
      now: () => now,
      autoTick: false,
    });
    try {
      simulator.start({ seed: 42, scenario: scenario.id, ...scenario.defaults });
      now = 1000;
      simulator.tick();
      assert.ok(simulator.publicState().eventCount > 0);
      assert.equal(simulator.publicState().config.scenario, scenario.id);
    } finally {
      simulator.close();
    }
  }
});

test("the full Soak input profile keeps 500 chatters and 24 emotes at 50 messages per second for 40 virtual minutes", () => {
  let now = 0;
  const users = new Set<string>();
  const keys = new Set<string>();
  const simulator = createSimulator({
    emotes,
    scenarios: exchangeScenarios,
    now: () => now,
    autoTick: false,
    onEvent: (event) => {
      if (event.type !== "ChatMessage") return;
      users.add(event.chatter.id);
      for (const part of event.parts) if (part.type === "emote") keys.add(part.key);
    },
  });
  try {
    const profile = exchangeScenarios.find((scenario) => scenario.id === "soak");
    assert.ok(profile);
    simulator.start({ seed: 42, scenario: profile.id, ...profile.defaults });
    for (now = 1000; now <= 2_400_000; now += 1000) simulator.tick();
    const final = simulator.publicState();
    assert.equal(final.chatMessageCount, 120_000);
    assert.equal(final.running, false);
    assert.equal(users.size, 500);
    assert.equal(keys.size, 24);
    assert.equal(final.elapsedMs, 2_400_000);
  } finally {
    simulator.close();
  }
});
