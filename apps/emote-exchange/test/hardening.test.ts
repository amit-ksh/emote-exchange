import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createExchangeRuntime } from "../src/app.ts";

const origin = "http://localhost:4100";
const host = { Host: "localhost:4100" };
const actionHeaders = { ...host, Origin: origin, "X-CTA": "1", "Content-Type": "application/json" };
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("every mounted mutation rejects missing/foreign Origin and missing/wrong X-CTA before changing state", async (t) => {
  const runtime = createExchangeRuntime({ marketAutoTick: false });
  t.after(() => runtime.close());
  // Read the mounted HTTP surface, so a newly added action cannot silently miss this gate.
  const routes = runtime.app.routes.filter((route) => route.method === "POST");
  assert.equal(routes.length, 12);
  const before = await (
    await runtime.app.request(`${origin}/api/snapshot`, { headers: host })
  ).json();
  for (const route of routes) {
    for (const headers of [
      { ...host, "X-CTA": "1" },
      { ...host, Origin: "http://attacker.invalid", "X-CTA": "1" },
      { ...host, Origin: "null", "X-CTA": "1" },
      { ...host, Origin: origin },
      { ...host, Origin: origin, "X-CTA": "0" },
    ]) {
      const response = await runtime.app.request(`${origin}${route.path}`, {
        method: "POST",
        headers,
        body: "{}",
      });
      assert.equal(response.status, 403, route.path);
      assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
    }
  }
  const after = await (
    await runtime.app.request(`${origin}/api/snapshot`, { headers: host })
  ).json();
  assert.deepEqual(after, before);
});

test("a 60-second Twitch transport outage leaves demo controls usable, reconnects once, dedupes and keeps private input server-side", async (t) => {
  t.mock.timers.enable({ apis: ["setInterval"] });
  let now = Date.parse("2026-10-29T00:00:00Z");
  let offline = false;
  const sockets: Socket[] = [];
  const subscriptions: string[] = [];
  const sends: unknown[] = [];
  const logs: string[] = [];
  const privateText = "H4_PRIVATE_GREETING_WORDS_never_project";
  const secrets = [
    "H4_PRIVATE_CLIENT_SECRET",
    "H4_PRIVATE_ACCESS_TOKEN",
    "H4_PRIVATE_REFRESH_TOKEN",
  ];
  class Socket extends EventTarget {
    closed = false;
    constructor() {
      super();
      if (offline) throw new Error("H4_PRIVATE_NETWORK_ERROR");
      sockets.push(this);
    }
    close() {
      this.closed = true;
    }
    receive(frame: unknown) {
      this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(frame) }));
    }
  }
  const WebSocketTransport = globalThis.WebSocket;
  globalThis.WebSocket = Socket as unknown as typeof WebSocket;
  t.after(() => {
    globalThis.WebSocket = WebSocketTransport;
  });
  t.mock.method(console, "info", (...values: unknown[]) => logs.push(values.join(" ")));
  t.mock.method(console, "error", (...values: unknown[]) => logs.push(values.join(" ")));
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/oauth2/token"))
      return Response.json({ access_token: secrets[1], refresh_token: secrets[2] });
    if (url.endsWith("/oauth2/validate"))
      return Response.json({
        client_id: "h4-client",
        user_id: "100",
        login: "streamer",
        scopes: ["user:read:chat", "user:write:chat", "moderator:read:followers"],
        expires_in: 7200,
      });
    if (url.includes("/eventsub/subscriptions")) {
      const body = JSON.parse(String(init?.body));
      subscriptions.push(`${body.transport.session_id}:${body.type}`);
      return Response.json({ data: [{ status: "enabled" }] }, { status: 202 });
    }
    if (url.endsWith("/chat/messages")) sends.push(init?.body);
    return Response.json({ data: [] });
  });
  const runtime = createExchangeRuntime({
    now: () => now,
    clientId: "h4-client",
    clientSecret: secrets[0],
  });
  t.after(() => runtime.close());
  const login = await runtime.app.request(`${origin}/auth/login`, { headers: host });
  const location = login.headers.get("Location");
  const cookie = login.headers.get("Set-Cookie")?.split(";")[0];
  assert.ok(location && cookie);
  const state = new URL(location).searchParams.get("state");
  const callback = await runtime.app.request(
    `${origin}/auth/callback?code=h4-code&state=${state}`,
    {
      headers: { ...host, Cookie: cookie },
    },
  );
  assert.equal(callback.headers.get("Location"), "/?auth=connected");
  const snapshot = async () =>
    (await runtime.app.request(`${origin}/api/snapshot`, { headers: host })).json();
  const post = (path: string, body: unknown) =>
    runtime.app.request(`${origin}/api/${path}`, {
      method: "POST",
      headers: actionHeaders,
      body: JSON.stringify(body),
    });
  const welcome = (socket: Socket, session: string) =>
    socket.receive({
      metadata: {
        message_id: `welcome-${session}`,
        message_type: "session_welcome",
        message_timestamp: new Date(now).toISOString(),
      },
      payload: { session: { id: session, keepalive_timeout_seconds: 30 } },
    });
  welcome(sockets[0], "before-gap");
  await settle();
  assert.equal((await snapshot()).eventsub.status, "connected");
  assert.equal(subscriptions.length, 5);
  assert.equal(
    (
      await post("sim/start", {
        seed: 42,
        scenario: "opening-day",
        rate: 4,
        chatters: 12,
        mix: { plain: 65, emote: 30, follow: 4, raid: 1 },
      })
    ).status,
    200,
  );
  const frame = JSON.parse(
    readFileSync(
      new URL("../../../packages/twitch-kit/test/fixtures/eventsub.json", import.meta.url),
      "utf8",
    ),
  );
  frame.payload.event.message = {
    text: privateText,
    fragments: [{ type: "text", text: privateText }],
  };
  sockets[0].receive(frame);
  const count = (await snapshot()).eventsub.eventCount;
  offline = true;
  sockets[0].dispatchEvent(new Event("error"));
  assert.equal((await snapshot()).eventsub.status, "lost");
  assert.equal((await snapshot()).eventsub.streamStatus, "unknown");
  for (let second = 1; second <= 60; second++) {
    now += 1000;
    t.mock.timers.tick(1000);
    await settle();
    if (second === 30) {
      for (const type of ["follow", "raid", "offline", "online"])
        assert.equal((await post("sim/event", { type, viewers: 40 })).status, 200);
    }
  }
  const during = await snapshot();
  assert.equal(during.eventsub.status, "lost");
  assert.equal(during.simulator.chatMessageCount, 240);
  assert.ok(during.market.listings.length >= 4);
  assert.ok(during.market.traders.some((row: { holdings: unknown[] }) => row.holdings.length));
  assert.equal((await post("sim/stop", {})).status, 200);
  offline = false;
  for (let second = 0; sockets.length === 1 && second < 31; second++) {
    now += 1000;
    t.mock.timers.tick(1000);
    await settle();
  }
  assert.equal(sockets.length, 2);
  assert.equal(sockets[0].closed, true);
  welcome(sockets[1], "after-gap");
  await settle();
  assert.equal(subscriptions.length, 10);
  assert.equal(new Set(subscriptions).size, 10);
  sockets[1].receive(frame); // A replay from the retiring connection must not count again.
  assert.equal((await snapshot()).eventsub.eventCount, count);
  assert.equal((await snapshot()).eventsub.status, "connected");
  assert.ok(
    (await snapshot()).eventsub.subscriptions.every(
      (row: { status: string }) => row.status === "enabled",
    ),
  );
  assert.equal(
    sends.length,
    0,
    "simulated commands, follows, raids and bells never send to Twitch",
  );
  const controller = new AbortController();
  t.after(() => controller.abort());
  const projections = [JSON.stringify(await snapshot()), ...logs];
  for (const path of ["/events?client=overlay", "/api/analytics/events"]) {
    const response = await runtime.app.request(
      new Request(`${origin}${path}`, {
        headers: host,
        signal: controller.signal,
      }),
    );
    const reader = response.body?.getReader();
    assert.ok(reader);
    projections.push(new TextDecoder().decode((await reader.read()).value));
    await reader.cancel();
  }
  for (const value of [privateText, ...secrets, "H4_PRIVATE_NETWORK_ERROR"])
    assert.equal(
      projections.some((projection) => projection.includes(value)),
      false,
      value,
    );
});
