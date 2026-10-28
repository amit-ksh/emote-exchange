import assert from "node:assert/strict";
import test from "node:test";
import { initialProtocolState, stepProtocol } from "../src/eventsub/protocol.ts";

const url = "wss://eventsub.wss.twitch.tv/ws?keepalive_timeout_seconds=30";
const frame = (type: string, payload: unknown, id = type) => ({
  metadata: { message_id: id, message_type: type, message_timestamp: "2026-10-28T00:00:00.000Z" },
  payload,
});
const welcome = (id = "session:1") =>
  frame("session_welcome", { session: { id, keepalive_timeout_seconds: 30 } });

test("fresh EventSub welcome schedules subscriptions within ten seconds and resets the watchdog", () => {
  const started = stepProtocol(initialProtocolState(), { type: "start", url }, 0);
  assert.deepEqual(started.effects, [{ type: "open", socket: "socket:1", url }]);
  const ready = stepProtocol(
    started.state,
    { type: "frame", socket: "socket:1", frame: welcome() },
    100,
  );
  assert.deepEqual(ready.effects, [
    { type: "subscribe", session: "session:1", socket: "socket:1", deadline: 10_100 },
  ]);
  assert.equal(ready.state.status, "connected");
  assert.equal(stepProtocol(ready.state, { type: "tick" }, 35_099).effects.length, 0);
  assert.equal(stepProtocol(ready.state, { type: "tick" }, 35_101).state.status, "lost");
});

test("handoff retains the old socket until welcome and carries subscriptions and delivery deduplication", () => {
  let state = stepProtocol(initialProtocolState(), { type: "start", url }, 0).state;
  state = stepProtocol(state, { type: "frame", socket: "socket:1", frame: welcome() }, 1).state;
  const notice = frame(
    "notification",
    { subscription: { type: "stream.online" }, event: {} },
    "delivery:1",
  );
  const first = stepProtocol(state, { type: "frame", socket: "socket:1", frame: notice }, 2);
  assert.equal(first.effects[0]?.type, "notification");
  const reconnectUrl = "wss://eventsub.wss.twitch.tv/ws?session=reconnect-token";
  const handoff = stepProtocol(
    first.state,
    {
      type: "frame",
      socket: "socket:1",
      frame: frame("session_reconnect", { session: { reconnect_url: reconnectUrl } }),
    },
    3,
  );
  assert.deepEqual(handoff.effects, [{ type: "open", socket: "socket:2", url: reconnectUrl }]);
  const moved = stepProtocol(
    handoff.state,
    { type: "frame", socket: "socket:2", frame: welcome("session:2") },
    4,
  );
  assert.deepEqual(moved.effects, [{ type: "close", socket: "socket:1" }]);
  assert.deepEqual(
    stepProtocol(moved.state, { type: "frame", socket: "socket:2", frame: notice }, 5).effects,
    [],
  );
  assert.deepEqual(
    stepProtocol(moved.state, { type: "closed", socket: "socket:1", code: 1000 }, 6).effects,
    [],
  );
});

test("lost sockets back off at 1, 2, 5, 10 and 30 seconds and fresh welcomes resubscribe", () => {
  let state = stepProtocol(initialProtocolState(), { type: "start", url }, 0).state;
  let now = 10;
  for (const [index, delay] of [1000, 2000, 5000, 10000, 30000, 30000].entries()) {
    const lost = stepProtocol(
      state,
      { type: "closed", socket: `socket:${index + 1}`, code: 1006 },
      now,
    );
    assert.equal(lost.state.status, "lost");
    assert.equal(stepProtocol(lost.state, { type: "tick" }, now + delay - 1).effects.length, 0);
    const retry = stepProtocol(lost.state, { type: "tick" }, now + delay);
    assert.deepEqual(retry.effects, [{ type: "open", socket: `socket:${index + 2}`, url }]);
    state = retry.state;
    now += delay + 1;
  }
  const ready = stepProtocol(state, { type: "frame", socket: "socket:7", frame: welcome() }, now);
  assert.equal(ready.effects[0]?.type, "subscribe");
});

test("keepalives extend the returned timeout, delivery memory is bounded and expires, and stop is terminal", () => {
  let state = stepProtocol(initialProtocolState(), { type: "start", url }, 0).state;
  state = stepProtocol(
    state,
    {
      type: "frame",
      socket: "socket:1",
      frame: frame("session_welcome", { session: { id: "s", keepalive_timeout_seconds: 10 } }),
    },
    0,
  ).state;
  state = stepProtocol(
    state,
    { type: "frame", socket: "socket:1", frame: frame("session_keepalive", {}) },
    14_000,
  ).state;
  assert.equal(stepProtocol(state, { type: "tick" }, 28_999).state.status, "connected");
  for (let i = 0; i < 2001; i++)
    state = stepProtocol(
      state,
      { type: "frame", socket: "socket:1", frame: frame("notification", {}, `id:${i}`) },
      14_000 + i,
    ).state;
  assert.equal(state.seen.length, 2000);
  const expired = stepProtocol(
    state,
    { type: "frame", socket: "socket:1", frame: frame("notification", {}, "id:2000") },
    620_001,
  );
  assert.equal(expired.effects[0]?.type, "notification");
  const stopped = stepProtocol(expired.state, { type: "stop" }, 620_002);
  assert.deepEqual(stopped.effects, [{ type: "close", socket: "socket:1" }]);
  assert.deepEqual(stepProtocol(stopped.state, { type: "tick" }, 999_999).effects, []);
});

test("revocations emit once, bug close codes surface, and untrusted reconnect hosts are rejected", () => {
  let state = stepProtocol(initialProtocolState(), { type: "start", url }, 0).state;
  state = stepProtocol(state, { type: "frame", socket: "socket:1", frame: welcome() }, 1).state;
  const revoked = stepProtocol(
    state,
    {
      type: "frame",
      socket: "socket:1",
      frame: frame("revocation", {
        subscription: { type: "channel.follow", status: "authorization_revoked" },
      }),
    },
    2,
  );
  assert.equal(revoked.effects[0]?.type, "revocation");
  const invalid = stepProtocol(
    state,
    {
      type: "frame",
      socket: "socket:1",
      frame: frame("session_reconnect", { session: { reconnect_url: "wss://evil.example/ws" } }),
    },
    3,
  );
  assert.equal(
    invalid.effects.some((effect) => effect.type === "open"),
    false,
  );
  for (const code of [4001, 4003]) {
    const closed = stepProtocol(state, { type: "closed", socket: "socket:1", code }, 4);
    assert.ok(
      closed.effects.some((effect) => effect.type === "protocol-error" && effect.code === code),
    );
  }
});
