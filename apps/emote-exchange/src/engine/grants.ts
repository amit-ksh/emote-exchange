import type { ChatEvent } from "@emote-exchange/twitch-kit";
import type { AccountChanges } from "./accounts.ts";
import { credit } from "./accounts.ts";
import type { MarketEffect, MarketInput, MarketMoment, MarketSay, MarketState } from "./market.ts";

type Grant = Extract<MarketInput, { type: "Grant" }>;
export function grantCommand(
  state: MarketState,
  input: Extract<ChatEvent, { type: "ChatMessage" }>,
): { action?: Grant; say?: MarketSay } {
  const reply = (text: string) => ({
    say: {
      type: "say" as const,
      origin: input.origin,
      priority: "reply" as const,
      userId: input.chatter.id,
      replyParentMessageId: input.messageId,
      text,
    },
  });
  if (!input.chatter.isBroadcaster) return reply("Only the broadcaster can use that command.");
  const [name, quantity, ...rest] = input.command?.args ?? [];
  if (
    !name ||
    !quantity ||
    rest.length ||
    !/^\d+$/.test(quantity) ||
    !Number.isSafeInteger(Number(quantity)) ||
    Number(quantity) < 1 ||
    Number(quantity) > state.settings.GRANT_MAX
  )
    return reply(`Use !grant @user N, from 1 to ${state.settings.GRANT_MAX} Coins.`);
  const mention = input.parts.find(
    (part) =>
      part.type === "mention" &&
      part.text.replace(/^@/, "").toLowerCase() === name.replace(/^@/, "").toLowerCase(),
  );
  const trader =
    mention?.type === "mention"
      ? state.traders.get(mention.user.id)
      : [...state.traders.values()].find(
          (row) => row.login.toLowerCase() === name.replace(/^@/, "").toLowerCase(),
        );
  if (!trader) return reply("Unknown Trader.");
  return {
    action: {
      type: "Grant",
      id: input.id,
      origin: input.origin,
      userId: trader.id,
      amount: Number(quantity),
      source: "chat",
      requestId: input.messageId,
      replyUserId: input.chatter.id,
      replyParentMessageId: input.messageId,
    },
  };
}
export function grant(
  state: MarketState,
  input: Grant,
  now: number,
  changes: AccountChanges,
  moments: MarketMoment[],
): { record?: Extract<MarketEffect, { type: "persist" }>["grants"][number]; say?: MarketSay } {
  if (
    !Number.isSafeInteger(input.amount) ||
    input.amount < 1 ||
    input.amount > state.settings.GRANT_MAX ||
    !/^[\w:.-]{1,128}$/.test(input.requestId)
  )
    throw new Error("Invalid Grant.");
  if (state.grantRequests.has(input.requestId)) return {};
  const trader = state.traders.get(input.userId);
  if (!trader) throw new Error("Unknown Trader.");
  state.grantRequests = new Set(state.grantRequests).add(input.requestId);
  const origin = trader.isSim || trader.login.startsWith("sim_") ? "sim" : input.origin;
  const amount = credit(
    state,
    trader.id,
    BigInt(input.amount),
    "grant",
    now,
    { id: `grant:${input.requestId}`, origin },
    changes,
  );
  const record = {
    id: `grant:${input.requestId}`,
    at: now,
    userId: trader.id,
    amount,
    source: input.source,
    requestId: input.requestId,
  };
  moments.push({
    id: record.id,
    at: now,
    origin,
    kind: "GRANT",
    userId: trader.id,
    name: trader.displayName,
    coins: amount,
  });
  return {
    record,
    say: {
      type: "say",
      origin,
      priority: "reply",
      userId: input.replyUserId ?? trader.id,
      replyParentMessageId: input.replyParentMessageId,
      text: `@${trader.login} received ${amount} Coins from the streamer.`,
    },
  };
}
