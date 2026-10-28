import type { ChatEvent, Emote, MessagePart } from "../eventsub/normalize.ts";
import { parseCommand } from "../eventsub/normalize.ts";

export interface SimConfig {
  seed: number;
  rate: number;
  chatters: number;
  scenario: string;
  mix: { plain: number; emote: number; follow: number; raid: number };
}
export type SimAction =
  | { type: "chat"; chatter: number; text: string }
  | { type: "follow"; chatter: number }
  | { type: "raid"; chatter: number; viewers: number }
  | { type: "online" | "offline" | "clear-chat" }
  | { type: "delete"; chatter: number; messageId: string }
  | { type: "clear-user"; chatter: number };
export interface SimContext {
  index: number;
  elapsedMs: number;
  persona: keyof SimConfig["mix"];
  chatters: number;
  emotes: readonly Emote[];
  random: () => number;
}
export interface SimScenario {
  id: string;
  label: string;
  description: string;
  defaults: Omit<SimConfig, "seed" | "scenario">;
  initial?: readonly SimAction[];
  durationMs?: number;
  finish?: readonly SimAction[];
  message?: (context: SimContext) => Extract<SimAction, { type: "chat" }>;
  beforeMessage?: (context: SimContext) => readonly SimAction[];
}
export const freePlay: SimScenario = {
  id: "free-play",
  label: "Free play",
  description: "Mixed simulated chat, emotes, follows and raids.",
  defaults: { rate: 4, chatters: 12, mix: { plain: 70, emote: 25, follow: 4, raid: 1 } },
};
export interface SimulatorState {
  running: boolean;
  config: SimConfig;
  run: number;
  serial: number;
  rng: number;
  epoch: number;
  elapsedMs: number;
  messageIndex: number;
  eventCount: number;
  chatMessageCount: number;
  lastEvent: { type: ChatEvent["type"]; at: number } | null;
  emotes: Emote[];
}
type Input =
  | { type: "start"; config: SimConfig; emotes: readonly Emote[] }
  | { type: "tick" | "stop" }
  | { type: "inject"; action: SimAction };
const adjectives = [
  "amber",
  "bright",
  "calm",
  "daring",
  "eager",
  "frost",
  "golden",
  "happy",
  "indigo",
  "jade",
  "keen",
  "lucky",
  "mint",
  "navy",
  "opal",
  "peach",
];
const animals = [
  "badger",
  "bear",
  "bird",
  "bison",
  "cat",
  "crab",
  "crow",
  "deer",
  "dog",
  "dove",
  "duck",
  "elk",
  "finch",
  "fox",
  "frog",
  "gecko",
  "goat",
  "hare",
  "heron",
  "ibis",
  "koala",
  "lynx",
  "mole",
  "newt",
  "otter",
  "owl",
  "panda",
  "pika",
  "seal",
  "swan",
  "tiger",
  "whale",
];
const colors = [
  "#8EDAB8",
  "#EAC58A",
  "#AFC8F3",
  "#E3A9C5",
  "#BECA8E",
  "#C3AFEE",
  "#9ACFD8",
  "#EBAE92",
];
const phrases = [
  "The little arrows are busy today.",
  "I brought a pocket full of pretend coins.",
  "Keeping an eye on the emote board.",
  "That ticker has some bounce.",
  "The quiet corner is my favorite seat.",
  "A fresh wave of chat just arrived.",
  "Tiny charts, big opinions.",
  "Watching the tape with a cup of tea.",
  "I like this pace for the opening lap.",
  "The next emote could be a surprise.",
  "My imaginary portfolio needs a nap.",
  "There is room for one more on the board.",
];
export function initialSimulatorState(run = 0): SimulatorState {
  return {
    running: false,
    config: { seed: 42, scenario: freePlay.id, ...structuredClone(freePlay.defaults) },
    run,
    serial: 0,
    rng: 42,
    epoch: 0,
    elapsedMs: 0,
    messageIndex: 0,
    eventCount: 0,
    chatMessageCount: 0,
    lastEvent: null,
    emotes: [],
  };
}
export function validateSimConfig(config: SimConfig, scenario: SimScenario) {
  if (
    !Number.isSafeInteger(config.seed) ||
    config.seed < 0 ||
    config.seed > 0xffff_ffff ||
    !Number.isFinite(config.rate) ||
    config.rate < 0.2 ||
    config.rate > 50 ||
    !Number.isInteger(config.chatters) ||
    config.chatters < 1 ||
    config.chatters > 500 ||
    config.scenario !== scenario.id ||
    !config.mix ||
    [config.mix.plain, config.mix.emote, config.mix.follow, config.mix.raid].some(
      (weight) => !Number.isFinite(weight) || weight < 0 || weight > 100,
    ) ||
    Object.values(config.mix).reduce((sum, value) => sum + value, 0) <= 0
  )
    throw new Error("Invalid simulator settings.");
}
export function stepSimulator(
  previous: SimulatorState,
  input: Input,
  now: number,
  scenario: SimScenario = freePlay,
): { state: SimulatorState; events: ChatEvent[] } {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid simulator clock.");
  let state = { ...previous };
  const events: ChatEvent[] = [];
  const random = () => {
    state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
    return state.rng / 0x1_0000_0000;
  };
  const user = (index: number) => {
    const slot =
      ((Math.floor(index) % state.config.chatters) + state.config.chatters) % state.config.chatters;
    const name = (slot + (state.config.seed % 512)) % 512;
    const login = `sim_${adjectives[Math.floor(name / 32)]}_${animals[name % 32]}`;
    return {
      id: `sim:${state.config.seed}:${state.run}:chatter:${slot}`,
      login,
      displayName: login,
      color: colors[name % colors.length],
      isBroadcaster: false,
      isMod: false,
      isVip: false,
      isSubscriber: false,
    };
  };
  const push = (value: Omit<ChatEvent, "id" | "at" | "origin">, at: number) => {
    const event = {
      ...value,
      id: `sim:${state.config.seed}:${state.run}:${++state.serial}`,
      at,
      origin: "sim",
    } as ChatEvent;
    events.push(event);
    state.eventCount++;
    if (event.type === "ChatMessage") state.chatMessageCount++;
    state.lastEvent = { type: event.type, at };
  };
  const emit = (action: SimAction, at: number) => {
    if (action.type === "chat") {
      const text = [...action.text].slice(0, 500).join("");
      const catalog = new Map(state.emotes.map((emote) => [emote.name, emote]));
      const parts: MessagePart[] = text
        .split(/(\s+)/)
        .filter(Boolean)
        .map((word) => {
          const emote = catalog.get(word);
          return emote ? { type: "emote", text: word, ...emote } : { type: "text", text: word };
        });
      push(
        {
          type: "ChatMessage",
          messageId: `sim:${state.config.seed}:${state.run}:${state.serial + 1}:message`,
          chatter: user(action.chatter),
          text,
          parts,
          command: parseCommand(text),
          foreign: false,
          selfSent: false,
        } as Omit<Extract<ChatEvent, { type: "ChatMessage" }>, "id" | "at" | "origin">,
        at,
      );
    } else if (action.type === "follow")
      push(
        { type: "Follow", user: user(action.chatter) } as Omit<
          Extract<ChatEvent, { type: "Follow" }>,
          "id" | "at" | "origin"
        >,
        at,
      );
    else if (action.type === "raid")
      push(
        { type: "Raid", from: user(action.chatter), viewers: action.viewers } as Omit<
          Extract<ChatEvent, { type: "Raid" }>,
          "id" | "at" | "origin"
        >,
        at,
      );
    else if (action.type === "online" || action.type === "offline")
      push({ type: action.type === "online" ? "StreamOnline" : "StreamOffline" }, at);
    else if (action.type === "delete")
      push(
        {
          type: "MessageDeleted",
          messageId: action.messageId,
          userId: user(action.chatter).id,
        } as Omit<Extract<ChatEvent, { type: "MessageDeleted" }>, "id" | "at" | "origin">,
        at,
      );
    else if (action.type === "clear-user")
      push(
        { type: "UserCleared", userId: user(action.chatter).id } as Omit<
          Extract<ChatEvent, { type: "UserCleared" }>,
          "id" | "at" | "origin"
        >,
        at,
      );
    else push({ type: "ChatCleared" }, at);
  };
  const connection = (status: string, detail: string, at: number) =>
    push(
      { type: "ConnectionChanged", status, detail } as Omit<
        Extract<ChatEvent, { type: "ConnectionChanged" }>,
        "id" | "at" | "origin"
      >,
      at,
    );
  if (input.type === "start") {
    validateSimConfig(input.config, scenario);
    if (!input.emotes.length || input.emotes.length > 1000)
      throw new Error("Simulator needs a bounded emote set.");
    state = {
      ...initialSimulatorState(previous.run + 1),
      config: structuredClone(input.config),
      emotes: structuredClone(input.emotes) as Emote[],
      running: true,
      rng: input.config.seed,
      epoch: now,
    };
    connection("connected", "Simulator started.", now);
    for (const action of scenario.initial ?? []) emit(action, now);
  } else if (input.type === "stop" && state.running) {
    state.running = false;
    state.elapsedMs = Math.max(state.elapsedMs, now - state.epoch);
    connection("disconnected", "Simulator stopped.", now);
  } else if (input.type === "inject" && state.running) emit(input.action, now);
  else if (input.type === "tick" && state.running) {
    const end = Math.min(now, state.epoch + (scenario.durationMs ?? Infinity));
    let batch = 0;
    while (
      state.epoch + Math.round(((state.messageIndex + 1) * 1000) / state.config.rate) <= end &&
      batch++ < 250
    ) {
      const at = state.epoch + Math.round(((state.messageIndex + 1) * 1000) / state.config.rate);
      const total = Object.values(state.config.mix).reduce((sum, value) => sum + value, 0);
      let weight = random() * total;
      let persona: keyof SimConfig["mix"] = "raid";
      for (const candidate of ["plain", "emote", "follow", "raid"] as const) {
        weight -= state.config.mix[candidate];
        if (weight < 0) {
          persona = candidate;
          break;
        }
      }
      const chatter = Math.floor(random() * state.config.chatters);
      if (persona === "follow") emit({ type: "follow", chatter }, at);
      if (persona === "raid")
        emit({ type: "raid", chatter, viewers: 1 + Math.floor(random() * 100) }, at);
      let message: Extract<SimAction, { type: "chat" }>;
      for (const action of scenario.beforeMessage?.({
        index: state.messageIndex,
        elapsedMs: at - state.epoch,
        persona,
        chatters: state.config.chatters,
        emotes: state.emotes,
        random,
      }) ?? [])
        emit(action, at);
      if (scenario.message)
        message = scenario.message({
          index: state.messageIndex,
          elapsedMs: at - state.epoch,
          persona,
          chatters: state.config.chatters,
          emotes: state.emotes,
          random,
        });
      else if (persona === "emote") {
        const emote = state.emotes[Math.floor(random() * state.emotes.length)];
        message = {
          type: "chat",
          chatter,
          text: Array(1 + Math.floor(random() * 4))
            .fill(emote.name)
            .join(" "),
        };
      } else
        message = { type: "chat", chatter, text: phrases[Math.floor(random() * phrases.length)] };
      emit(message, at);
      state.messageIndex++;
    }
    state.elapsedMs = Math.max(state.elapsedMs, end - state.epoch);
    const caughtUp =
      state.epoch + Math.round(((state.messageIndex + 1) * 1000) / state.config.rate) > end;
    if (scenario.durationMs !== undefined && now >= state.epoch + scenario.durationMs && caughtUp) {
      for (const action of scenario.finish ?? []) emit(action, end);
      state.running = false;
      connection("disconnected", "Simulator scenario finished.", end);
    }
  }
  return { state, events };
}
