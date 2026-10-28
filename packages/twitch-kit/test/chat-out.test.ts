import assert from "node:assert/strict";
import test from "node:test";
import { initialChatOutState, stepChatOut, truncateMessage } from "../src/chat-out/queue.ts";

test("100 queued replies respect one per second and 18 per rolling 30 seconds, then expire", () => {
  let state = initialChatOutState();
  for (let i = 0; i < 100; i++)
    state = stepChatOut(
      state,
      { type: "enqueue", item: { text: `reply ${i}`, origin: "twitch", priority: "reply" } },
      0,
      true,
    ).state;
  assert.equal(state.pending.length, 100);
  const attempts: number[] = [];
  for (let now = 0; now <= 60_000; now += 100) {
    state = stepChatOut(state, { type: "poll" }, now, true).state;
    const permit = stepChatOut(state, { type: "permit" }, now, true);
    state = permit.state;
    if (permit.allowed) {
      assert.ok(state.inFlight);
      attempts.push(now);
      state = stepChatOut(
        state,
        { type: "result", id: state.inFlight.id, sent: true, messageId: `sent:${now}` },
        now,
        true,
      ).state;
    }
  }
  assert.equal(attempts.length, 18);
  assert.ok(attempts.every((at, i) => i === 0 || at - attempts[i - 1] >= 1000));
  for (const at of attempts)
    assert.ok(attempts.filter((time) => time >= at && time < at + 30_000).length <= 18);
  assert.equal(state.pending.length, 0);
  assert.equal(state.inFlight, null);
  assert.equal(state.logs.filter((entry) => entry.drop_reason === "expired").length, 82);
});
test("reply priority, ambient eviction, duplicate collapse, reply-only capacity and bounded diagnostics", () => {
  let state = initialChatOutState();
  const enqueue = (text: string, priority: "reply" | "ambient" = "ambient") => {
    state = stepChatOut(
      state,
      { type: "enqueue", item: { text, priority, origin: "twitch" } },
      0,
      true,
    ).state;
  };
  for (let i = 0; i < 11; i++) enqueue(`ambient ${i}`);
  assert.equal(state.pending.length, 10);
  assert.equal(state.logs.at(-1)?.drop_reason, "ambient_evicted");
  assert.equal(state.pending[0].text, "ambient 1");
  enqueue("answer", "reply");
  enqueue("answer", "reply");
  assert.equal(state.pending.filter((entry) => entry.text === "answer").length, 1);
  state = stepChatOut(state, { type: "poll" }, 0, true).state;
  assert.equal(state.inFlight?.text, "answer");
  state = initialChatOutState();
  for (let i = 0; i < 201; i++) enqueue(`reply ${i}`, "reply");
  assert.equal(state.pending.length, 100);
  assert.equal(state.pending.at(-1)?.text, "reply 99");
  assert.equal(state.logs.length, 100);
  assert.equal(state.logs.at(-1)?.drop_reason, "queue_full");
});

test("a reply arriving during the cooldown overtakes pending ambient output", () => {
  let state = initialChatOutState();
  state.attempts = [0];
  state = stepChatOut(
    state,
    { type: "enqueue", item: { text: "ambient", origin: "twitch", priority: "ambient" } },
    100,
    true,
  ).state;
  state = stepChatOut(state, { type: "poll" }, 100, true).state;
  assert.equal(state.inFlight, null);
  state = stepChatOut(
    state,
    { type: "enqueue", item: { text: "reply", origin: "twitch", priority: "reply" } },
    200,
    true,
  ).state;
  state = stepChatOut(state, { type: "poll" }, 1000, true).state;
  assert.equal(state.inFlight?.text, "reply");
});
test("simulation and demo output bypass the live queue and provenance is rechecked before each attempt", () => {
  for (const priority of ["reply", "ambient"] as const) {
    for (const live of [false, true]) {
      const queued = stepChatOut(
        initialChatOutState(),
        {
          type: "enqueue",
          item: { text: "simulated raid, follow or bell", origin: "sim", priority },
        },
        0,
        live,
      );
      assert.deepEqual(queued.effects, []);
      assert.equal(queued.state.pending.length, 0);
      assert.equal(queued.state.logs[0].kind, "would-have-said");
    }
  }
  let state = stepChatOut(
    initialChatOutState(),
    { type: "enqueue", item: { text: "reply", origin: "twitch", priority: "reply" } },
    0,
    true,
  ).state;
  state = stepChatOut(state, { type: "poll" }, 0, true).state;
  const disconnected = stepChatOut(state, { type: "permit" }, 0, false);
  assert.equal(disconnected.allowed, false);
  assert.equal(disconnected.state.logs.at(-1)?.kind, "would-have-said");
  const forged = structuredClone(state);
  assert.ok(forged.inFlight);
  forged.inFlight.origin = "sim";
  assert.equal(stepChatOut(forged, { type: "permit" }, 0, true).allowed, false);
});
test("quiet mode flushes pending messages, sent IDs expire after two minutes, and truncation preserves words and Unicode", () => {
  let state = stepChatOut(
    initialChatOutState(),
    {
      type: "enqueue",
      item: { text: "hello", origin: "twitch", priority: "reply", replyParentMessageId: "parent" },
    },
    0,
    true,
  ).state;
  const polled = stepChatOut(state, { type: "poll" }, 0, true);
  state = polled.state;
  assert.equal(state.inFlight?.replyParentMessageId, "parent");
  assert.ok(state.inFlight);
  state = stepChatOut(
    state,
    { type: "result", id: state.inFlight.id, sent: true, messageId: "twitch-id" },
    1,
    true,
  ).state;
  assert.equal(state.sentIds[0].id, "twitch-id");
  assert.equal(stepChatOut(state, { type: "poll" }, 120_001, true).state.sentIds.length, 0);
  state = stepChatOut(
    state,
    { type: "enqueue", item: { text: "pending", origin: "twitch", priority: "ambient" } },
    2,
    true,
  ).state;
  state = stepChatOut(state, { type: "quiet", value: true }, 3, true).state;
  assert.equal(state.pending.length, 0);
  assert.equal(state.logs.at(-1)?.drop_reason, "quiet_mode");
  assert.equal(truncateMessage("word ".repeat(150)).length <= 500, true);
  assert.ok(truncateMessage("word ".repeat(150)).endsWith("word…"));
  assert.equal([...truncateMessage("😀".repeat(600))].length, 500);
  assert.equal(truncateMessage(" short "), "short");
});
