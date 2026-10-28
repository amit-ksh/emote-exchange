import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEventSub } from "../src/eventsub/runner.ts";

const chat = JSON.parse(readFileSync(new URL("./fixtures/eventsub.json", import.meta.url), "utf8"));
const welcome = {
  metadata: {
    message_id: "welcome",
    message_type: "session_welcome",
    message_timestamp: "2026-10-28T00:00:00Z",
  },
  payload: { session: { id: "session-1", keepalive_timeout_seconds: 30 } },
};
class Socket extends EventTarget {
  closed = false;
  close() {
    this.closed = true;
  }
  receive(value: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(value) }));
  }
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
test("disconnect cancels subscriptions and late unauthorized responses cannot refresh or restore state", async (t) => {
  const socket = new Socket();
  const finish: ((response: Response) => void)[] = [];
  const signals: AbortSignal[] = [];
  let connected = true;
  let refreshes = 0;
  const runtime = createEventSub({
    clientId: "client",
    autoTick: false,
    now: () => 0,
    auth: {
      identity: () => (connected ? "100" : undefined),
      accessToken: () => "secret",
      refresh: async () => {
        refreshes++;
      },
      invalidate: () => {},
    },
    createSocket: () => socket,
    fetcher: async (_url, init) => {
      signals.push(init?.signal as AbortSignal);
      return new Promise<Response>((resolve) => finish.push(resolve));
    },
  });
  t.after(() => runtime.close());
  runtime.syncAuth();
  socket.receive(welcome);
  await settle();
  assert.equal(finish.length, 5);
  connected = false;
  runtime.syncAuth();
  assert.ok(signals.every((signal) => signal.aborted));
  for (const resolve of finish) resolve(new Response(null, { status: 401 }));
  await settle();
  assert.equal(refreshes, 0);
  assert.ok(runtime.publicState().subscriptions.every((entry) => entry.status === "disconnected"));
});
test("runner opens without credentials, creates exactly five subscriptions, counts deduped events and stops on auth loss", async (t) => {
  const sockets: Socket[] = [];
  const urls: string[] = [];
  const requests: Record<string, unknown>[] = [];
  const events: unknown[] = [];
  let connected = true;
  const runtime = createEventSub({
    clientId: "client",
    now: () => 1000,
    autoTick: false,
    wsUrl: "wss://eventsub.wss.twitch.tv/ws?existing=yes",
    auth: {
      identity: () => (connected ? "100" : undefined),
      accessToken: () => "private-token",
      refresh: async () => {},
      invalidate: () => {
        connected = false;
      },
    },
    createSocket: (url) => {
      urls.push(url);
      const socket = new Socket();
      sockets.push(socket);
      return socket;
    },
    fetcher: async (_url, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer private-token");
      requests.push(JSON.parse(init?.body as string));
      return Response.json({ data: [{ status: "enabled" }] }, { status: 202 });
    },
    onEvent: (event) => events.push(event),
  });
  t.after(() => runtime.close());
  runtime.syncAuth();
  assert.equal(urls.length, 1);
  assert.equal(new URL(urls[0]).searchParams.get("existing"), "yes");
  assert.equal(new URL(urls[0]).searchParams.get("keepalive_timeout_seconds"), "30");
  assert.equal(urls[0].includes("private-token"), false);
  sockets[0].receive(welcome);
  await settle();
  assert.deepEqual(
    requests.map((request) => request.type),
    ["channel.chat.message", "channel.follow", "channel.raid", "stream.online", "stream.offline"],
  );
  assert.deepEqual(requests[0].condition, { broadcaster_user_id: "100", user_id: "100" });
  assert.deepEqual(requests[1].condition, { broadcaster_user_id: "100", moderator_user_id: "100" });
  assert.deepEqual(requests[2].condition, { to_broadcaster_user_id: "100" });
  assert.ok(
    requests.every(
      (request) =>
        JSON.stringify(request.transport) ===
        JSON.stringify({ method: "websocket", session_id: "session-1" }),
    ),
  );
  assert.ok(runtime.publicState().subscriptions.every((entry) => entry.status === "enabled"));
  sockets[0].receive(chat);
  sockets[0].receive(chat);
  assert.equal(runtime.publicState().eventCount, 1);
  assert.equal(runtime.publicState().chatMessageCount, 1);
  assert.equal(events.length, 1);
  assert.equal(
    JSON.stringify(runtime.publicState()).includes(chat.payload.event.message.text),
    false,
  );
  assert.equal(JSON.stringify(runtime.publicState()).includes("private-token"), false);
  sockets[0].receive({
    ...welcome,
    metadata: { ...welcome.metadata, message_type: "session_reconnect" },
    payload: { session: { reconnect_url: "wss://eventsub.wss.twitch.tv/ws?session=handoff" } },
  });
  assert.equal(sockets[0].closed, false);
  sockets[1].receive(welcome);
  await settle();
  assert.equal(requests.length, 5);
  assert.equal(sockets[0].closed, true);
  connected = false;
  runtime.syncAuth();
  assert.equal(sockets[1].closed, true);
  assert.equal(runtime.publicState().status, "disconnected");
});
test("subscription failures expose status only, refresh once, ignore stale completions and handle revocation", async (t) => {
  const socket = new Socket();
  let refreshes = 0;
  let revoked = false;
  const attempts = new Map<string, number>();
  const runtime = createEventSub({
    clientId: "client",
    autoTick: false,
    now: () => 0,
    auth: {
      identity: () => "100",
      accessToken: () => "secret",
      refresh: async () => {
        refreshes++;
      },
      invalidate: () => {
        revoked = true;
      },
    },
    createSocket: () => socket,
    fetcher: async (_url, init) => {
      const type = JSON.parse(init?.body as string).type;
      const attempt = (attempts.get(type) ?? 0) + 1;
      attempts.set(type, attempt);
      if (type === "channel.chat.message" && attempt === 1)
        return Response.json({ message: "sensitive" }, { status: 401 });
      return Response.json({ message: "sensitive" }, { status: 403 });
    },
  });
  t.after(() => runtime.close());
  runtime.syncAuth();
  socket.receive(welcome);
  await settle();
  assert.equal(refreshes, 1);
  assert.ok(
    runtime
      .publicState()
      .subscriptions.every((entry) => entry.status === "failed" && entry.httpStatus === 403),
  );
  assert.equal(JSON.stringify(runtime.publicState()).includes("sensitive"), false);
  socket.receive({
    metadata: { ...welcome.metadata, message_id: "revoked", message_type: "revocation" },
    payload: { subscription: { type: "channel.follow", status: "authorization_revoked" } },
  });
  assert.equal(revoked, true);
  assert.equal(runtime.publicState().status, "disconnected");
  assert.equal(socket.closed, true);
});
