import type { ChatEvent } from "@emote-exchange/twitch-kit";
import type { AccountChanges } from "./accounts.ts";
import { credit } from "./accounts.ts";
import type { MarketMoment, MarketState, Trader } from "./market.ts";

export function touchTrader(
  state: MarketState,
  user: { id: string; login: string; displayName: string },
  origin: ChatEvent["origin"],
  now: number,
  color?: string,
): Trader {
  const existing = state.traders.get(user.id);
  const trader: Trader = {
    greetingStreak: existing?.greetingStreak ?? 0,
    lastGreetingStreamNo: existing?.lastGreetingStreamNo ?? null,
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    color: color ?? existing?.color ?? "#A6B3A8",
    coins: existing?.coins ?? state.settings.STARTING_COINS,
    createdAt: existing?.createdAt ?? now,
    lastActiveAt: now,
    isSim: existing?.isSim ?? origin === "sim",
    frozen: existing?.frozen ?? false,
    sessionOpenWorth: existing ? existing.sessionOpenWorth : String(state.settings.STARTING_COINS),
  };
  state.traders.set(user.id, trader);
  return trader;
}
export function advanceRewards(state: MarketState, now: number, changes: AccountChanges) {
  const minute = Math.floor(now / 60_000) * 60_000;
  for (const [id, participation] of state.participation) {
    if (participation.minuteStart >= minute) continue;
    credit(
      state,
      id,
      BigInt(state.settings.STIPEND_COINS),
      "stipend",
      participation.minuteStart + 60_000,
      { id: `stipend:${participation.minuteStart}`, origin: participation.origin },
      changes,
    );
    state.participation.delete(id);
  }
  if (state.raidUntil <= now) state.raidUntil = 0;
}
export function observeMessage(
  state: MarketState,
  input: Extract<ChatEvent, { type: "ChatMessage" }>,
  now: number,
  changes: AccountChanges,
  moments: MarketMoment[],
) {
  if (input.foreign || input.selfSent) return;
  if (state.firstMessages.has(input.chatter.id)) return;
  state.firstMessages.set(input.chatter.id, now);
  changes.firstMessages.push({ userId: input.chatter.id, at: now });
  if (now >= state.raidUntil) return;
  const trader = touchTrader(state, input.chatter, input.origin, now, input.chatter.color);
  const coins = credit(
    state,
    trader.id,
    BigInt(state.settings.RAID_VISA_COINS),
    "visa",
    now,
    input,
    changes,
  );
  moments.push({
    id: `${input.id}:visa`,
    at: now,
    origin: input.origin,
    kind: "VISA",
    userId: trader.id,
    name: trader.displayName,
    coins,
  });
}
export function followOrRaid(
  state: MarketState,
  input: ChatEvent,
  now: number,
  changes: AccountChanges,
  moments: MarketMoment[],
) {
  if (input.type === "Follow") {
    const trader = touchTrader(state, input.user, input.origin, now);
    const coins = credit(
      state,
      trader.id,
      BigInt(state.settings.FOLLOW_COINS),
      "follow",
      now,
      input,
      changes,
    );
    moments.push({
      id: `${input.id}:follow`,
      at: now,
      origin: input.origin,
      kind: "FOLLOW",
      userId: trader.id,
      name: trader.displayName,
      coins,
    });
  } else if (input.type === "Raid") {
    state.raidUntil = now + state.settings.RAID_WINDOW_MS;
    moments.push({
      id: `${input.id}:raid`,
      at: now,
      origin: input.origin,
      kind: "RAID",
      name: input.from.displayName,
      viewers: input.viewers,
    });
  }
}
