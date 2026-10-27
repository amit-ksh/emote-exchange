import assert from "node:assert/strict";
import test from "node:test";
import { createExchangeApp } from "../src/app.ts";

test("Exchange exposes an honest foundation-only display snapshot", async () => {
  const app = createExchangeApp();
  const response = await app.request("http://localhost:4100/api/snapshot", {
    headers: { Host: "localhost:4100" },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    v: 1,
    seq: 0,
    app: "Emote Exchange",
    mode: "demo",
    phase: "foundation",
    simulatorRunning: false,
    overlayUrl: "http://127.0.0.1:4100/overlay",
  });
});
