import type { MarketState } from "./engine/market.ts";
import { marketDisplay } from "./engine/market.ts";
import { netWorth } from "./engine/sessions.ts";

export function marketProjection(state: MarketState, status: "ready" | "storage-error" = "ready") {
  return {
    ...marketDisplay(state),
    status,
    listings: [...state.listings.values()].map((listing) => ({
      ticker: listing.emote.name,
      imageUrl: listing.emote.imageUrl,
      price: listing.price,
      heat: listing.heat,
      sessionChangePercent: (listing.price / listing.sessionOpenPrice - 1) * 100,
      haltedUntil: listing.haltedUntil,
      holders: [...state.holdings.values()].filter((holdings) => holdings.has(listing.emote.name))
        .length,
      candles: listing.candles.map((candle) => ({ ...candle })),
    })),
    traders: [...state.traders.values()].map((trader) => {
      const worth = netWorth(state, trader.id);
      let safeWorth = worth;
      if (safeWorth > BigInt(Number.MAX_SAFE_INTEGER)) safeWorth = BigInt(Number.MAX_SAFE_INTEGER);
      return {
        userId: trader.id,
        name: trader.displayName,
        login: trader.login,
        color: trader.color,
        coins: trader.coins,
        frozen: trader.frozen,
        isSim: trader.isSim,
        netWorth: Number(safeWorth),
        capped: worth > safeWorth,
        holdings: [...(state.holdings.get(trader.id)?.values() ?? [])].map((holding) => ({
          ticker: holding.ticker,
          shares: holding.shares,
          costBasis: holding.costBasis,
        })),
      };
    }),
  };
}
