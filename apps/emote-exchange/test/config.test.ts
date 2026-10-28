import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readConfig } from "../src/config.ts";

const appDirectory = fileURLToPath(new URL("../", import.meta.url));

test("configuration defaults to the documented local origin", () => {
  assert.deepEqual(readConfig({}), {
    port: 4100,
    publicOrigin: "http://localhost:4100",
    dataDir: resolve(appDirectory, "data"),
    wsUrl: "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30",
    subscriptionsUrl: "https://api.twitch.tv/helix/eventsub/subscriptions",
  });
});

test("configuration accepts a different port and its exact loopback origin", () => {
  assert.deepEqual(readConfig({ PORT: "4111", PUBLIC_ORIGIN: "http://127.0.0.1:4111" }), {
    port: 4111,
    publicOrigin: "http://127.0.0.1:4111",
    dataDir: resolve(appDirectory, "data"),
    wsUrl: "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30",
    subscriptionsUrl: "https://api.twitch.tv/helix/eventsub/subscriptions",
  });
  assert.equal(readConfig({ PORT: "4111" }).publicOrigin, "http://localhost:4111");
});

test("EventSub config accepts loopback mocks, preserves query parameters and rejects credential destinations", () => {
  const config = readConfig({
    EVENTSUB_WS_URL: "ws://127.0.0.1:8080/ws?mock=yes",
    EVENTSUB_SUBSCRIPTIONS_URL: "http://127.0.0.1:8080/eventsub/subscriptions",
  });
  assert.equal(config.wsUrl, "ws://127.0.0.1:8080/ws?mock=yes&keepalive_timeout_seconds=30");
  for (const value of [
    "https://evil.example/subscriptions",
    "http://127.0.0.1.evil.example/",
    "https://api.twitch.tv/evil",
    "http://user:pass@localhost:8080/subscriptions",
  ])
    assert.throws(
      () => readConfig({ EVENTSUB_SUBSCRIPTIONS_URL: value }),
      /EVENTSUB_SUBSCRIPTIONS_URL/,
    );
  assert.throws(() => readConfig({ EVENTSUB_WS_URL: "ws://evil.example/ws" }), /EVENTSUB_WS_URL/);
});

test("relative DATA_DIR is resolved against the app directory", () => {
  assert.equal(
    readConfig({ DATA_DIR: "./custom-data" }).dataDir,
    resolve(appDirectory, "custom-data"),
  );
  assert.throws(() => readConfig({ DATA_DIR: "" }), /DATA_DIR/);
  assert.throws(() => readConfig({ DATA_DIR: "bad\0path" }), /DATA_DIR/);
});

test("configuration rejects invalid ports and nonlocal or mismatched public origins", () => {
  for (const value of ["", "0", "65536", "-1", "4100.5", "1e3", "4100junk"]) {
    assert.throws(() => readConfig({ PORT: value }), /PORT/);
  }
  for (const value of [
    "https://localhost:4100",
    "http://example.com:4100",
    "http://localhost:4111",
    "http://localhost:4100/overlay",
    "http://localhost:4100?code=secret",
    "http://user:password@localhost:4100",
  ]) {
    assert.throws(() => readConfig({ PUBLIC_ORIGIN: value }), /PUBLIC_ORIGIN/);
  }
});
