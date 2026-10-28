import assert from "node:assert/strict";
import test from "node:test";
import { stepMarket } from "../src/engine/market.ts";
import { chat, market } from "./market-fixture.ts";

test("viewer commands return Portfolio aliases top and market guidance without retaining raw arguments", () => {
  let state = market();
  state = stepMarket(state, chat("sim_ann", 0, "buy", ["X", "5"]), 0).state;
  for (const command of ["portfolio", "pf"]) {
    const result = stepMarket(state, chat("sim_ann", 0, command), 0);
    assert.match(
      result.effects.find((effect) => effect.type === "say")?.text ?? "",
      /495 Coins.*X x5.*net worth 995/,
    );
  }
  const top = stepMarket(state, chat("sim_ann", 0, "top"), 0);
  assert.match(top.effects.find((effect) => effect.type === "say")?.text ?? "", /sim_ann/);
  assert.ok(
    top.effects.some(
      (effect) =>
        effect.type === "broadcast" && effect.moments.some((moment) => moment.kind === "TOP"),
    ),
  );
  assert.match(
    stepMarket(state, chat("sim_ann", 0, "market"), 0).effects.find(
      (effect) => effect.type === "say",
    )?.text ?? "",
    /!buy.*X/,
  );
  const unknown = stepMarket(state, chat("sim_ann", 0, "otherbot", ["private argument"]), 0);
  assert.equal(unknown.effects.filter((effect) => effect.type === "say").length, 0);
});

test("moderation commands require broadcaster or Mod badges and preserve settlement for denied callers", () => {
  let state = market();
  state = stepMarket(state, chat("sim_ann", 0, "buy", ["X", "5"]), 0).state;
  const commands = [
    ["market", ["pause"]],
    ["delist", ["X"]],
    ["freeze", ["@sim_ann"]],
    ["unfreeze", ["@sim_ann"]],
  ] as const;
  for (const [name, args] of commands) {
    const input = chat("sim_viewer", 0, name, [...args]);
    input.chatter.isVip = true;
    input.chatter.isSubscriber = true;
    const denied = stepMarket(state, input, 0);
    assert.equal(denied.state.paused, false);
    assert.equal(denied.state.traders.get("sim_ann")?.frozen, false);
    assert.equal(denied.state.listings.size, 1);
    assert.equal(denied.state.traders.get("sim_ann")?.coins, 495);
    assert.match(
      denied.effects.find((effect) => effect.type === "say")?.text ?? "",
      /Mod|broadcaster/,
    );
  }
  const mod = (name: string, args: string[]) => {
    const input = chat("sim_mod", 0, name, args);
    input.chatter.isMod = true;
    const result = stepMarket(state, input, 0);
    state = result.state;
    return result;
  };
  mod("market", ["pause"]);
  assert.equal(state.paused, true);
  mod("market", ["resume"]);
  assert.equal(state.paused, false);
  mod("freeze", ["@SIM_ANN"]);
  assert.equal(state.traders.get("sim_ann")?.frozen, true);
  mod("unfreeze", ["@sim_ann"]);
  assert.equal(state.traders.get("sim_ann")?.frozen, false);
  const input = chat("sim_broadcaster", 0, "delist", ["x"]);
  input.chatter.isBroadcaster = true;
  const removed = stepMarket(state, input, 0);
  assert.equal(removed.state.listings.size, 0);
  assert.equal(removed.state.holdings.size, 0);
  assert.equal(removed.effects.filter((effect) => effect.type === "say").length, 1);
});
