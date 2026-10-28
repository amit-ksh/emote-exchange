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
  });
});

test("configuration accepts a different port and its exact loopback origin", () => {
  assert.deepEqual(readConfig({ PORT: "4111", PUBLIC_ORIGIN: "http://127.0.0.1:4111" }), {
    port: 4111,
    publicOrigin: "http://127.0.0.1:4111",
    dataDir: resolve(appDirectory, "data"),
  });
  assert.equal(readConfig({ PORT: "4111" }).publicOrigin, "http://localhost:4111");
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
