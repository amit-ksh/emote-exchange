import type { ChatEvent } from "@emote-exchange/twitch-kit";
import type { Credit, Holding, Listing, MarketEffect, MarketState } from "./market.ts";

export interface Cause {
  id: string;
  origin: ChatEvent["origin"];
}
export interface AccountChanges {
  traders: Set<string>;
  holdings: Holding[];
  credits: Credit[];
  firstMessages: { userId: string; at: number }[];
}
export const accountChanges = (): AccountChanges => ({
  traders: new Set(),
  holdings: [],
  credits: [],
  firstMessages: [],
});
export function credit(
  state: MarketState,
  userId: string,
  requested: bigint,
  kind: Credit["kind"],
  now: number,
  cause: Cause,
  changes: AccountChanges,
) {
  const trader = state.traders.get(userId);
  if (!trader || requested < 0n) throw new Error("Invalid credit.");
  const room = BigInt(1_000_000_000 - trader.coins);
  const coins = Number(requested < room ? requested : room);
  state.traders.set(userId, { ...trader, coins: trader.coins + coins });
  changes.traders.add(userId);
  changes.credits.push({
    id: `${cause.id}:${kind}:${encodeURIComponent(userId)}`,
    at: now,
    origin: cause.origin,
    userId,
    kind,
    coins,
  });
  return coins;
}
export function settleDelist(
  state: MarketState,
  listing: Listing,
  now: number,
  cause: Cause,
  changes: AccountChanges,
) {
  const ticker = listing.emote.name;
  const cents = Math.round(listing.price * 100);
  if (!Number.isSafeInteger(cents)) throw new Error("Invalid Delist Price.");
  for (const [userId, holdings] of state.holdings) {
    const holding = holdings.get(ticker);
    if (!holding) continue;
    credit(
      state,
      userId,
      (BigInt(cents) * BigInt(holding.shares)) / 100n,
      "delist",
      now,
      { ...cause, id: `${cause.id}:${encodeURIComponent(ticker)}` },
      changes,
    );
    holdings.delete(ticker);
    if (!holdings.size) state.holdings.delete(userId);
    changes.holdings.push({ userId, ticker, shares: 0, costBasis: 0 });
  }
}
export function accountWrites(
  write: Extract<MarketEffect, { type: "persist" }>,
  state: MarketState,
  changes: AccountChanges,
) {
  write.traders = [
    ...new Set([...write.traders.map((trader) => trader.id), ...changes.traders]),
  ].flatMap((id) => {
    const trader = state.traders.get(id);
    return trader ? [{ ...trader }] : [];
  });
  write.holdings.push(...changes.holdings.map((holding) => ({ ...holding })));
  write.credits = changes.credits.map((row) => ({ ...row }));
  write.firstMessages = changes.firstMessages.map((row) => ({ ...row }));
  return write;
}
