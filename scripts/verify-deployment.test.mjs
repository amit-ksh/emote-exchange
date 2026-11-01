import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { inspectDeployment, parseOrigin, renderReport } from "./verify-deployment.mjs";

const origin = "https://exchange.example";
function responses(change = {}) {
  return async (url, options) => {
    assert.equal(options.redirect, "manual");
    const path = new URL(url).pathname;
    if (change[path]) return change[path]();
    if (path === "/healthz") return Response.json({ ok: true });
    if (path === "/api/snapshot") {
      return Response.json({
        v: 1,
        app: "Emote Exchange",
        overlayUrl: `${origin}/overlay`,
        auth: { broadcaster: { connected: true } },
        eventsub: { status: "connected" },
      });
    }
    if (path === "/events") {
      return new Response("event: snapshot\ndata: {}\n\n", {
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    if (path === "/auth/login") {
      const destination = new URL("https://id.twitch.tv/oauth2/authorize");
      destination.searchParams.set("redirect_uri", `${origin}/auth/callback`);
      destination.searchParams.set("state", "PRIVATE_STATE_DO_NOT_PRINT");
      return new Response(null, { status: 302, headers: { Location: destination.href } });
    }
    return new Response("<!doctype html><title>Emote Exchange</title>", {
      headers: { "Content-Type": "text/html" },
    });
  };
}

test("deployment routes pass for a connected backend and OAuth state stays out of reports", async () => {
  const report = await inspectDeployment(origin, responses());
  assert.equal(report.routesReady, true);
  assert.equal(report.twitchReady, true);
  assert.equal(report.checks.length, 6);
  assert.ok(!renderReport(report).includes("PRIVATE_STATE"));
});

test("a frontend-only deployment reports each missing backend route", async () => {
  const missing = () => new Response("NOT_FOUND", { status: 404 });
  const report = await inspectDeployment(
    origin,
    responses({
      "/healthz": missing,
      "/api/snapshot": missing,
      "/events": missing,
      "/auth/login": missing,
      "/overlay": missing,
    }),
  );
  assert.equal(report.routesReady, false);
  assert.equal(report.checks.filter((c) => c.ok).length, 1);
  assert.equal(report.checks.filter((c) => c.status === 404).length, 5);
});

test("an HTML fallback cannot masquerade as health, snapshot, SSE or OAuth", async () => {
  const report = await inspectDeployment(
    origin,
    async () =>
      new Response("<html>SPA</html>", {
        headers: { "Content-Type": "text/html" },
      }),
  );
  assert.equal(report.routesReady, false);
  assert.deepEqual(
    report.checks.filter((c) => c.ok).map((c) => c.route),
    ["/", "/overlay"],
  );
});

test("wrong snapshot identity, loopback overlay and incorrect callback fail verification", async () => {
  for (const snapshot of [
    { v: 1, app: "Other", overlayUrl: `${origin}/overlay` },
    { v: 1, app: "Emote Exchange", overlayUrl: "https://127.0.0.1/overlay" },
  ]) {
    const report = await inspectDeployment(
      origin,
      responses({
        "/api/snapshot": () => Response.json(snapshot),
        "/auth/login": () =>
          new Response(null, {
            status: 302,
            headers: {
              Location: "https://id.twitch.tv/oauth2/authorize?redirect_uri=https://wrong.example",
            },
          }),
      }),
    );
    assert.equal(report.checks.find((c) => c.route === "/api/snapshot").ok, false);
    assert.equal(report.checks.find((c) => c.route.startsWith("/auth/login")).ok, false);
  }
});

test("route readiness is distinct from a connected Twitch account", async () => {
  const report = await inspectDeployment(
    origin,
    responses({
      "/api/snapshot": () =>
        Response.json({
          v: 1,
          app: "Emote Exchange",
          overlayUrl: `${origin}/overlay`,
          auth: { broadcaster: { connected: false } },
          eventsub: { status: "disconnected" },
        }),
    }),
  );
  assert.equal(report.routesReady, true);
  assert.equal(report.twitchReady, false);
});

test("network and malformed JSON errors produce fixed messages with no provider details", async () => {
  const report = await inspectDeployment(
    origin,
    responses({
      "/healthz": () => {
        throw new Error("PRIVATE_TOKEN");
      },
      "/api/snapshot": () =>
        new Response("PRIVATE_TOKEN", { headers: { "Content-Type": "application/json" } }),
    }),
  );
  assert.equal(report.routesReady, false);
  assert.ok(!renderReport(report).includes("PRIVATE_TOKEN"));
});

test("deployment origins reject credentials, paths, query strings and insecure public HTTP", () => {
  assert.equal(parseOrigin("http://127.0.0.1:4100"), "http://127.0.0.1:4100");
  assert.equal(parseOrigin(origin), origin);
  for (const invalid of [
    "--unknown",
    "https://user:secret@example.com",
    `${origin}/foo`,
    `${origin}?token=private`,
    `${origin}#fragment`,
    "http://exchange.example",
  ]) {
    assert.throws(() => parseOrigin(invalid));
  }
});

test("the existing local localhost and 127.0.0.1 overlay aliases remain valid", async () => {
  const local = "http://localhost:4100";
  const report = await inspectDeployment(
    local,
    responses({
      "/api/snapshot": () =>
        Response.json({
          v: 1,
          app: "Emote Exchange",
          overlayUrl: "http://127.0.0.1:4100/overlay",
          auth: { broadcaster: { connected: true } },
          eventsub: { status: "connected" },
        }),
      "/auth/login": () =>
        new Response(null, {
          status: 302,
          headers: {
            Location: `https://id.twitch.tv/oauth2/authorize?redirect_uri=${encodeURIComponent(`${local}/auth/callback`)}`,
          },
        }),
    }),
  );
  assert.equal(report.routesReady, true);
});

test("CLI help succeeds and unknown flags fail with usage before any requests", () => {
  const script = fileURLToPath(new URL("./verify-deployment.mjs", import.meta.url));
  const help = spawnSync(process.execPath, [script, "--help"], {
    encoding: "utf8",
  });
  assert.equal(help.status, 0);
  const invalid = spawnSync(process.execPath, [script, "--unknown"], { encoding: "utf8" });
  assert.equal(invalid.status, 2);
  assert.ok(invalid.stdout.includes("usage:"));
  assert.equal(invalid.stderr, "");
});

test("owner-protected hosted routes verify public OBS delivery without claiming private Twitch status", async () => {
  const base = responses();
  const report = await inspectDeployment(origin, async (url, options) => {
    const parsed = new URL(url);
    if (["/api/snapshot", "/events"].includes(parsed.pathname)) {
      if (parsed.searchParams.get("client") !== "overlay")
        return Response.json({ error: "Sign in" }, { status: 401 });
      if (parsed.pathname === "/api/snapshot")
        return Response.json({
          v: 1,
          seq: 0,
          app: "Emote Exchange",
          simulatorRunning: false,
          market: { listings: [], traders: [] },
          moments: [],
        });
    }
    return base(url, options);
  });
  assert.equal(report.routesReady, true);
  assert.equal(report.dashboardProtected, true);
  assert.equal(report.twitchReady, false);
  assert.match(renderReport(report), /owner sign-in/i);
});
