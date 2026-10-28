import assert from "node:assert/strict";
import test from "node:test";
import { createChatOut } from "../src/chat-out/runner.ts";
import { createHelix } from "../src/helix.ts";

function fixture(
  response: () => Response = () =>
    Response.json({ data: [{ message_id: "sent-id", is_sent: true, drop_reason: null }] }),
) {
  let now = 0;
  let bot = true;
  let broadcaster = true;
  const requests: { body: Record<string, unknown>; authorization: string; at: number }[] = [];
  const auth = {
    identity: (role: "bot" | "broadcaster") =>
      role === "bot" ? (bot ? "300" : undefined) : broadcaster ? "100" : undefined,
    accessToken: (role: "bot" | "broadcaster") =>
      role === "bot"
        ? bot
          ? "bot-secret"
          : undefined
        : broadcaster
          ? "broadcaster-secret"
          : undefined,
    refresh: async () => {},
  };
  const helix = createHelix({
    clientId: "id",
    auth,
    now: () => now,
    log: () => {},
    wait: async (ms) => {
      now += ms;
    },
    fetcher: async (_url, init) => {
      requests.push({
        body: JSON.parse(init?.body as string),
        authorization: new Headers(init?.headers).get("Authorization") ?? "",
        at: now,
      });
      return response();
    },
  });
  const queue = createChatOut({
    helix,
    auth,
    now: () => now,
    autoTick: false,
    wait: async (ms) => {
      now += ms;
    },
  });
  return {
    queue,
    requests,
    setNow: (at: number) => {
      now = at;
    },
    disconnectBot: () => {
      bot = false;
      queue.syncAuth();
    },
    disconnectBroadcaster: () => {
      broadcaster = false;
      queue.syncAuth();
    },
    close: () => {
      queue.close();
      helix.close();
    },
  };
}

test("100 live replies remain rate limited through the real queue/Helix boundary", async (t) => {
  const f = fixture();
  t.after(f.close);
  for (let i = 0; i < 100; i++)
    f.queue.enqueue({ text: `approved reply ${i}`, priority: "reply", origin: "twitch" });
  for (let now = 0; now <= 60_000; now += 100) {
    f.setNow(now);
    await f.queue.tick();
  }
  assert.equal(f.requests.length, 18);
  for (const [index, request] of f.requests.entries()) {
    if (index) assert.ok(request.at - f.requests[index - 1].at >= 1000);
    assert.ok(
      f.requests.filter((other) => other.at >= request.at && other.at < request.at + 30_000)
        .length <= 18,
    );
  }
  assert.equal(f.queue.publicState().pending, 0);
  assert.equal(
    f.queue.publicState().logs.filter((entry) => entry.drop_reason === "expired").length,
    82,
  );
});
test("transport errors and account changes drop output without retrying or exposing exception text", async (t) => {
  const f = fixture(() => {
    throw new Error("private-network-error");
  });
  t.after(f.close);
  f.queue.enqueue({ text: "approved output", origin: "twitch", priority: "reply" });
  await f.queue.tick();
  assert.equal(f.queue.publicState().logs[0].drop_reason, "network_error");
  assert.equal(JSON.stringify(f.queue.publicState()).includes("private-network-error"), false);
  f.queue.enqueue({ text: "waiting output", origin: "twitch", priority: "reply" });
  f.disconnectBroadcaster();
  await f.queue.tick();
  assert.equal(f.requests.length, 1);
  assert.equal(f.queue.publicState().logs.at(-1)?.drop_reason, "connection_changed");
});
test("chat runtime prefers bot, falls back to broadcaster, passes reply IDs and marks sent echoes for two minutes", async (t) => {
  const f = fixture();
  t.after(f.close);
  f.queue.syncAuth();
  f.queue.enqueue({
    text: "app generated reply",
    priority: "reply",
    origin: "twitch",
    replyParentMessageId: "parent-id",
  });
  await f.queue.tick();
  assert.deepEqual(f.requests[0].body, {
    broadcaster_id: "100",
    sender_id: "300",
    message: "app generated reply",
    reply_parent_message_id: "parent-id",
  });
  assert.equal(f.requests[0].authorization, "Bearer bot-secret");
  assert.equal(f.queue.wasSent("sent-id"), true);
  f.disconnectBot();
  f.setNow(1000);
  f.queue.enqueue({ text: "fallback reply", priority: "reply", origin: "twitch" });
  await f.queue.tick();
  assert.equal(f.requests[1].body.sender_id, "100");
  assert.equal(f.requests[1].authorization, "Bearer broadcaster-secret");
  f.setNow(121_000);
  assert.equal(f.queue.wasSent("sent-id"), false);
});
test("simulated replies and ambient raid/follow/bell effects never fetch even while live; demo output previews only", async (t) => {
  const f = fixture();
  t.after(f.close);
  for (const text of ["reply", "raid", "follow", "closing bell"])
    f.queue.enqueue({ text, priority: text === "reply" ? "reply" : "ambient", origin: "sim" });
  await f.queue.tick();
  assert.equal(f.requests.length, 0);
  assert.equal(
    f.queue.publicState().logs.filter((entry) => entry.kind === "would-have-said").length,
    4,
  );
  f.disconnectBroadcaster();
  f.queue.enqueue({ text: "demo output", priority: "reply", origin: "twitch" });
  await f.queue.tick();
  assert.equal(f.requests.length, 0);
  assert.equal(f.queue.publicState().logs.at(-1)?.kind, "would-have-said");
});
test("provider drops and network failures expose fixed diagnostics, with no provider body or token", async (t) => {
  const f = fixture(() =>
    Response.json({
      data: [
        { is_sent: false, drop_reason: { code: "automod_held", message: "private-provider-body" } },
      ],
    }),
  );
  t.after(f.close);
  f.queue.enqueue({ text: "approved output", priority: "reply", origin: "twitch" });
  await f.queue.tick();
  const view = f.queue.publicState();
  assert.equal(view.logs[0].is_sent, false);
  assert.equal(view.logs[0].drop_reason, "automod_held");
  assert.equal(JSON.stringify(view).includes("private-provider-body"), false);
  assert.equal(JSON.stringify(view).includes("secret"), false);
  f.queue.setQuiet(true);
  f.setNow(1000);
  f.queue.enqueue({ text: "quiet output", priority: "reply", origin: "twitch" });
  await f.queue.tick();
  assert.equal(f.requests.length, 1);
  assert.equal(f.queue.publicState().logs.at(-1)?.drop_reason, "quiet_mode");
});
test("retries recheck quiet mode and count against the local rate limit", async (t) => {
  let now = 0;
  let requests = 0;
  const auth = { identity: () => "100", accessToken: () => "secret", refresh: async () => {} };
  const helix = createHelix({
    clientId: "id",
    auth,
    now: () => now,
    log: () => {},
    fetcher: async () => {
      requests++;
      return new Response(null, { status: requests === 1 ? 401 : 200 });
    },
  });
  const queue = createChatOut({
    auth,
    helix,
    autoTick: false,
    now: () => now,
    wait: async (ms) => {
      now += ms;
      queue.setQuiet(true);
    },
  });
  t.after(() => {
    queue.close();
    helix.close();
  });
  queue.enqueue({ text: "guarded retry", priority: "reply", origin: "twitch" });
  await queue.tick();
  assert.equal(requests, 1);
  assert.equal(now, 1000);
  assert.equal(queue.publicState().logs.at(-1)?.drop_reason, "quiet_mode");
});
