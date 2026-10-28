import assert from "node:assert/strict";
import test from "node:test";
import type { ChatEvent, Emote } from "@emote-exchange/twitch-kit";
import { initialMarketState, marketDisplay, stepMarket } from "../src/engine/market.ts";
import { marketSettings } from "../src/engine/settings.ts";

const emote = (name: string): Emote => ({
  key: `demo:${name}`,
  name,
  imageUrl: `/demo-emotes/${name}.svg`,
  animated: false,
});
let delivery = 0;
function chat(
  user: string,
  at: number,
  names: string[] = [],
  overrides: Partial<Extract<ChatEvent, { type: "ChatMessage" }>> = {},
): Extract<ChatEvent, { type: "ChatMessage" }> {
  return {
    type: "ChatMessage",
    id: `sim:fixture:${++delivery}`,
    at,
    origin: "sim",
    messageId: `sim:message:${delivery}`,
    chatter: {
      id: user,
      login: user,
      displayName: user,
      color: "#FFFFFF",
      isBroadcaster: false,
      isMod: false,
      isVip: false,
      isSubscriber: false,
    },
    text: "private incoming chat",
    parts: names.map((name) => ({ type: "emote", text: name, ...emote(name) })),
    command: null,
    foreign: false,
    selfSent: false,
    ...overrides,
  };
}
function fixture(names = ["A", "B", "C", "D"]) {
  return initialMarketState({
    now: 0,
    catalog: names.map(emote),
    seedListings: names.map((name) => ({
      emote: emote(name),
      ipoAt: 0,
      sessionOpenPrice: 100,
      heat: 2,
      base: 100,
      impact: 0,
      lastUseAt: 0,
    })),
  });
}

test("two distinct Chatters IPO at 100 with one Use per Emote per message and safe SIM effects", () => {
  const initial = initialMarketState({ now: 0, catalog: [emote("A")] });
  let state = initial;
  for (let i = 0; i < 10; i++) state = stepMarket(state, chat("sim_one", 0, ["A", "A"]), 0).state;
  assert.equal(state.listings.size, 0, "one Chatter cannot IPO by repeating");
  const result = stepMarket(state, chat("sim_two", 0, ["A", "A"]), 0);
  const listing = result.state.listings.get("A");
  assert.ok(listing);
  assert.equal(listing.price, 100);
  assert.equal(listing.sessionOpenPrice, 100);
  assert.equal(listing.heat, 2.998046875, "ten diminishing uses plus one fresh use");
  assert.equal(result.state.traders.get("sim_one")?.coins, 1000);
  assert.equal(result.state.traders.size, 2);
  const broadcasts = result.effects.filter((effect) => effect.type === "broadcast");
  assert.equal(broadcasts.length, 1);
  assert.deepEqual(
    broadcasts[0].moments.map(({ kind, ticker, origin }) => ({ kind, ticker, origin })),
    [{ kind: "IPO", ticker: "A", origin: "sim" }],
  );
  assert.equal(
    JSON.stringify([...result.state.traders.values()]).includes("private incoming chat"),
    false,
  );
  assert.equal(JSON.stringify(result.effects).includes("private incoming chat"), false);
  assert.equal(
    JSON.stringify(marketDisplay(result.state)).includes("private incoming chat"),
    false,
  );
  assert.equal(initial.traders.size, 0);
  assert.equal(initial.pending.size, 0);
});

test("foreign, self-sent and command chat never adds Heat; recognized commands and plain chat keep Trader identity", () => {
  let state = initialMarketState({ now: 0, catalog: [emote("A")] });
  for (const override of [
    { foreign: true },
    { selfSent: true },
    { command: { name: "anotherbot", args: ["private arg"] } },
  ]) {
    const result = stepMarket(state, chat("sim_ignored", 0, ["A"], override), 0);
    assert.equal(result.state.traders.size, 0);
    assert.equal(result.state.pending.size, 0);
    assert.equal(result.effects.length, 0);
  }
  state = stepMarket(state, chat("sim_plain", 0), 0).state;
  assert.equal(state.traders.get("sim_plain")?.coins, 1000);
  const command = chat("sim_command", 1000, ["A"], { command: { name: "buy", args: ["A", "5"] } });
  state = stepMarket(state, command, 1000).state;
  assert.equal(state.traders.get("sim_command")?.coins, 1000);
  assert.equal(state.pending.size, 0);
  state = stepMarket(
    state,
    {
      ...command,
      id: "rename",
      at: 2000,
      chatter: { ...command.chatter, login: "renamed", displayName: "Renamed" },
    },
    2000,
  ).state;
  assert.equal(state.traders.size, 2);
  assert.equal(state.traders.get("sim_command")?.login, "renamed");
  assert.equal(state.traders.get("sim_command")?.createdAt, 1000);
  assert.equal(state.traders.get("sim_command")?.lastActiveAt, 2000);
  assert.equal(state.traders.get("sim_command")?.coins, 1000);
});

test("repeat Uses expire at 30 seconds and pending IPO Uses at ten minutes on every input", () => {
  let state = initialMarketState({ now: 0, catalog: [emote("A"), emote("B")] });
  state = stepMarket(state, chat("sim_one", 0, ["A"]), 0).state;
  const listed = stepMarket(state, chat("sim_two", 0, ["A"]), 0).state;
  assert.equal(
    stepMarket(listed, chat("sim_one", 29_999, ["A"]), 29_999).state.listings.get("A")?.heat,
    2.5,
  );
  assert.equal(
    stepMarket(listed, chat("sim_one", 30_000, ["A"]), 30_000).state.listings.get("A")?.heat,
    3,
  );
  const before = stepMarket(state, chat("sim_two", 599_999, ["A"]), 599_999);
  assert.equal(before.state.listings.size, 1);
  state = stepMarket(state, chat("sim_two", 600_000, ["A"]), 600_000).state;
  assert.equal(state.listings.size, 0, "the first use has expired at the exact boundary");
  assert.equal(state.pending.get("A")?.uses.length, 1);
  state = stepMarket(state, { type: "Tick" }, 1_200_000).state;
  assert.equal(state.pending.size, 0);
  assert.equal(state.repeats.size, 0);
  state = stepMarket(state, chat("sim_one", 1_200_000, ["B"]), 1_200_000).state;
  state = stepMarket(
    state,
    {
      type: "ConnectionChanged",
      id: "connection",
      at: 1_800_000,
      origin: "sim",
      status: "connected",
      detail: "private status",
    },
    1_800_000,
  ).state;
  assert.equal(state.pending.size, 0, "non-chat events prune windows too");
  assert.equal(state.repeats.size, 0);
});

test("B1 and B3 match the fixed E0 endpoints through real Heat and price ticks", () => {
  let state = fixture();
  let peak = 100;
  let at60 = 0;
  for (let second = 0; second <= 360; second++) {
    const now = second * 1000;
    if (second < 60 && second % 5 === 0)
      for (let i = 0; i < 10; i++)
        state = stepMarket(state, chat(`sim_group_${i}`, now, ["A"]), now).state;
    if ((second <= 60 && second % 15 === 0) || (second >= 65 && second % 5 === 0))
      for (const name of ["B", "C", "D"])
        state = stepMarket(state, chat(`sim_${name}_${second}`, now, [name]), now).state;
    state = stepMarket(state, { type: "Tick" }, now).state;
    const price = state.listings.get("A")?.price ?? 0;
    if (second <= 60) peak = Math.max(peak, price);
    if (second === 60) at60 = price;
  }
  assert.equal(at60, 181.64);
  assert.ok(at60 >= 180);
  assert.equal(peak, 185.05);
  assert.equal(state.listings.get("A")?.price, 18.75);
  assert.ok((state.listings.get("A")?.price ?? Infinity) <= peak * 0.6);
});

test("B2 and B5 preserve the lone-spammer ceiling and all three small-chat attention shifts", () => {
  let state = fixture();
  let peak = 100;
  for (let second = 0; second <= 30; second++) {
    const now = second * 1000;
    if (second < 30) state = stepMarket(state, chat("sim_solo", now, ["A"]), now).state;
    if (second === 0)
      for (let i = 0; i < 3; i++)
        state = stepMarket(state, chat(`sim_distinct_${i}`, now, ["B"]), now).state;
    state = stepMarket(state, { type: "Tick" }, now).state;
    peak = Math.max(peak, state.listings.get("A")?.price ?? 0);
  }
  assert.equal(peak, 112.99);
  assert.equal(state.listings.get("B")?.price, 129.68);
  assert.ok(peak <= 125);
  assert.ok((state.listings.get("B")?.price ?? 0) > peak);
  state = fixture(["A", "B", "C"]);
  const samples = new Map<number, number[]>();
  for (let second = 0; second <= 150; second++) {
    const now = second * 1000;
    if (second % 5 === 0) {
      state = stepMarket(state, chat("sim_always_b", now, ["B"]), now).state;
      state = stepMarket(state, chat("sim_always_c", now, ["C"]), now).state;
      state = stepMarket(
        state,
        chat("sim_switcher", now, [second < 60 ? "A" : second < 120 ? "B" : "C"]),
        now,
      ).state;
    }
    state = stepMarket(state, { type: "Tick" }, now).state;
    if ([0, 30, 59, 90, 119, 150].includes(second))
      samples.set(
        second,
        ["A", "B", "C"].map((ticker) => state.listings.get(ticker)?.price ?? 0),
      );
  }
  assert.equal(samples.get(30)?.[0], 118.71);
  assert.equal(samples.get(59)?.[1], 122.82);
  assert.equal(samples.get(90)?.[1], 149.94);
  assert.equal(samples.get(119)?.[2], 109.16);
  assert.equal(samples.get(150)?.[2], 141.24);
  const phase = (second: number, index: number) => {
    const prices = samples.get(second);
    assert.ok(prices);
    return prices[index];
  };
  assert.ok(phase(30, 0) / phase(0, 0) >= 1.15);
  assert.ok(phase(90, 1) / phase(59, 1) >= 1.15);
  assert.ok(phase(150, 2) / phase(119, 2) >= 1.15);
});

test("a full market waits for a slot then auto-Delists the coldest thirty-minute-unused Listing deterministically", () => {
  const names = Array.from({ length: 24 }, (_, i) => `A${String(i).padStart(2, "0")}`);
  let state = initialMarketState({ now: 0, catalog: [...names, "X"].map(emote) });
  state = stepMarket(state, chat("sim_one", 0, names), 0).state;
  state = stepMarket(state, chat("sim_two", 0, names), 0).state;
  state = stepMarket(state, chat("sim_warmer", 0, ["A00"]), 0).state;
  for (const user of ["sim_x", "sim_y"]) state = stepMarket(state, chat(user, 0, ["X"]), 0).state;
  assert.equal(state.listings.size, 24);
  assert.equal(state.pending.size, 1);
  assert.equal(state.listings.has("X"), false);
  for (const user of ["sim_x", "sim_y"])
    state = stepMarket(state, chat(user, 1_799_000, ["X"]), 1_799_000).state;
  state = stepMarket(state, { type: "Tick" }, 1_799_999).state;
  assert.equal(state.listings.has("X"), false);
  const result = stepMarket(state, { type: "Tick" }, 1_800_000);
  assert.equal(result.state.listings.size, 24);
  assert.equal(
    result.state.listings.has("A01"),
    false,
    "equal Heat resolves by IPO time then ticker",
  );
  assert.equal(result.state.listings.get("X")?.price, 100);
  assert.equal(result.state.pending.size, 0);
  const moments = result.effects.flatMap((effect) =>
    effect.type === "broadcast" ? effect.moments : [],
  );
  assert.deepEqual(
    moments.map(({ kind, ticker, origin }) => ({ kind, ticker, origin })),
    [
      { kind: "DELIST", ticker: "A01", origin: "sim" },
      { kind: "IPO", ticker: "X", origin: "sim" },
    ],
  );
  const writes = result.effects.filter((effect) => effect.type === "persist");
  assert.equal(writes[0].delisted[0].emote.name, "A01");
  assert.equal(state.listings.has("A01"), true, "prior state stays unchanged");
});

test("symbol tickers and uncatalogued authoritative Twitch fragments work while unknown third-party words do not IPO", () => {
  let state = initialMarketState({
    now: 0,
    catalog: [emote("__proto__"), { ...emote("<3"), key: "demo:Heart" }],
  });
  const twitch: Emote = {
    key: "twitch:123",
    name: "SubEmote",
    animated: false,
    imageUrl: "https://static-cdn.jtvnw.net/emoticons/v2/123/static/dark/3.0",
  };
  for (const user of ["sim_one", "sim_two"]) {
    const input = chat(user, 0, ["__proto__", "<3", "Unknown"]);
    input.parts.push({ type: "emote", text: twitch.name, ...twitch });
    state = stepMarket(state, input, 0).state;
  }
  assert.equal(state.listings.size, 3);
  assert.equal(state.listings.has("__proto__"), true);
  assert.equal(state.listings.has("<3"), true);
  assert.equal(state.pending.has("Unknown"), false);
  assert.deepEqual(state.listings.get("SubEmote")?.emote, twitch);
  const bad = { ...twitch, name: "Bad", imageUrl: "javascript:private" };
  for (const user of ["sim_one", "sim_two"])
    state = stepMarket(
      state,
      chat(user, 0, [], { parts: [{ type: "emote", text: "Bad", ...bad }] }),
      0,
    ).state;
  assert.equal(state.pending.has("Bad"), false);
  assert.equal(state.listings.has("Bad"), false);
});

test("quiet bases freeze while impact decays, and real tick candles/history stay bounded without invented gap samples", () => {
  let state = initialMarketState({
    now: 0,
    catalog: [emote("A"), emote("B")],
    seedListings: [
      {
        emote: emote("A"),
        heat: 0,
        base: 100,
        impact: 1,
        ipoAt: 0,
        lastUseAt: 0,
        sessionOpenPrice: 100,
      },
      {
        emote: emote("B"),
        heat: 0,
        base: 1.5,
        impact: -0.5,
        ipoAt: 0,
        lastUseAt: 0,
        sessionOpenPrice: 100,
      },
    ],
  });
  assert.equal(state.listings.get("B")?.price, 1);
  state = stepMarket(state, { type: "Tick" }, 30_000).state;
  assert.equal(state.listings.get("A")?.base, 100);
  assert.equal(state.listings.get("A")?.price, 150);
  assert.equal(state.listings.get("B")?.price, 1.13);
  assert.deepEqual(state.listings.get("A")?.candles, [
    { minuteStart: 0, open: 200, high: 200, low: 150, close: 150 },
  ]);
  assert.deepEqual(
    state.listings.get("A")?.priceHistory.map((sample) => sample.at),
    [0, 30_000],
    "a clock gap cannot fabricate intermediate samples",
  );
  state = stepMarket(state, { type: "Tick" }, 60_000).state;
  assert.equal(state.listings.get("A")?.candles[1].open, 125);
  for (let now = 61_000; now <= 1_200_000; now += 1000)
    state = stepMarket(state, { type: "Tick" }, now).state;
  const listing = state.listings.get("A");
  assert.ok(listing);
  assert.equal(listing.base, 100);
  assert.equal(listing.candles.length, 11);
  assert.equal(listing.candles[0].minuteStart, 600_000);
  assert.equal(listing.candles.at(-1)?.minuteStart, 1_200_000);
  assert.equal(listing.priceHistory.length, 601);
  assert.equal(listing.priceHistory[0].at, 600_000);
  const before = structuredClone(state);
  for (let now = 1_200_001; now < 1_201_000; now++)
    state = stepMarket(state, { type: "Tick" }, now).state;
  assert.ok(
    (state.listings.get("A")?.priceHistory.length ?? Infinity) <= 602,
    "subsecond callers cannot grow history indefinitely",
  );
  assert.deepEqual(
    before.listings.get("A"),
    listing,
    "later calls do not mutate prior candles or samples",
  );
  state = stepMarket(
    state,
    {
      type: "ConnectionChanged",
      id: "prune",
      origin: "sim",
      at: 2_000_000,
      status: "lost",
      detail: "private",
    },
    2_000_000,
  ).state;
  assert.equal(state.listings.get("A")?.candles.length, 0);
  assert.equal(state.listings.get("A")?.priceHistory.length, 1, "keep one actual boundary sample");
});

test("settings, clocks and explicit seeds are validated and configured starting Coins remain whole", () => {
  for (const invalid of [
    null,
    [],
    { unknown: 1 },
    { toString: 1 },
    { STARTING_COINS: -1 },
    { STARTING_COINS: 1.5 },
    { STARTING_COINS: 1_000_000_001 },
    { HEAT_HALF_LIFE: 0 },
    { PRICE_TAU: NaN },
    { ELASTICITY: Infinity },
    { MAX_LISTINGS: 25 },
    { IPO_MIN_CHATTERS: 1 },
  ])
    assert.throws(() => marketSettings(invalid), /settings/i);
  const config = { STARTING_COINS: 42, HEAT_HALF_LIFE: 30 };
  let state = initialMarketState({
    now: 0,
    settings: config,
    catalog: [emote("A")],
    seedListings: [
      {
        emote: emote("A"),
        ipoAt: 0,
        lastUseAt: 0,
        sessionOpenPrice: 100,
        base: 100,
        impact: 0,
        heat: 2,
      },
    ],
  });
  config.STARTING_COINS = 55;
  state = stepMarket(state, chat("sim_new", 0), 0).state;
  assert.equal(state.traders.get("sim_new")?.coins, 42);
  state = stepMarket(state, { type: "Tick" }, 30_000).state;
  assert.equal(state.listings.get("A")?.heat, 1);
  for (const now of [-1, 1.5, Infinity]) assert.throws(() => initialMarketState({ now }), /clock/i);
  for (const now of [29_999, NaN, 30_000.5])
    assert.throws(() => stepMarket(state, { type: "Tick" }, now), /clock/i);
  const seed = {
    emote: emote("A"),
    ipoAt: 0,
    lastUseAt: 0,
    sessionOpenPrice: 100,
    base: 100,
    impact: 0,
    heat: 2,
  };
  for (const patch of [
    { heat: -1 },
    { base: NaN },
    { impact: 2 },
    { ipoAt: 1 },
    { lastUseAt: -1 },
    { sessionOpenPrice: 0 },
  ])
    assert.throws(
      () => initialMarketState({ now: 0, seedListings: [{ ...seed, ...patch }] }),
      /seed/i,
    );
  assert.throws(() => initialMarketState({ now: 0, seedListings: [seed, seed] }), /seed/i);
  assert.throws(
    () =>
      initialMarketState({
        now: 0,
        settings: { MAX_LISTINGS: 1 },
        seedListings: [seed, { ...seed, emote: emote("B") }],
      }),
    /seed/i,
  );
  assert.throws(
    () =>
      initialMarketState({
        now: 0,
        catalog: [{ ...emote("A"), imageUrl: "https://attacker.invalid/private" }],
      }),
    /Emote/i,
  );
});

test("early markets scale attention as four Listings and preserve the real IPO sample under subsecond ticks", () => {
  for (const [names, price] of [
    [["A"], 215.58],
    [["A", "B"], 143.1],
  ] as const) {
    const state = fixture([...names]);
    const result = stepMarket(state, { type: "Tick" }, 20_000);
    assert.equal(result.state.listings.get("A")?.price, price);
    assert.equal(state.listings.get("A")?.price, 100);
    const write = result.effects.find((effect) => effect.type === "persist");
    assert.ok(write);
    write.listings[0].price = 99;
    write.listings[0].emote.name = "changed";
    assert.equal(result.state.listings.get("A")?.price, price, "effects are detached from state");
    assert.equal(result.state.listings.get("A")?.emote.name, "A");
  }
  let state = fixture(["A"]);
  const previous = structuredClone(state);
  state = stepMarket(state, { type: "Tick" }, 100).state;
  assert.deepEqual(
    state.listings.get("A")?.priceHistory.map((sample) => sample.at),
    [0, 100],
  );
  state = stepMarket(state, { type: "Tick" }, 200).state;
  assert.deepEqual(
    state.listings.get("A")?.priceHistory.map((sample) => sample.at),
    [0, 200],
  );
  const original = fixture(["A"]);
  assert.deepEqual(
    previous,
    original,
    "processing ticks leaves the complete prior state unchanged",
  );
});
