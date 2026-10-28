import type { ChatEvent } from "@emote-exchange/twitch-kit";
import type { Holding, MarketMoment, MarketSay, MarketState, Trade } from "./market.ts";
import { settlement } from "./money.ts";

export interface TradeResult {
  trades: Trade[];
  holdings: Holding[];
  moments: MarketMoment[];
  says: MarketSay[];
}
export function trade(
  state: MarketState,
  input: Extract<ChatEvent, { type: "ChatMessage" }>,
  now: number,
): TradeResult {
  const result: TradeResult = { trades: [], holdings: [], moments: [], says: [] };
  const reply = (text: string) => {
    result.says.push({
      type: "say",
      text,
      userId: input.chatter.id,
      origin: input.origin,
      priority: "reply",
      replyParentMessageId: input.messageId,
    });
    return result;
  };
  const trader = state.traders.get(input.chatter.id);
  if (!trader || !input.command) return result;
  if (state.paused) return reply("Market paused.");
  if (trader.frozen) return reply("Trader frozen.");
  const [ticker, quantity] = input.command.args;
  const exact = state.listings.get(ticker);
  const matches = ticker
    ? [...state.listings.values()].filter(
        (listing) => listing.emote.name.toLowerCase() === ticker.toLowerCase(),
      )
    : [];
  const listing = exact ?? (matches.length === 1 ? matches[0] : undefined);
  if (!listing) return reply("Unknown ticker. Try !market");
  if (listing.haltedUntil > now)
    return reply(`Ticker halted for ${Math.ceil((listing.haltedUntil - now) / 1000)}s.`);
  const name = listing.emote.name;
  const side = input.command.name === "sell" ? "sell" : "buy";
  if ((state.cooldowns.get(trader.id) ?? 0) > now)
    return reply(
      `Wait ${Math.ceil(((state.cooldowns.get(trader.id) ?? now) - now) / 1000)}s before another trade.`,
    );
  const holdings = state.holdings.get(trader.id) ?? new Map<string, Holding>();
  const existing = holdings.get(name);
  let shares: number;
  if (input.command.args.length !== 2) return reply("Use a ticker and a positive whole quantity.");
  if (side === "buy" && quantity?.toLowerCase() === "max") {
    let low = 0;
    let high = 1_000_000;
    while (low < high) {
      const candidate = Math.ceil((low + high) / 2);
      if (settlement(listing.price, candidate, state.settings.FEE).debit <= BigInt(trader.coins))
        low = candidate;
      else high = candidate - 1;
    }
    shares = low;
    if (!shares) return reply("Not enough Coins.");
  } else if (side === "sell" && quantity?.toLowerCase() === "all") shares = existing?.shares ?? 0;
  else {
    if (!/^\d+$/.test(quantity ?? "") || Number(quantity) < 1)
      return reply("Use a positive whole quantity.");
    shares = Number(quantity);
  }
  if (!Number.isSafeInteger(shares) || shares > 1_000_000)
    return reply("Quantity limit is 1,000,000 shares.");
  if (side === "sell" && (!existing || shares < 1 || shares > existing.shares))
    return reply("Not enough shares.");
  const { debit, proceeds } = settlement(listing.price, shares, state.settings.FEE);
  if (side === "buy" && debit > BigInt(trader.coins)) return reply("Not enough Coins.");
  const coins =
    side === "buy"
      ? Number(debit)
      : Number(
          proceeds < BigInt(1_000_000_000 - trader.coins)
            ? proceeds
            : BigInt(1_000_000_000 - trader.coins),
        );
  const holding: Holding =
    side === "buy"
      ? {
          userId: trader.id,
          ticker: name,
          shares: (existing?.shares ?? 0) + shares,
          costBasis: (existing?.costBasis ?? 0) + coins,
        }
      : {
          userId: trader.id,
          ticker: name,
          shares: (existing?.shares ?? 0) - shares,
          costBasis:
            (existing?.costBasis ?? 0) -
            Number(
              (BigInt(existing?.costBasis ?? 0) * BigInt(shares)) / BigInt(existing?.shares ?? 1),
            ),
        };
  if (!Number.isSafeInteger(holding.shares) || !Number.isSafeInteger(holding.costBasis))
    return reply("Holding limit reached.");
  trader.coins += side === "buy" ? -coins : coins;
  if (holding.shares) holdings.set(name, holding);
  else holdings.delete(name);
  if (holdings.size) state.holdings.set(trader.id, holdings);
  else state.holdings.delete(trader.id);
  state.cooldowns.set(trader.id, now + state.settings.TRADE_COOLDOWN_MS);
  const fill: Trade = {
    id: `${input.id}:trade`,
    at: now,
    origin: input.origin,
    userId: trader.id,
    ticker: name,
    side,
    shares,
    price: listing.price,
    coins,
  };
  listing.impact = Math.max(
    -0.5,
    Math.min(
      1,
      listing.impact + ((side === "buy" ? 1 : -1) * state.settings.IMPACT_PER_100 * shares) / 100,
    ),
  );
  listing.price = Math.round(Math.max(1, listing.base * (1 + listing.impact)) * 100) / 100;
  result.trades.push(fill);
  result.holdings.push(holding);
  const moment: MarketMoment = {
    id: fill.id,
    at: now,
    origin: input.origin,
    kind: "TRADE",
    ticker: name,
    price: fill.price,
    userId: trader.id,
    name: trader.displayName,
    side: fill.side,
    shares,
    coins,
  };
  result.moments.push(moment);
  return reply(
    `@${trader.login} ${side.toUpperCase()} ${shares} ${name} @ ${fill.price.toFixed(2)} (${coins} Coins).`,
  );
}
