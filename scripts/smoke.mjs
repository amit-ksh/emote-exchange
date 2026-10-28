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
    TWITCH_CLIENT_ID: "",
    TWITCH_CLIENT_SECRET: "",
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
  const { catalog, seq, simulator, ...snapshot } = await response.json();
  assert.equal(simulator.running, false);
  assert.equal(simulator.scenarios.length, 7);
  assert.ok((await (await fetch(`${origin}/setup-guide`)).text()).includes("Twitch"));
  assert.ok(Number.isSafeInteger(seq) && seq >= 0);
  assert.equal(catalog.ready, true);
  assert.equal(catalog.demoCount, 24);
  assert.ok(catalog.total >= 24);
  for (const emote of catalog.examples.filter((entry) => entry.provider === "demo"))
    assert.equal((await fetch(`${origin}${emote.imageUrl}`)).status, 200);
  assert.deepEqual(snapshot, {
    v: 1,
    app: "Emote Exchange",
    mode: "demo",
    phase: "foundation",
    simulatorRunning: false,
    overlayUrl: `${origin}/overlay`,
    connectionChecks: 0,
    moments: [],
    chatOut: { quiet: false, pending: 0, sending: false, sender: null, logs: [] },
    eventsub: {
      status: "disconnected",
      sessionStartedAt: null,
      lastEventAt: null,
      eventCount: 0,
      chatMessageCount: 0,
      issue: null,
      subscriptions: [
        "channel.chat.message",
        "channel.follow",
        "channel.raid",
        "stream.online",
        "stream.offline",
      ].map((type) => ({ type, status: "disconnected", httpStatus: null })),
    },
    auth: {
      configured: false,
      broadcaster: { connected: false, login: null, scopes: [], reconnect: false },
      bot: { connected: false, login: null, scopes: [], reconnect: false },
    },
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
      while (!delta.includes('"connectionChecks":1')) {
        const next = await reader.read();
        assert.equal(next.done, false);
        delta += new TextDecoder().decode(next.value);
      }
      assert.match(delta, /"connectionChecks":1/);
      assert.ok([...delta.matchAll(/"seq":(\d+)/g)].some((match) => Number(match[1]) > seq));
    } finally {
      clearTimeout(deadline);
    }
    await reader.cancel();
  } finally {
    controller.abort();
  }
  const action = (path, body) =>
    fetch(`${origin}/api/sim/${path}`, {
      method: "POST",
      headers: { Origin: origin, "X-CTA": "1", "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  assert.equal(
    (
      await action("start", {
        seed: 42,
        scenario: "opening-day",
        rate: 4,
        chatters: 12,
        mix: { plain: 65, emote: 30, follow: 4, raid: 1 },
      })
    ).status,
    200,
  );
  const simDeadline = Date.now() + 5000;
  let demo;
  do {
    demo = await (await fetch(`${origin}/api/snapshot`)).json();
    if (demo.simulator.chatMessageCount >= 2) break;
    await delay(100);
  } while (Date.now() < simDeadline);
  assert.ok(demo.simulator.chatMessageCount >= 2);
  assert.equal(demo.simulatorRunning, true);
  assert.equal(demo.mode, "demo");
  for (const type of ["follow", "raid", "offline"])
    assert.equal((await action("event", { type, viewers: 40 })).status, 200);
  const preview = await (await fetch(`${origin}/api/snapshot`)).json();
  assert.ok(preview.chatOut.logs.length >= 4);
  assert.ok(
    preview.chatOut.logs.every(
      (entry) => entry.kind === "would-have-said" && entry.origin === "sim",
    ),
  );
  assert.equal((await action("stop")).status, 200);
  assert.equal((await (await fetch(`${origin}/api/snapshot`)).json()).simulatorRunning, false);
  console.log(
    "Production smoke passed: dashboard, overlay, demo assets, simulator counters/previews, persisted action, SSE and guards.",
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
