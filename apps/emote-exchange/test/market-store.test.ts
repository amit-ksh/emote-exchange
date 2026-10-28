import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openStore } from "@emote-exchange/twitch-kit";
import { stepMarket } from "../src/engine/market.ts";
import { marketProjection } from "../src/market-display.ts";
import { createMarketRepository, marketMigrations } from "../src/market-store.ts";
import { chat, emote } from "./market-fixture.ts";

test("schema 2 upgrades preserve Coins and Holdings without inventing a session baseline", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "exchange-e4-upgrade-"));
  const filename = join(directory, "market.sqlite");
  let store = openStore({ filename, migrations: marketMigrations });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  let repo = createMarketRepository(store);
  let state = repo.load(0, [emote("X")]);
  for (const input of [
    chat("sim_ann", 0, null, [], ["X"]),
    chat("sim_bob", 0, null, [], ["X"]),
    chat("sim_ann", 0, "buy", ["X", "1"]),
  ]) {
    const next = stepMarket(state, input, 0);
    repo.commit(next.state, next.effects);
    state = next.state;
  }
  // Recreate the previous on-disk schema around real persisted market rows.
  store.writeBatch([
    { sql: "ALTER TABLE traders DROP COLUMN session_open_worth" },
    { sql: "PRAGMA user_version=2" },
  ]);
  store.close();
  store = openStore({ filename, migrations: marketMigrations });
  repo = createMarketRepository(store);
  const restored = repo.load(0, [emote("X")]);
  assert.equal(restored.traders.get("sim_ann")?.coins, 899);
  assert.deepEqual(restored.holdings, state.holdings);
  assert.equal(restored.traders.get("sim_ann")?.sessionOpenWorth, null);
  assert.equal(marketProjection(restored).traders[0].sessionChangePercent, null);
  const opened = stepMarket(
    restored,
    { type: "StreamOnline", id: "upgrade-bell", origin: "sim", at: 0 },
    0,
  );
  repo.commit(opened.state, opened.effects);
  assert.equal(marketProjection(repo.load(0)).traders[0].sessionChangePercent, 0);
});

test("SQLite rows and checkpoint reopen equivalent and a failed event rolls back every durable change", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "exchange-e3-"));
  const filename = join(directory, "market.sqlite");
  let store = openStore({ filename, migrations: marketMigrations });
  t.after(() => {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  });
  let repo = createMarketRepository(store);
  let state = repo.load(0, [emote("X")]);
  for (const input of [
    chat("sim_ann", 0, null, [], ["X"]),
    chat("sim_bob", 0, null, [], ["X"]),
    chat("sim_ann", 0, "buy", ["X", "5"]),
  ]) {
    const result = stepMarket(state, input, 0);
    repo.commit(result.state, result.effects);
    state = result.state;
  }
  store.close();
  store = openStore({ filename, migrations: marketMigrations });
  repo = createMarketRepository(store);
  assert.deepEqual(repo.load(0, [emote("X")]), { ...state, feed: [] });
  const next = stepMarket(state, chat("sim_bob", 3000, "buy", ["X", "1"]), 3000);
  const write = next.effects.find((effect) => effect.type === "persist");
  assert.ok(write);
  write.traders.push({ ...write.traders[0], id: "invalid", coins: -1 });
  assert.throws(() => repo.commit(next.state, next.effects));
  assert.deepEqual(repo.load(0, [emote("X")]), { ...state, feed: [] });
  const reset = stepMarket(
    state,
    { type: "Reset", id: "reset", origin: "sim", confirmation: "RESET" },
    1,
  );
  repo.commit(reset.state, reset.effects);
  assert.equal(repo.load(1).traders.size, 0);
  assert.equal(repo.load(1).listings.size, 0);
});

test("Delist followed by a fresh IPO cannot restore candles from the old Listing", () => {
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  try {
    const repo = createMarketRepository(store);
    let state = repo.load(0, [emote("X")]);
    const apply = (input: Parameters<typeof stepMarket>[1], now: number) => {
      const next = stepMarket(state, input, now);
      repo.commit(next.state, next.effects);
      state = next.state;
    };
    apply(chat("sim_ann", 0, null, [], ["X"]), 0);
    apply(chat("sim_bob", 0, null, [], ["X"]), 0);
    apply({ type: "Tick" }, 60_000);
    assert.equal(state.listings.get("X")?.haltedUntil, 90_000);
    apply({ type: "Delist", id: "old-delisting", origin: "sim", ticker: "X" }, 90_000);
    apply(chat("sim_ann", 90_000, null, [], ["X"]), 90_000);
    apply(chat("sim_bob", 90_000, null, [], ["X"]), 90_000);
    const restored = repo.load(90_000, [emote("X")]);
    assert.deepEqual(restored.listings.get("X")?.candles, [
      { minuteStart: 60_000, open: 100, high: 100, low: 100, close: 100 },
    ]);
  } finally {
    store.close();
  }
});

test("opening Bell snapshots Trader Net Worth for session change and that baseline survives reopening", () => {
  const store = openStore({ filename: ":memory:", migrations: marketMigrations });
  try {
    const repo = createMarketRepository(store);
    let state = repo.load(0, [emote("X")]);
    const apply = (input: Parameters<typeof stepMarket>[1]) => {
      const result = stepMarket(state, input, 0);
      repo.commit(result.state, result.effects);
      state = result.state;
    };
    apply(chat("sim_ann", 0, null, [], ["X"]));
    apply(chat("sim_bob", 0, null, [], ["X"]));
    apply(chat("sim_ann", 0, "buy", ["X", "5"]));
    assert.equal(
      marketProjection(state).traders.find((trader) => trader.login === "sim_ann")
        ?.sessionChangePercent,
      -0.5,
    );
    apply({ type: "StreamOnline", id: "baseline-open", origin: "sim", at: 0 });
    assert.equal(
      marketProjection(repo.load(0)).traders.find((trader) => trader.login === "sim_ann")
        ?.sessionChangePercent,
      0,
    );
    apply({
      type: "Follow",
      id: "follow-after-open",
      origin: "sim",
      at: 0,
      user: { id: "sim_ann", login: "sim_ann", displayName: "sim_ann" },
    });
    assert.equal(
      marketProjection(repo.load(0)).traders.find((trader) => trader.login === "sim_ann")
        ?.sessionChangePercent,
      20.1,
    );
  } finally {
    store.close();
  }
});
