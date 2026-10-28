import assert from "node:assert/strict";
import test from "node:test";
import { stepMarket } from "../src/engine/market.ts";
import { marketProjection } from "../src/market-display.ts";
import { chat, market } from "./market-fixture.ts";

test("public Trader order uses exact Net Worth before display capping and ID for real ties", () => {
  let state = market();
  for (const id of ["sim_a", "sim_z", "sim_c", "sim_b"])
    state = stepMarket(state, chat(id, 0, "portfolio"), 0).state;
  const listing = state.listings.get("X");
  assert.ok(listing);
  listing.price = 2_000_000_000;
  for (const [id, shares] of [
    ["sim_a", 5_000_000],
    ["sim_z", 6_000_000],
    ["sim_c", 1],
    ["sim_b", 1],
  ] as const) {
    state.holdings.set(
      id,
      new Map([["X", { userId: id, ticker: "X", shares, costBasis: shares }]]),
    );
  }
  const traders = marketProjection(state).traders;
  assert.deepEqual(
    traders.map((row) => row.userId),
    ["sim_z", "sim_a", "sim_b", "sim_c"],
  );
  assert.equal(traders[0].netWorth, Number.MAX_SAFE_INTEGER);
  assert.equal(traders[1].netWorth, Number.MAX_SAFE_INTEGER);
  assert.equal(traders[0].capped, true);
  assert.equal(traders[1].capped, true);
  assert.equal(
    JSON.stringify(traders).includes("12000000000001000"),
    false,
    "exact bigint worth is not added to the public payload",
  );
});
