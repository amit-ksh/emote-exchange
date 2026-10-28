import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

// Exercise the built app with its actual Node entrypoint and workspace imports.
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const address = reservation.address();
assert.ok(address && typeof address !== "string");
const port = address.port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const dataDir = mkdtempSync(join(tmpdir(), "emote-exchange-smoke-"));
const child = spawn(process.execPath, ["src/server.ts"], {
  cwd: fileURLToPath(new URL("../apps/emote-exchange/", import.meta.url)),
  env: {
    ...process.env,
    PORT: String(port),
    PUBLIC_ORIGIN: origin,
    DATA_DIR: dataDir,
    NODE_ENV: "production",
  },
  stdio: "ignore",
});
let spawnError;
child.on("error", (error) => {
  spawnError = error;
});

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (spawnError) throw spawnError;
    if (child.exitCode !== null) throw new Error("Production server exited before becoming ready.");
    try {
      const health = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(500) });
      assert.deepEqual(await health.json(), { ok: true });
      ready = true;
      break;
    } catch {
      await delay(100);
    }
  }
  assert.ok(ready, "Production server must become ready within 10 seconds.");

  for (const route of ["/", "/overlay"]) {
    const response = await fetch(`${origin}${route}`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    const html = await response.text();
    const asset = html.match(/src="(\/assets\/[^"]+\.js)"/);
    assert.ok(asset, `${route} must serve the built client entrypoint.`);
    assert.equal((await fetch(`${origin}${asset[1]}`)).status, 200);
  }

  const response = await fetch(`${origin}/api/snapshot`);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    v: 1,
    seq: 0,
    app: "Emote Exchange",
    mode: "demo",
    phase: "foundation",
    simulatorRunning: false,
    overlayUrl: `${origin}/overlay`,
    connectionChecks: 0,
    moments: [],
  });
  // Fetch normalizes Host and paths; use raw HTTP for malformed-request checks.
  function rawStatus(path, host) {
    return new Promise((resolve, reject) => {
      const outgoing = request(
        { hostname: "127.0.0.1", port, path, headers: { Host: host } },
        (incoming) => {
          incoming.resume();
          resolve(incoming.statusCode);
        },
      );
      outgoing.setTimeout(5000, () => outgoing.destroy(new Error("HTTP guard check timed out.")));
      outgoing.on("error", reject);
      outgoing.end();
    });
  }
  assert.equal(await rawStatus("/healthz", "attacker.invalid"), 403);
  assert.equal(await rawStatus("http://[", `127.0.0.1:${port}`), 400);
  assert.equal(
    (await fetch(`${origin}/healthz`)).status,
    200,
    "Malformed requests must not crash the app.",
  );
  assert.equal((await fetch(`${origin}/api/missing`, { method: "POST" })).status, 403);

  const controller = new AbortController();
  try {
    const events = await fetch(`${origin}/events`, { signal: controller.signal });
    assert.match(events.headers.get("content-type") ?? "", /text\/event-stream/);
    const reader = events.body.getReader();
    const initial = await reader.read();
    assert.match(new TextDecoder().decode(initial.value), /event: snapshot\ndata:/);
    const checked = await fetch(`${origin}/api/setup/check`, {
      method: "POST",
      headers: { Origin: origin, "X-CTA": "1" },
    });
    assert.equal(checked.status, 200);
    let delta = "";
    const deadline = setTimeout(() => controller.abort(), 5000);
    try {
      while (!delta.includes("event: delta")) {
        const next = await reader.read();
        assert.equal(next.done, false);
        delta += new TextDecoder().decode(next.value);
      }
      assert.match(delta, /"connectionChecks":1/);
      assert.match(delta, /"seq":1/);
    } finally {
      clearTimeout(deadline);
    }
    await reader.cancel();
  } finally {
    controller.abort();
  }
  console.log(
    "Production smoke passed: dashboard, overlay, assets, persisted action, SSE deltas and guards.",
  );
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await Promise.race([exited, delay(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  rmSync(dataDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
