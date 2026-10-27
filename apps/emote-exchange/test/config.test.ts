import assert from "node:assert/strict";
import test from "node:test";
import { readConfig } from "../src/config.ts";

test("configuration defaults to the documented local origin", () => {
  assert.deepEqual(readConfig({}), {
    port: 4100,
    publicOrigin: "http://localhost:4100",
  });
});

test("configuration accepts a different port and its exact loopback origin", () => {
  assert.deepEqual(readConfig({ PORT: "4111", PUBLIC_ORIGIN: "http://127.0.0.1:4111" }), {
    port: 4111,
    publicOrigin: "http://127.0.0.1:4111",
  });
  assert.equal(readConfig({ PORT: "4111" }).publicOrigin, "http://localhost:4111");
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
