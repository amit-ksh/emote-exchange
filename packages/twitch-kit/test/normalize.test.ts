import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeEvent, parseCommand } from "../src/eventsub/normalize.ts";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/eventsub.json", import.meta.url), "utf8"),
);
test("chat normalization preserves provenance, fragments, roles, and distinct delivery/reply identities", () => {
  const event = normalizeEvent(fixture, {
    broadcasterId: "100",
    lookupEmote: (word) =>
      word === "Party"
        ? { key: "demo:party", name: word, imageUrl: "/demo-emotes/Party.svg", animated: false }
        : undefined,
  });
  assert.ok(event?.type === "ChatMessage");
  assert.deepEqual(
    { id: event.id, at: event.at, origin: event.origin },
    { id: "delivery-chat-1", at: Date.parse("2026-10-28T00:00:00.123Z"), origin: "twitch" },
  );
  assert.equal(event.messageId, "chat-message-1");
  assert.equal(event.chatter.isMod, true);
  assert.equal(event.chatter.isSubscriber, false);
  assert.deepEqual(event.command, { name: "buy", args: ["Kappa", "2", "@Friend", "Party"] });
  assert.deepEqual(
    event.parts.map((part) => part.type),
    ["text", "emote", "text", "mention", "text", "emote"],
  );
  assert.equal(event.parts[1].type === "emote" && event.parts[1].animated, true);
  assert.equal(event.foreign, false);
  assert.equal(event.selfSent, false);
});
test("foreign/shared chat, bot identity and sent message IDs are explicit; malformed input is rejected", () => {
  const source = structuredClone(fixture);
  source.payload.event.source_broadcaster_user_id = "999";
  const event = normalizeEvent(source, { broadcasterId: "100", botId: "200" });
  assert.ok(event?.type === "ChatMessage" && event.foreign && event.selfSent);
  assert.ok(
    normalizeEvent(fixture, { broadcasterId: "100", wasSent: (id) => id === "chat-message-1" })
      ?.type === "ChatMessage",
  );
  const sent = normalizeEvent(fixture, { broadcasterId: "100", wasSent: () => true });
  assert.ok(sent?.type === "ChatMessage" && sent.selfSent);
  source.payload.event.message.text = "x".repeat(800);
  source.payload.event.message.fragments = [{ type: "text", text: "x".repeat(800) }];
  const capped = normalizeEvent(source, { broadcasterId: "100" });
  assert.ok(
    capped?.type === "ChatMessage" &&
      capped.text.length === 500 &&
      capped.parts[0].text.length === 500,
  );
  assert.equal(normalizeEvent({}, { broadcasterId: "100" }), null);
});
test("follow, raid and stream events share metadata identity and time; unrelated channels are rejected", () => {
  for (const [subscription, type, payload] of [
    [
      "channel.follow",
      "Follow",
      { broadcaster_user_id: "100", user_id: "200", user_login: "viewer", user_name: "Viewer" },
    ],
    [
      "channel.raid",
      "Raid",
      {
        to_broadcaster_user_id: "100",
        from_broadcaster_user_id: "200",
        from_broadcaster_user_login: "raider",
        from_broadcaster_user_name: "Raider",
        viewers: 10,
      },
    ],
    ["stream.online", "StreamOnline", { broadcaster_user_id: "100" }],
    ["stream.offline", "StreamOffline", { broadcaster_user_id: "100" }],
  ] as const) {
    const source = {
      metadata: fixture.metadata,
      payload: { subscription: { type: subscription }, event: payload },
    };
    const event = normalizeEvent(source, { broadcasterId: "100" });
    assert.ok(event);
    assert.equal(event.type, type);
    assert.equal(event.id, fixture.metadata.message_id);
    assert.equal(event.at, Date.parse(fixture.metadata.message_timestamp));
    assert.equal(event.origin, "twitch");
    assert.equal(normalizeEvent(source, { broadcasterId: "999" }), null);
  }
});
test("commands require a leading bang and letter and preserve argument case", () => {
  assert.deepEqual(parseCommand("!PrIcE\tKappa  Party"), {
    name: "price",
    args: ["Kappa", "Party"],
  });
  for (const text of [" !buy Kappa", "!123", "hello !buy", "!"])
    assert.equal(parseCommand(text), null);
});
