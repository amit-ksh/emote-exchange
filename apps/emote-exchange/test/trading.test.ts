import assert from "node:assert/strict";
import test from "node:test";
import type { ChatEvent, Emote } from "@emote-exchange/twitch-kit";
import type { MarketInput } from "../src/engine/market.ts";
import { initialMarketState, stepMarket } from "../src/engine/market.ts";
import type { MarketSettings } from "../src/engine/settings.ts";

const emote = (name: string): Emote => ({
  key: `demo:${name}`,
  name,
  imageUrl: `/demo-emotes/${name}.svg`,
  animated: false,
});
let serial = 0;
function message(
  user: string,
  now: number,
  command: string | null = null,
  args: string[] = [],
): Extract<ChatEvent, { type: "ChatMessage" }> {
  const id = `sim:trading:${++serial}`;
  return {
    type: "ChatMessage",
    id,
    messageId: `${id}:message`,
    origin: "sim",
    at: now,
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
    text: "private chat text",
    parts: [],
    command: command ? { name: command, args } : null,
    foreign: false,
    selfSent: false,
  };
}
function market(price = 100, coins = 1000, names = ["X"], settings: Partial<MarketSettings> = {}) {
  return initialMarketState({
    now: 0,
    settings: { STARTING_COINS: coins, ...settings },
    catalog: names.map(emote),
    seedListings: names.map((name) => ({
      emote: emote(name),
      ipoAt: 0,
      lastUseAt: 0,
      base: price,
      impact: 0,
      heat: 0,
      sessionOpenPrice: 100,
    })),
  });
}

test("a five-share buy fills at the pre-impact Price, debits 505 Coins and emits one ledger/feed/reply result", () => {
  const previous = market();
  const input = message("sim_ann", 0, "buy", ["X", "5"]);
  const result = stepMarket(previous, input, 0);
  assert.equal(result.state.traders.get("sim_ann")?.coins, 495);
  assert.deepEqual(result.state.holdings.get("sim_ann")?.get("X"), {
    userId: "sim_ann",
    ticker: "X",
    shares: 5,
    costBasis: 505,
  });
  assert.equal(result.state.listings.get("X")?.price, 100.1);
  assert.equal(result.state.cooldowns.get("sim_ann"), 3000);
  const writes = result.effects.find((effect) => effect.type === "persist");
  assert.ok(writes);
  assert.deepEqual(
    writes.trades.map(({ userId, ticker, side, shares, price, coins }) => ({
      userId,
      ticker,
      side,
      shares,
      price,
      coins,
    })),
    [{ userId: "sim_ann", ticker: "X", side: "buy", shares: 5, price: 100, coins: 505 }],
  );
  const says = result.effects.filter((effect) => effect.type === "say");
  assert.equal(says.length, 1);
  assert.equal(says[0].origin, "sim");
  assert.equal(says[0].replyParentMessageId, input.messageId);
  assert.equal(result.state.feed.at(-1)?.kind, "TRADE");
  assert.equal(JSON.stringify(result.effects).includes("private chat text"), false);
  assert.equal(previous.traders.size, 0);
});

test("minimum fees, max affordability, sell all and exact decimal settlement use whole Coins", () => {
  let state = market(1.5, 3);
  state = stepMarket(state, message("sim_ann", 0, "buy", ["X", "1"]), 0).state;
  assert.equal(state.traders.get("sim_ann")?.coins, 0);
  const sold = stepMarket(state, message("sim_ann", 3000, "sell", ["X", "all"]), 3000);
  assert.equal(sold.state.traders.get("sim_ann")?.coins, 0);
  assert.equal(sold.state.holdings.has("sim_ann"), false);
  assert.equal(sold.effects.find((effect) => effect.type === "persist")?.trades[0].coins, 0);
  state = market(100, 1000, ["X"], { IMPACT_PER_100: 0 });
  state = stepMarket(state, message("sim_max", 0, "buy", ["x", "max"]), 0).state;
  assert.equal(state.traders.get("sim_max")?.coins, 91);
  assert.equal(state.holdings.get("sim_max")?.get("X")?.shares, 9);
  state = stepMarket(state, message("sim_max", 3000, "sell", ["X", "all"]), 3000).state;
  assert.equal(state.traders.get("sim_max")?.coins, 982);
  assert.equal(state.holdings.size, 0);
  state = market(7.15, 100_000, ["X"], { IMPACT_PER_100: 0 });
  state = stepMarket(state, message("sim_decimal", 0, "buy", ["X", "10000"]), 0).state;
  assert.equal(state.traders.get("sim_decimal")?.coins, 27_785);
  state = stepMarket(state, message("sim_decimal", 3000, "sell", ["X", "all"]), 3000).state;
  assert.equal(state.traders.get("sim_decimal")?.coins, 98_570);
  state = market(100, 1000, ["X", "x"]);
  state = stepMarket(state, message("sim_exact", 0, "buy", ["x", "1"]), 0).state;
  assert.equal(state.holdings.get("sim_exact")?.get("x")?.shares, 1);
});

test("every trade rejection leaves Coins Holdings impact and cooldown unchanged and emits exactly one fixed reply", () => {
  let state = market();
  state = stepMarket(state, message("sim_ann", 0), 0).state;
  const reject = (command: string, args: string[], now: number) => {
    const before = structuredClone({
      coins: state.traders.get("sim_ann")?.coins,
      holdings: state.holdings,
      cooldowns: state.cooldowns,
      listings: state.listings,
    });
    const result = stepMarket(state, message("sim_ann", now, command, args), now);
    assert.equal(result.effects.filter((effect) => effect.type === "say").length, 1);
    assert.equal(result.effects.find((effect) => effect.type === "persist")?.trades.length, 0);
    assert.deepEqual(
      {
        coins: result.state.traders.get("sim_ann")?.coins,
        holdings: result.state.holdings,
        cooldowns: result.state.cooldowns,
        listings: result.state.listings,
      },
      before,
    );
    return result;
  };
  for (const qty of ["0", "-1", "1.5", "1e3", "NaN", "1000001", "9007199254740993"])
    reject("buy", ["X", qty], 0);
  reject("buy", ["X", "max", "extra"], 0);
  reject("sell", ["X", "all", "extra"], 0);
  reject("buy", ["missing", "1"], 0);
  reject("buy", ["X", "10"], 0);
  reject("sell", ["X", "1"], 0);
  reject("sell", ["X", "all"], 0);
  state = stepMarket(state, { type: "Pause", id: "pause", origin: "sim", value: true }, 0).state;
  const paused = reject("buy", ["X", "1"], 0);
  assert.match(paused.effects.find((effect) => effect.type === "say")?.text ?? "", /paused/i);
  state = stepMarket(state, { type: "Pause", id: "resume", origin: "sim", value: false }, 0).state;
  state = stepMarket(
    state,
    { type: "Freeze", id: "freeze", origin: "sim", userId: "sim_ann", value: true },
    0,
  ).state;
  assert.match(
    reject("buy", ["X", "1"], 0).effects.find((effect) => effect.type === "say")?.text ?? "",
    /frozen/i,
  );
  state = stepMarket(
    state,
    { type: "Freeze", id: "unfreeze", origin: "sim", userId: "sim_ann", value: false },
    0,
  ).state;
  state = stepMarket(state, message("sim_ann", 0, "buy", ["X", "1"]), 0).state;
  assert.match(
    reject("buy", ["X", "1"], 1000).effects.find((effect) => effect.type === "say")?.text ?? "",
    /2s/,
  );
  const accepted = stepMarket(state, message("sim_ann", 3000, "buy", ["X", "1"]), 3000);
  assert.equal(accepted.effects.find((effect) => effect.type === "persist")?.trades.length, 1);
  state = market(100, 1000, ["TeSt", "TEST"]);
  state = stepMarket(state, message("sim_ann", 0), 0).state;
  reject("buy", ["test", "1"], 0);
});

test("Delist pays each entire Holding once without a fee and sales record only the credit applied at the Coin cap", () => {
  let state = market(1.5, 1000);
  state = stepMarket(state, message("sim_ann", 0, "buy", ["X", "3"]), 0).state;
  assert.equal(state.traders.get("sim_ann")?.coins, 994);
  const result = stepMarket(
    state,
    { type: "Delist", id: "delist-x", origin: "sim", ticker: "X" },
    1,
  );
  assert.equal(result.state.traders.get("sim_ann")?.coins, 998);
  assert.equal(result.state.holdings.size, 0);
  assert.equal(result.state.listings.size, 0);
  const write = result.effects.find((effect) => effect.type === "persist");
  assert.ok(write);
  assert.equal(write.credits[0].coins, 4, "floor(1.50 * 3) rounds once for the whole Holding");
  assert.equal(write.holdings[0].shares, 0);
  assert.equal(write.delisted.length, 1);
  const again = stepMarket(
    result.state,
    { type: "Delist", id: "delist-again", origin: "sim", ticker: "X" },
    2,
  );
  assert.equal(again.state.traders.get("sim_ann")?.coins, 998);
  state = market(100, 1_000_000_000);
  state = stepMarket(state, message("sim_rich", 0, "buy", ["X", "1000000"]), 0).state;
  const sold = stepMarket(state, message("sim_rich", 3000, "sell", ["X", "all"]), 3000);
  assert.equal(sold.state.traders.get("sim_rich")?.coins, 1_000_000_000);
  assert.equal(
    sold.effects.find((effect) => effect.type === "persist")?.trades[0].coins,
    101_000_000,
  );
  state = market(1, 1_000_000_000);
  state = stepMarket(state, message("sim_max", 0, "buy", ["X", "max"]), 0).state;
  assert.equal(state.holdings.get("sim_max")?.get("X")?.shares, 1_000_000);
});

test("Stipends pay actual chat minutes once; Follow and Raid Visa credits obey identity windows and saturation", () => {
  let state = market();
  for (const now of [0, 60_000, 120_000]) {
    state = stepMarket(state, message("sim_ann", now), now).state;
    state = stepMarket(state, { type: "Tick" }, now).state;
  }
  state = stepMarket(state, { type: "Tick" }, 180_000).state;
  assert.equal(state.traders.get("sim_ann")?.coins, 1030);
  state = stepMarket(state, { type: "Tick" }, 240_000).state;
  assert.equal(state.traders.get("sim_ann")?.coins, 1030);
  assert.equal(state.participation.size, 0);
  const follow = {
    type: "Follow" as const,
    id: "follow-1",
    origin: "sim" as const,
    at: 240_000,
    user: { id: "sim_fan", login: "sim_fan", displayName: "sim_fan" },
  };
  state = stepMarket(state, follow, 240_000).state;
  assert.equal(state.traders.get("sim_fan")?.coins, 1200);
  assert.equal(stepMarket(state, follow, 240_000).state.traders.get("sim_fan")?.coins, 1200);
  state = stepMarket(state, message("sim_old_unknown", 240_000, "otherbot"), 240_000).state;
  const raid = {
    type: "Raid" as const,
    id: "raid-1",
    origin: "sim" as const,
    at: 240_000,
    from: { id: "raider", login: "raider", displayName: "raider" },
    viewers: 40,
  };
  state = stepMarket(state, raid, 240_000).state;
  state = stepMarket(state, message("sim_fan", 240_000), 240_000).state;
  assert.equal(
    state.traders.get("sim_fan")?.coins,
    1700,
    "a Follow is not the user's first chat message",
  );
  state = stepMarket(state, message("sim_old_unknown", 240_000), 240_000).state;
  assert.equal(
    state.traders.get("sim_old_unknown")?.coins,
    1000,
    "an earlier unknown-bot command still counts as prior observed chat",
  );
  state = stepMarket(state, message("sim_inside", 539_999, "buy", ["missing", "1"]), 539_999).state;
  assert.equal(state.traders.get("sim_inside")?.coins, 1500);
  state = stepMarket(
    state,
    message("sim_boundary", 540_000, "buy", ["missing", "1"]),
    540_000,
  ).state;
  assert.equal(state.traders.get("sim_boundary")?.coins, 1000);
  const capped = market(100, 1_000_000_000);
  const credit = stepMarket(capped, { ...follow, id: "cap-follow", at: 0 }, 0).effects.find(
    (effect) => effect.type === "persist",
  )?.credits[0];
  assert.equal(credit?.coins, 0);
});

test("B4 uses a real 5000-share fill and Halts require real sixty-second samples with five-minute suppression", () => {
  let state = market(100, 1_000_000);
  state = stepMarket(state, message("sim_whale", 0, "buy", ["X", "5000"]), 0).state;
  assert.equal(state.listings.get("X")?.price, 200);
  state = stepMarket(state, { type: "Tick" }, 30_000).state;
  assert.equal(state.listings.get("X")?.price, 150);
  assert.equal(state.listings.get("X")?.haltedUntil, 0, "no invented pre-IPO sample");
  state = market(100, 1_000_000);
  state = stepMarket(state, { type: "Tick" }, 60_000).state;
  const trigger = stepMarket(state, message("sim_whale", 60_000, "buy", ["X", "3000"]), 60_000);
  state = trigger.state;
  assert.equal(state.listings.get("X")?.haltedUntil, 90_000);
  assert.equal(
    trigger.effects
      .flatMap((effect) => (effect.type === "broadcast" ? effect.moments : []))
      .filter((moment) => moment.kind === "HALT").length,
    1,
  );
  const rejected = stepMarket(state, message("sim_other", 60_000, "buy", ["X", "1"]), 60_000);
  assert.match(
    rejected.effects.find((effect) => effect.type === "say")?.text ?? "",
    /halted.*30s/i,
  );
  assert.equal(rejected.effects.find((effect) => effect.type === "persist")?.trades.length, 0);
  const expired = stepMarket(state, message("sim_other", 90_000, "buy", ["X", "1.5"]), 90_000);
  assert.equal(
    expired.effects
      .find((effect) => effect.type === "persist")
      ?.listings.find((listing) => listing.emote.name === "X")?.haltedUntil,
    0,
    "even a rejected command persists an expired Halt row",
  );
  state = stepMarket(state, { type: "Tick" }, 90_000).state;
  state = stepMarket(state, message("sim_other", 90_000, "buy", ["X", "5000"]), 90_000).state;
  assert.equal(state.listings.get("X")?.lastHaltAt, 60_000);
  state = stepMarket(state, { type: "Tick" }, 359_999).state;
  assert.equal(state.listings.get("X")?.lastHaltAt, 60_000);
  state = stepMarket(state, { type: "Tick" }, 360_000).state;
  assert.equal(state.listings.get("X")?.lastHaltAt, 360_000);
});

test("Moon and Crash fire once per session, bells refresh references and close once with a SIM summary while offline trading stays open", () => {
  let state = initialMarketState({
    now: 0,
    catalog: ["A", "B", "C"].map(emote),
    seedListings: [
      {
        emote: emote("A"),
        ipoAt: 0,
        lastUseAt: 0,
        heat: 0,
        base: 250,
        impact: 0,
        sessionOpenPrice: 100,
      },
      {
        emote: emote("B"),
        ipoAt: 0,
        lastUseAt: 0,
        heat: 0,
        base: 40,
        impact: 0,
        sessionOpenPrice: 100,
      },
    ],
  });
  const first = stepMarket(state, { type: "Tick" }, 0);
  assert.deepEqual(
    first.effects.flatMap((effect) =>
      effect.type === "broadcast" ? effect.moments.map((moment) => moment.kind) : [],
    ),
    ["MOON", "CRASH"],
  );
  state = first.state;
  const repeated = stepMarket(state, { type: "Tick" }, 1000);
  assert.equal(
    repeated.effects.flatMap((effect) => (effect.type === "broadcast" ? effect.moments : []))
      .length,
    0,
  );
  const open = { type: "StreamOnline" as const, id: "open-1", at: 1000, origin: "sim" as const };
  state = stepMarket(repeated.state, open, 1000).state;
  assert.equal(state.listings.get("A")?.sessionOpenPrice, 250);
  assert.equal(state.listings.get("B")?.sessionOpenPrice, 40);
  assert.equal(state.listings.get("A")?.moonFired, false);
  for (const user of ["sim_ann", "sim_bob"]) {
    const input = message(user, 1000);
    input.parts = [{ type: "emote", text: "C", ...emote("C") }];
    state = stepMarket(state, input, 1000).state;
  }
  assert.equal(state.listings.get("C")?.sessionOpenPrice, 100);
  const close = { type: "StreamOffline" as const, id: "close-1", at: 1000, origin: "sim" as const };
  const closed = stepMarket(state, close, 1000);
  assert.equal(closed.state.session?.closedAt, 1000);
  assert.equal(closed.effects.filter((effect) => effect.type === "say").length, 1);
  assert.equal(closed.effects.find((effect) => effect.type === "say")?.origin, "sim");
  assert.match(
    closed.effects.find((effect) => effect.type === "say")?.text ?? "",
    /^Closing bell:/,
  );
  assert.equal(closed.state.session?.summary?.richest?.userId, "sim_ann");
  assert.equal(stepMarket(closed.state, close, 1000).effects.length, 0);
  assert.equal(
    stepMarket(closed.state, { ...close, id: "close-duplicate-state" }, 1000).effects.filter(
      (effect) => effect.type === "say",
    ).length,
    0,
  );
  const offlineBuy = stepMarket(closed.state, message("sim_ann", 1000, "buy", ["C", "1"]), 1000);
  assert.equal(offlineBuy.effects.find((effect) => effect.type === "persist")?.trades.length, 1);
});

test("confirmed Season reset clears portfolios and rule state atomically and duplicate reset delivery cannot erase new activity", () => {
  let state = market();
  state = stepMarket(state, message("sim_ann", 0, "buy", ["X", "1"]), 0).state;
  assert.throws(
    () =>
      stepMarket(
        state,
        { type: "Reset", id: "bad-reset", origin: "sim", confirmation: "reset" },
        1,
      ),
    /RESET/,
  );
  const reset = {
    type: "Reset" as const,
    id: "reset-1",
    origin: "sim" as const,
    confirmation: "RESET",
  };
  const result = stepMarket(state, reset, 1);
  assert.equal(result.state.traders.size, 0);
  assert.equal(result.state.holdings.size, 0);
  assert.equal(result.state.listings.size, 0);
  assert.equal(result.state.pending.size, 0);
  assert.equal(result.state.repeats.size, 0);
  assert.equal(result.state.cooldowns.size, 0);
  assert.equal(result.state.firstMessages.size, 0);
  assert.equal(result.state.participation.size, 0);
  assert.equal(result.state.feed.length, 0);
  assert.equal(result.effects.find((effect) => effect.type === "persist")?.reset, true);
  state = stepMarket(result.state, message("sim_new", 2), 2).state;
  assert.equal(stepMarket(state, reset, 2).state.traders.size, 1);
});

test("seeded mixed Trades bonuses Delists and resets preserve integer Coins and reconcile every applied ledger amount", () => {
  const coverage = new Set<string>();
  for (const seed of [42, 117, 2026, 98765]) {
    let rng = seed;
    const random = (limit: number) => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return Math.floor((rng / 2 ** 32) * limit);
    };
    let state = market(100, seed === 42 ? 1_000_000_000 : 1_000_000, ["A", "B"]);
    for (let i = 1; i <= 1000; i++) {
      const now = i * 5000;
      const user = `sim_${random(8)}`;
      const ticker = random(2) ? "A" : "B";
      const id = `sequence:${seed}:${i}`;
      let input: MarketInput;
      const action = random(16);
      if (action < 4)
        input = message(user, now, "buy", [ticker, random(2) ? "max" : `${random(100) + 1}`]);
      else if (action < 6)
        input = message(user, now, "sell", [ticker, random(2) ? "all" : `${random(100) + 1}`]);
      else if (action === 6)
        input = {
          type: "Follow",
          id,
          origin: "sim",
          at: now,
          user: { id: user, login: user, displayName: user },
        };
      else if (action === 7)
        input = {
          type: "Raid",
          id,
          origin: "sim",
          at: now,
          from: { id: "sim_raider", login: "sim_raider", displayName: "sim_raider" },
          viewers: 40,
        };
      else if (action === 8) input = { type: "Delist", id, origin: "sim", ticker };
      else if (action === 9) input = { type: "Pause", id, origin: "sim", value: !state.paused };
      else if (action === 10)
        input = {
          type: "Freeze",
          id,
          origin: "sim",
          userId: user,
          value: !state.traders.get(user)?.frozen,
        };
      else if (action === 11)
        input = { type: random(2) ? "StreamOnline" : "StreamOffline", id, origin: "sim", at: now };
      else if (action === 12 && i % 7 === 0)
        input = { type: "Reset", id, origin: "sim", confirmation: "RESET" };
      else {
        input = message(user, now);
        input.parts = [{ type: "emote", text: ticker, ...emote(ticker) }];
      }
      for (const event of [input, { type: "Tick" } as const]) {
        const previous = state;
        const result = stepMarket(state, event, now);
        state = result.state;
        const write = result.effects.find((effect) => effect.type === "persist");
        assert.ok(write);
        if (write.reset) coverage.add("reset");
        for (const row of write.trades) coverage.add(row.side);
        for (const row of write.credits) coverage.add(row.kind);
        for (const trader of state.traders.values()) {
          assert.ok(
            Number.isSafeInteger(trader.coins) &&
              trader.coins >= 0 &&
              trader.coins <= 1_000_000_000,
          );
          const credits: number = write.credits
            .filter((row) => row.userId === trader.id)
            .reduce((sum, row) => sum + row.coins, 0);
          const trades: number = write.trades
            .filter((row) => row.userId === trader.id)
            .reduce((sum, row) => sum + (row.side === "buy" ? -row.coins : row.coins), 0);
          assert.equal(
            trader.coins,
            (previous.traders.get(trader.id)?.coins ?? state.settings.STARTING_COINS) +
              credits +
              trades,
          );
        }
        for (const [userId, holdings] of state.holdings)
          for (const holding of holdings.values()) {
            assert.ok(state.traders.has(userId) && state.listings.has(holding.ticker));
            assert.ok(Number.isSafeInteger(holding.shares) && holding.shares > 0);
            assert.ok(Number.isSafeInteger(holding.costBasis) && holding.costBasis >= 0);
          }
        assert.ok(state.feed.length <= 5 && state.seenEvents.size <= 2000);
        assert.ok(
          [...state.participation.values()].every(
            (part) => part.minuteStart === Math.floor(now / 60_000) * 60_000,
          ),
        );
        for (const effect of result.effects)
          if (effect.type === "say") assert.equal(effect.origin, "sim");
        assert.equal(JSON.stringify(result.effects).includes("private chat text"), false);
        assert.notEqual(state, previous);
      }
      if (i % 20 === 0) assert.deepEqual(stepMarket(state, input, now), { state, effects: [] });
    }
  }
  for (const kind of ["buy", "sell", "follow", "visa", "stipend", "delist", "reset"])
    assert.ok(coverage.has(kind), `missing seeded coverage: ${kind}`);
});

test("automatic Delist pays holders atomically and a later IPO starts with fresh market rules", () => {
  let state = market(1.5, 1000, ["X"], { MAX_LISTINGS: 1, IMPACT_PER_100: 0 });
  state.catalog.set("Y", emote("Y"));
  for (const user of ["sim_ann", "sim_bob"])
    state = stepMarket(state, message(user, 0, "buy", ["X", "3"]), 0).state;
  const use = (user: string, ticker: string, now: number) => {
    const input = message(user, now);
    input.parts = [{ type: "emote", text: ticker, ...emote(ticker) }];
    return input;
  };
  state = stepMarket(state, use("sim_ann", "Y", 1_800_000), 1_800_000).state;
  const result = stepMarket(state, use("sim_bob", "Y", 1_800_000), 1_800_000);
  assert.deepEqual(
    result.effects
      .find((effect) => effect.type === "persist")
      ?.credits.map((credit) => [credit.kind, credit.coins]),
    [
      ["delist", 4],
      ["delist", 4],
    ],
  );
  assert.equal(result.state.holdings.size, 0);
  for (const trader of result.state.traders.values()) assert.equal(trader.coins, 998);
  assert.deepEqual([...result.state.listings.keys()], ["Y"]);
  state = stepMarket(
    result.state,
    { type: "Delist", id: "remove-y", origin: "sim", ticker: "Y" },
    1_800_001,
  ).state;
  state = stepMarket(state, use("sim_ann", "X", 1_800_001), 1_800_001).state;
  state = stepMarket(state, use("sim_bob", "X", 1_800_001), 1_800_001).state;
  const fresh = state.listings.get("X");
  assert.ok(fresh);
  assert.equal(fresh.price, 100);
  assert.equal(fresh.impact, 0);
  assert.equal(fresh.lastHaltAt, null);
  assert.equal(fresh.moonFired, false);
  assert.equal(fresh.crashFired, false);
  assert.equal(fresh.priceHistory.length, 1);
});

test("commands foreign chat and self echoes earn no Stipend; Pause still lets Prices move and summaries stay detached", () => {
  let state = market(100, 1000, ["X"], { QUIET_HEAT: 0.5 });
  for (const input of [
    message("sim_command", 0, "market"),
    { ...message("sim_foreign", 0), foreign: true },
    { ...message("sim_self", 0), selfSent: true },
  ])
    state = stepMarket(state, input, 0).state;
  const boundary = stepMarket(state, { type: "Tick" }, 60_000);
  assert.equal(boundary.state.traders.get("sim_command")?.coins, 1000);
  assert.equal(boundary.effects.find((effect) => effect.type === "persist")?.credits.length, 0);
  state = stepMarket(boundary.state, message("sim_ann", 60_000, "buy", ["X", "5"]), 60_000).state;
  state = stepMarket(
    state,
    { type: "Pause", id: "pause-prices", origin: "sim", value: true },
    60_000,
  ).state;
  const previousPrice = state.listings.get("X")?.price;
  state = stepMarket(state, { type: "Tick" }, 90_000).state;
  assert.ok((state.listings.get("X")?.price ?? 0) < (previousPrice ?? 0));
  const close = stepMarket(
    state,
    { type: "StreamOffline", id: "detached-close", origin: "sim", at: 90_000 },
    90_000,
  );
  const display = close.effects.find((effect) => effect.type === "broadcast")?.display;
  assert.ok(display?.session?.summary?.richest);
  display.session.summary.richest.netWorth = -1;
  assert.ok((close.state.session?.summary?.richest?.netWorth ?? -1) >= 0);
});

test("Raid Visa precedes its first Trade in the Feed and returned moments cannot mutate retained state", () => {
  let state = market();
  state = stepMarket(
    state,
    {
      type: "Raid",
      id: "ordered-raid",
      origin: "sim",
      at: 0,
      from: { id: "sim_raid", login: "sim_raid", displayName: "sim_raid" },
      viewers: 40,
    },
    0,
  ).state;
  const result = stepMarket(state, message("sim_first", 0, "buy", ["X", "1"]), 0);
  assert.deepEqual(
    result.state.feed.map((item) => item.kind),
    ["RAID", "VISA", "TRADE"],
  );
  const broadcast = result.effects.find((effect) => effect.type === "broadcast");
  assert.ok(broadcast);
  broadcast.moments[0].coins = -1;
  assert.equal(result.state.feed.find((item) => item.kind === "VISA")?.coins, 500);
});

test("a forty-percent Halt includes the exact cent boundary from 2.05 to 1.23", () => {
  const state = initialMarketState({
    now: 0,
    seedListings: [
      {
        emote: emote("X"),
        ipoAt: 0,
        lastUseAt: 0,
        base: 1.23,
        impact: 2 / 3,
        heat: 0,
        sessionOpenPrice: 2.05,
      },
    ],
  });
  assert.equal(state.listings.get("X")?.price, 2.05);
  const result = stepMarket(state, { type: "Tick" }, 240_000);
  assert.equal(result.state.listings.get("X")?.price, 1.23);
  assert.equal(result.state.listings.get("X")?.haltedUntil, 270_000);
});
