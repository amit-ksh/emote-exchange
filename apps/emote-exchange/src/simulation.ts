import type { SimScenario } from "@emote-exchange/twitch-kit";

const mixed = { plain: 65, emote: 30, follow: 4, raid: 1 };
const emoteAt = (emotes: readonly { name: string }[], index: number) =>
  emotes[index % emotes.length].name;
export const exchangeScenarios: SimScenario[] = [
  {
    id: "opening-day",
    label: "Opening day",
    description: "12 chatters, six original emotes and light trading commands.",
    defaults: { rate: 4, chatters: 12, mix: mixed },
    initial: [{ type: "online" }],
    message: ({ index, chatters, emotes, random }) => {
      if (index < chatters) return { type: "chat", chatter: index, text: "!visa" };
      const use = index - chatters;
      const name = emoteAt(emotes, use % Math.min(6, emotes.length));
      return {
        type: "chat",
        chatter: use < 12 ? Math.floor(use / 6) % chatters : index % chatters,
        text: use >= 24 && random() < 0.1 ? `!buy ${name} 1` : name,
      };
    },
  },
  {
    id: "pump-and-dump",
    label: "Pump and dump",
    description: "15 chatters focus on one emote for 60 seconds, then send sell commands.",
    defaults: { rate: 6, chatters: 15, mix: { plain: 10, emote: 90, follow: 0, raid: 0 } },
    durationMs: 120_000,
    message: ({ index, elapsedMs, chatters, emotes }) => ({
      type: "chat",
      chatter: index % chatters,
      text:
        index < chatters
          ? "!visa"
          : index < chatters * 2
            ? `!buy ${emoteAt(emotes, 0)} 1`
            : elapsedMs <= 60_000
              ? emoteAt(emotes, 0)
              : index % 3 === 0
                ? `!sell ${emoteAt(emotes, 0)} 1`
                : "A quieter lap after that rush.",
    }),
  },
  {
    id: "solo-spammer",
    label: "Solo spammer",
    description: "One chatter repeats one emote; three others use another once at the start.",
    defaults: { rate: 1, chatters: 4, mix: { plain: 0, emote: 100, follow: 0, raid: 0 } },
    durationMs: 30_000,
    initial: [1, 2, 3].map((chatter) => ({ type: "chat" as const, chatter, text: "DemoBolt" })),
    message: ({ emotes }) => ({ type: "chat", chatter: 0, text: emoteAt(emotes, 0) }),
  },
  {
    id: "raid-wave",
    label: "Raid wave",
    description: "A 40-viewer raid, followed by 20 chatters claiming visas and using emotes.",
    defaults: { rate: 8, chatters: 20, mix: { plain: 20, emote: 80, follow: 0, raid: 0 } },
    initial: [{ type: "raid", chatter: 0, viewers: 40 }],
    message: ({ index, chatters, emotes }) => ({
      type: "chat",
      chatter: index % chatters,
      text: index < chatters ? "!visa" : emoteAt(emotes, index % Math.min(6, emotes.length)),
    }),
  },
  {
    id: "quiet-market",
    label: "Quiet market",
    description:
      "Five minutes of slow chat at 0.2 messages per second, then a simulated closing bell.",
    defaults: { rate: 0.2, chatters: 12, mix: { plain: 80, emote: 20, follow: 0, raid: 0 } },
    durationMs: 300_000,
    finish: [{ type: "offline" }],
  },
  {
    id: "soak",
    label: "Soak",
    description:
      "50 messages per second, 500 fixed chatters and 24 original emotes for 40 minutes.",
    defaults: { rate: 50, chatters: 500, mix: { plain: 10, emote: 90, follow: 0, raid: 0 } },
    durationMs: 2_400_000,
    message: ({ index, chatters, emotes }) => ({
      type: "chat",
      chatter: index % chatters,
      text: emoteAt(emotes, Math.floor(index / chatters)),
    }),
  },
];
