import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createExchangeRuntime } from "../src/app.ts";
import { chat } from "./market-fixture.ts";

test("dashboard settings are guarded, validated, durable and apply to future Traders without restarting", async (t) => {
  const runtime = createExchangeRuntime({ now: () => 0, marketAutoTick: false });
  t.after(() => runtime.close());
  const headers = {
    Host: "localhost:4100",
    Origin: "http://localhost:4100",
    "X-CTA": "1",
    "Content-Type": "application/json",
  };
  const post = (body: unknown, extra = headers) =>
    runtime.app.request("http://localhost:4100/api/market/settings", {
      method: "POST",
      headers: extra,
      body: JSON.stringify(body),
    });
  assert.equal((await post({ STARTING_COINS: 2000 }, { ...headers, Origin: "" })).status, 403);
  assert.equal((await post({ STARTING_COINS: 2000 }, { ...headers, "X-CTA": "" })).status, 403);
  assert.equal((await post({ STARTING_COINS: -1 })).status, 400);
  assert.equal((await post({ FEE: 0.123 })).status, 400);
  assert.equal((await post({ STARTING_COINS: 2000 })).status, 200);
  runtime.receiveEvent(chat("sim_new", 0));
  const packet = await (
    await runtime.app.request("http://localhost:4100/api/snapshot", { headers })
  ).json();
  assert.equal(packet.market.traders[0].coins, 2000);
  assert.equal((await post({ reset: true })).status, 200);
  runtime.receiveEvent(chat("sim_default", 0));
  const next = await (
    await runtime.app.request("http://localhost:4100/api/snapshot", { headers })
  ).json();
  assert.equal(
    next.market.traders.find((row: { userId: string }) => row.userId === "sim_default").coins,
    1000,
  );
});

test("dashboard actions freeze, pause, settle a Delist and require RESET without exports", async (t) => {
  const runtime = createExchangeRuntime({ now: () => 0, marketAutoTick: false });
  t.after(() => runtime.close());
  const headers = {
    Host: "localhost:4100",
    Origin: "http://localhost:4100",
    "X-CTA": "1",
    "Content-Type": "application/json",
  };
  const action = (body: unknown) =>
    runtime.app.request("http://localhost:4100/api/market/action", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  for (const missing of ["Origin", "X-CTA"]) {
    const response = await runtime.app.request("http://localhost:4100/api/market/action", {
      method: "POST",
      headers: { ...headers, [missing]: "" },
      body: JSON.stringify({ type: "Reset", confirmation: "RESET" }),
    });
    assert.equal(response.status, 403);
    assert.equal(response.headers.has("Access-Control-Allow-Origin"), false);
  }
  const snapshot = async () =>
    (await (await runtime.app.request("http://localhost:4100/api/snapshot", { headers })).json())
      .market;
  runtime.receiveEvent(chat("sim_ann", 0, null, [], ["DemoBull"]));
  runtime.receiveEvent(chat("sim_bob", 0, null, [], ["DemoBull"]));
  runtime.receiveEvent(chat("sim_ann", 0, "buy", ["DemoBull", "5"]));
  assert.equal((await action({ type: "Freeze", userId: "sim_ann", value: true })).status, 200);
  assert.equal(
    (await snapshot()).traders.find((row: { userId: string }) => row.userId === "sim_ann").frozen,
    true,
  );
  assert.equal((await action({ type: "Pause", value: true })).status, 200);
  assert.equal((await snapshot()).paused, true);
  assert.equal((await action({ type: "Pause", value: "false" })).status, 400);
  assert.equal((await action({ type: "Delist", ticker: "DemoBull" })).status, 200);
  const after = await snapshot();
  assert.equal(after.listings.length, 0);
  assert.equal(
    after.traders.find((row: { userId: string }) => row.userId === "sim_ann").holdings.length,
    0,
  );
  assert.equal((await action({ type: "Reset", confirmation: "reset" })).status, 400);
  assert.equal((await action({ type: "Reset", confirmation: "RESET" })).status, 200);
  assert.equal((await snapshot()).traderCount, 0);
});

test("dashboard settings survive a process restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "exchange-e5-"));
  const options = {
    filename: join(directory, "market.sqlite"),
    now: () => 0,
    marketAutoTick: false,
  };
  let runtime = createExchangeRuntime(options);
  try {
    const headers = {
      Host: "localhost:4100",
      Origin: "http://localhost:4100",
      "X-CTA": "1",
      "Content-Type": "application/json",
    };
    assert.equal(
      (
        await runtime.app.request("http://localhost:4100/api/market/settings", {
          method: "POST",
          headers,
          body: JSON.stringify({ STARTING_COINS: 4321 }),
        })
      ).status,
      200,
    );
    runtime.close();
    runtime = createExchangeRuntime(options);
    runtime.receiveEvent(chat("sim_restart", 0));
    const packet = await (
      await runtime.app.request("http://localhost:4100/api/snapshot", { headers })
    ).json();
    assert.equal(packet.market.traders[0].coins, 4321);
  } finally {
    runtime.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
