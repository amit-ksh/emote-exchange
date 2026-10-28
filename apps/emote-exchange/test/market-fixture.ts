import type { ChatEvent, Emote } from "@emote-exchange/twitch-kit";
import { initialMarketState } from "../src/engine/market.ts";

export const emote = (name: string): Emote => ({
  key: `demo:${name}`,
  name,
  imageUrl: `/demo-emotes/${name}.svg`,
  animated: false,
});
let serial = 0;
export function chat(
  user: string,
  at: number,
  command: string | null = null,
  args: string[] = [],
  names: string[] = [],
): Extract<ChatEvent, { type: "ChatMessage" }> {
  const id = `sim:e3:${++serial}`;
  return {
    type: "ChatMessage",
    id,
    at,
    messageId: `${id}:message`,
    origin: "sim",
    chatter: {
      id: user,
      login: user,
      displayName: user,
      color: "#FFFFFF",
      isBroadcaster: false,
      isMod: false,
      isVip: false,
      isSubscriber: false,
    },
    text: "private incoming chat",
    parts: names.map((name) => ({ type: "emote", text: name, ...emote(name) })),
    command: command ? { name: command, args } : null,
    foreign: false,
    selfSent: false,
  };
}
export function market() {
  return initialMarketState({
    now: 0,
    catalog: [emote("X"), emote("Y")],
    seedListings: [
      {
        emote: emote("X"),
        ipoAt: 0,
        lastUseAt: 0,
        sessionOpenPrice: 100,
        base: 100,
        heat: 2,
        impact: 0,
      },
    ],
  });
}
