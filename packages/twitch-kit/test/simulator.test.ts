import assert from "node:assert/strict";
import test from "node:test";
import type { ChatEvent } from "../src/eventsub/normalize.ts";
import { initialSimulatorState, stepSimulator } from "../src/sim/engine.ts";

const emotes = [
  {
    key: "demo:DemoBull",
    name: "DemoBull",
    imageUrl: "/demo-emotes/DemoBull.svg",
    animated: false,
  },
];
const config = {
  seed: 42,
  rate: 4,
  chatters: 12,
  mix: { plain: 70, emote: 25, follow: 4, raid: 1 },
  scenario: "free-play",
};
const start = (options = config) =>
  stepSimulator(initialSimulatorState(), { type: "start", config: options, emotes }, 1000);
test("same seed and logical clock reproduce IDs, timestamps and events across different tick schedules", () => {
  function replay(ticks: number[]) {
    let { state, events } = start();
    const output = [...events];
    for (const at of ticks) {
      const next = stepSimulator(state, { type: "tick" }, at);
      state = next.state;
      output.push(...next.events);
    }
    return output;
  }
  const fine = replay(Array.from({ length: 100 }, (_, i) => 1000 + (i + 1) * 100));
  const coarse = replay([1800, 2900, 7500, 11_000]);
  assert.deepEqual(fine, coarse);
  assert.equal(new Set(fine.map((event) => event.id)).size, fine.length);
  assert.ok(fine.every((event) => event.origin === "sim" && event.id.startsWith("sim:")));
  const chats = fine.filter((event) => event.type === "ChatMessage");
  assert.equal(chats.length, 40);
  assert.ok(
    chats.every(
      (event) =>
        event.chatter.login.startsWith("sim_") &&
        event.chatter.displayName.startsWith("sim_") &&
        !event.selfSent &&
        !event.foreign,
    ),
  );
  const colors = new Map<string, string>();
  for (const chat of chats) {
    if (colors.has(chat.chatter.id)) assert.equal(chat.chatter.color, colors.get(chat.chatter.id));
    colors.set(chat.chatter.id, chat.chatter.color);
  }
});
test("configured chat rates hold from 0.2 to 50 messages per second and catch-up batches stay bounded", () => {
  for (const rate of [0.2, 1, 7.5, 50]) {
    let { state } = start({ ...config, rate, mix: { plain: 0, emote: 0, follow: 100, raid: 0 } });
    const events: ChatEvent[] = [];
    for (let at = 1100; at <= 61_000; at += 100) {
      const next = stepSimulator(state, { type: "tick" }, at);
      state = next.state;
      events.push(...next.events);
    }
    assert.equal(events.filter((event) => event.type === "ChatMessage").length, rate * 60);
    assert.equal(events.filter((event) => event.type === "Follow").length, rate * 60);
  }
  const initial = start({ ...config, rate: 50 });
  assert.ok(stepSimulator(initial.state, { type: "tick" }, 3_601_000).events.length <= 500);
});
test("every normalized event kind retains simulation provenance, and stop prevents later events", () => {
  let { state } = start();
  const events: ChatEvent[] = [];
  for (const action of [
    { type: "chat", chatter: 0, text: "!BUY DemoBull 2" },
    { type: "follow", chatter: 1 },
    { type: "raid", chatter: 2, viewers: 40 },
    { type: "online" },
    { type: "offline" },
    { type: "delete", chatter: 0, messageId: "sim:message" },
    { type: "clear-user", chatter: 0 },
    { type: "clear-chat" },
  ] as const) {
    const next = stepSimulator(state, { type: "inject", action }, 2000);
    state = next.state;
    events.push(...next.events);
  }
  assert.equal(new Set(events.map((event) => event.type)).size, 8);
  assert.ok(events.every((event) => event.at === 2000 && event.origin === "sim"));
  assert.ok(
    events[0].type === "ChatMessage" &&
      events[0].parts.some((part) => part.type === "emote") &&
      events[0].command?.name === "buy",
  );
  const stopped = stepSimulator(state, { type: "stop" }, 3000);
  assert.equal(stopped.events[0].type, "ConnectionChanged");
  assert.equal(stopped.events[0].origin, "sim");
  assert.deepEqual(stepSimulator(stopped.state, { type: "tick" }, 50_000).events, []);
  assert.deepEqual(
    stepSimulator(
      stopped.state,
      { type: "inject", action: { type: "raid", chatter: 0, viewers: 40 } },
      50_000,
    ).events,
    [],
  );
});
test("invalid settings fail without changing state and repeated runs have distinct delivery identities", () => {
  for (const patch of [
    { rate: 0 },
    { rate: 51 },
    { rate: NaN },
    { chatters: 0 },
    { chatters: 501 },
    { seed: -1 },
    { mix: { plain: 0, emote: 0, follow: 0, raid: 0 } },
  ])
    assert.throws(() => start({ ...config, ...patch }), /simulator/i);
  const first = start();
  const before = structuredClone(first.state);
  stepSimulator(first.state, { type: "tick" }, 2000);
  assert.deepEqual(first.state, before);
  const second = stepSimulator(first.state, { type: "start", config, emotes }, 1000);
  assert.notEqual(second.events[0].id, first.events[0].id);
});
