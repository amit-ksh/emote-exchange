import { readFrame, record } from "./protocol.ts";

export interface Emote {
  key: string;
  name: string;
  imageUrl: string;
  animated: boolean;
}
export interface User {
  id: string;
  login: string;
  displayName: string;
}
export type MessagePart =
  | { type: "text"; text: string }
  | ({ type: "emote"; text: string } & Emote)
  | { type: "mention"; text: string; user: User };
interface Envelope {
  id: string;
  at: number;
  origin: "twitch" | "sim";
}
export type ChatEvent = Envelope &
  (
    | {
        type: "ChatMessage";
        messageId: string;
        chatter: User & {
          color: string;
          isBroadcaster: boolean;
          isMod: boolean;
          isVip: boolean;
          isSubscriber: boolean;
        };
        text: string;
        parts: MessagePart[];
        command: ReturnType<typeof parseCommand>;
        foreign: boolean;
        selfSent: boolean;
      }
    | { type: "Follow"; user: User }
    | { type: "Raid"; from: User; viewers: number }
    | { type: "StreamOnline" | "StreamOffline" | "ChatCleared" }
    | { type: "MessageDeleted"; messageId: string; userId: string }
    | { type: "UserCleared"; userId: string }
    | { type: "ConnectionChanged"; status: string; detail: string }
  );
export interface NormalizerOptions {
  broadcasterId: string;
  botId?: string;
  wasSent?: (messageId: string) => boolean;
  lookupEmote?: (word: string) => Emote | undefined;
}
const text = (value: unknown, cap = 500) => (typeof value === "string" ? value.slice(0, cap) : "");
function user(event: Record<string, unknown>, prefix: string): User | null {
  const id = text(event[`${prefix}_id`], 128);
  const login = text(event[`${prefix}_login`], 64);
  const displayName = text(event[`${prefix}_name`], 64);
  return id && login && displayName ? { id, login, displayName } : null;
}
export function parseCommand(value: string): { name: string; args: string[] } | null {
  if (!/^![a-z]/i.test(value)) return null;
  const [name, ...args] = value.slice(1).trim().split(/\s+/);
  return { name: name.toLowerCase(), args };
}
export function normalizeEvent(value: unknown, options: NormalizerOptions): ChatEvent | null {
  const frame = readFrame(value);
  if (frame?.metadata.message_type !== "notification") return null;
  const subscription = record(frame.payload.subscription);
  const event = record(frame.payload.event);
  const envelope: Envelope = {
    id: frame.metadata.message_id,
    at: Date.parse(frame.metadata.message_timestamp),
    origin: "twitch",
  };
  if (
    (subscription.type === "channel.raid"
      ? event.to_broadcaster_user_id
      : event.broadcaster_user_id) !== options.broadcasterId
  )
    return null;
  if (subscription.type === "channel.chat.message") {
    const chatter = user(event, "chatter_user");
    const messageId = text(event.message_id, 128);
    const message = record(event.message);
    if (
      !chatter ||
      !messageId ||
      typeof message.text !== "string" ||
      !Array.isArray(message.fragments)
    )
      return null;
    const parts: MessagePart[] = [];
    let remaining = 500;
    for (const entry of message.fragments.slice(0, 500)) {
      const fragment = record(entry);
      const content = text(fragment.text, remaining);
      remaining -= content.length;
      if (!content) continue;
      const emote = record(fragment.emote);
      const mention = user(record(fragment.mention), "user");
      if (fragment.type === "emote" && typeof emote.id === "string" && emote.id.length <= 128) {
        const animated = Array.isArray(emote.format) && emote.format.includes("animated");
        parts.push({
          type: "emote",
          text: content,
          key: `twitch:${emote.id}`,
          name: content,
          animated,
          imageUrl: `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(emote.id)}/${animated ? "animated" : "static"}/dark/3.0`,
        });
      } else if (fragment.type === "mention" && mention)
        parts.push({ type: "mention", text: content, user: mention });
      else {
        for (const word of content.split(/(\s+)/).filter(Boolean)) {
          const match = /^\s+$/.test(word) ? undefined : options.lookupEmote?.(word);
          if (match) parts.push({ type: "emote", text: word, ...match });
          else if (parts.at(-1)?.type === "text") (parts.at(-1) as { text: string }).text += word;
          else parts.push({ type: "text", text: word });
        }
      }
    }
    const badges = new Set(
      Array.isArray(event.badges) ? event.badges.map((badge) => record(badge).set_id) : [],
    );
    const content = message.text.slice(0, 500);
    return {
      ...envelope,
      type: "ChatMessage",
      messageId,
      chatter: {
        ...chatter,
        color: /^#[\da-f]{6}$/i.test(text(event.color)) ? text(event.color) : "#FFFFFF",
        isBroadcaster: badges.has("broadcaster"),
        isMod: badges.has("moderator"),
        isVip: badges.has("vip"),
        isSubscriber: badges.has("subscriber") || badges.has("founder"),
      },
      text: content,
      parts,
      command: parseCommand(content),
      foreign:
        typeof event.source_broadcaster_user_id === "string" &&
        event.source_broadcaster_user_id !== options.broadcasterId,
      selfSent: chatter.id === options.botId || (options.wasSent?.(messageId) ?? false),
    };
  }
  if (subscription.type === "channel.follow") {
    const follower = user(event, "user");
    return follower ? { ...envelope, type: "Follow", user: follower } : null;
  }
  if (subscription.type === "channel.raid") {
    const from = user(event, "from_broadcaster_user");
    return from && Number.isSafeInteger(event.viewers) && (event.viewers as number) >= 0
      ? { ...envelope, type: "Raid", from, viewers: event.viewers as number }
      : null;
  }
  if (subscription.type === "stream.online" || subscription.type === "stream.offline")
    return {
      ...envelope,
      type: subscription.type === "stream.online" ? "StreamOnline" : "StreamOffline",
    };
  return null;
}
