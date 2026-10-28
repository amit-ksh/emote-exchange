import type { ChatEvent } from "@emote-exchange/twitch-kit";
import type { AccountChanges } from "./accounts.ts";
import { credit } from "./accounts.ts";
import type { MarketMoment, MarketSay, MarketState, Trader } from "./market.ts";
import { touchTrader } from "./rewards.ts";

export function shownStreak(state: MarketState, trader: Trader): number | null {
  return trader.lastGreetingStreamNo !== null &&
    trader.lastGreetingStreamNo >= state.streamNo - 1 &&
    trader.lastGreetingStreamNo <= state.streamNo
    ? trader.greetingStreak
    : null;
}
export function greeting(
  state: MarketState,
  input: Extract<ChatEvent, { type: "ChatMessage" }>,
  now: number,
  accounts: AccountChanges,
  moments: MarketMoment[],
): MarketSay {
  const reply = (text: string): MarketSay => ({
    type: "say",
    origin: input.origin,
    priority: "reply",
    userId: input.chatter.id,
    replyParentMessageId: input.messageId,
    text,
  });
  if (!input.command?.args.some((word) => word.trim().length > 0))
    return reply("Say hello with a few words: !greetings good morning");
  if (!state.session || state.session.closedAt !== null)
    return reply("The market is closed. Say hello after the opening bell.");
  const existing = state.traders.get(input.chatter.id);
  if (existing?.frozen) return reply("Your Trader is frozen.");
  if (existing?.lastGreetingStreamNo === state.streamNo)
    return reply(
      `@${existing.login} you already said hello this Stream. Streak ${existing.greetingStreak}.`,
    );
  const trader = touchTrader(state, input.chatter, input.origin, now, input.chatter.color);
  const streak = trader.lastGreetingStreamNo === state.streamNo - 1 ? trader.greetingStreak + 1 : 1;
  state.traders.set(trader.id, {
    ...trader,
    greetingStreak: streak,
    lastGreetingStreamNo: state.streamNo,
  });
  const requested =
    state.settings.GREETING_BASE +
    state.settings.GREETING_STREAK_STEP *
      (Math.min(streak, state.settings.GREETING_STREAK_CAP) - 1);
  const coins = credit(state, trader.id, BigInt(requested), "greeting", now, input, accounts);
  moments.push({
    id: `${input.id}:greeting`,
    at: now,
    origin: input.origin,
    kind: "GREETING",
    userId: trader.id,
    name: trader.displayName,
    streak,
    coins,
  });
  return reply(`@${trader.login} good to see you. Streak ${streak}, +${coins} Coins.`);
}
