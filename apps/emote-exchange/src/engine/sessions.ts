import type { ChatEvent } from "@emote-exchange/twitch-kit";
import type {
  MarketMoment,
  MarketSay,
  MarketSession,
  MarketState,
  SessionSummary,
} from "./market.ts";

const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export function netWorth(state: MarketState, userId: string): bigint {
  const trader = state.traders.get(userId);
  let cents = BigInt(trader?.coins ?? 0) * 100n;
  for (const holding of state.holdings.get(userId)?.values() ?? [])
    cents +=
      BigInt(Math.round((state.listings.get(holding.ticker)?.price ?? 0) * 100)) *
      BigInt(holding.shares);
  return cents / 100n;
}
function summary(state: MarketState): SessionSummary {
  const listings = [...state.listings.values()].map((listing) => ({
    ticker: listing.emote.name,
    changePercent: (listing.price / listing.sessionOpenPrice - 1) * 100,
  }));
  const gainers = [...listings].sort(
    (a, b) => b.changePercent - a.changePercent || order(a.ticker, b.ticker),
  );
  const losers = [...listings].sort(
    (a, b) => a.changePercent - b.changePercent || order(a.ticker, b.ticker),
  );
  const traders = [...state.traders.values()]
    .map((trader) => ({ trader, worth: netWorth(state, trader.id) }))
    .sort((a, b) =>
      a.worth > b.worth ? -1 : a.worth < b.worth ? 1 : order(a.trader.id, b.trader.id),
    );
  const first = traders[0];
  const cap = BigInt(Number.MAX_SAFE_INTEGER);
  return {
    topGainer: gainers[0] ?? null,
    biggestCrash: losers[0] ?? null,
    richest: first
      ? {
          userId: first.trader.id,
          name: first.trader.login,
          // biome-ignore lint/complexity/useMathMinMax: Math.min cannot compare bigint values.
          netWorth: Number(first.worth < cap ? first.worth : cap),
          capped: first.worth > cap,
        }
      : null,
  };
}
const percent = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value)}%`;
export function bell(
  state: MarketState,
  input: Pick<ChatEvent, "id" | "origin" | "type">,
  now: number,
  moments: MarketMoment[],
): { sessions: MarketSession[]; says: MarketSay[] } {
  if (input.type === "StreamOnline") {
    for (const trader of state.traders.values())
      state.traders.set(trader.id, {
        ...trader,
        sessionOpenWorth: netWorth(state, trader.id).toString(),
      });
    for (const listing of state.listings.values()) {
      listing.sessionOpenPrice = listing.price;
      listing.moonFired = false;
      listing.crashFired = false;
    }
    const previous =
      state.session && state.session.closedAt === null ? [{ ...state.session, closedAt: now }] : [];
    state.session = { id: `${input.id}:session`, openedAt: now, closedAt: null, summary: null };
    moments.push({
      id: `${input.id}:open`,
      at: now,
      origin: input.origin,
      kind: "BELL",
      phase: "open",
    });
    return { sessions: [...previous, structuredClone(state.session)], says: [] };
  }
  if (state.session?.closedAt !== null && state.session !== null) return { sessions: [], says: [] };
  const result = summary(state);
  state.session = {
    id: state.session?.id ?? `${input.id}:session`,
    openedAt: state.session?.openedAt ?? state.startedAt,
    closedAt: now,
    summary: result,
  };
  moments.push({
    id: `${input.id}:close`,
    at: now,
    origin: input.origin,
    kind: "BELL",
    phase: "close",
    summary: structuredClone(result),
  });
  const gain = result.topGainer
    ? `${result.topGainer.ticker} ${percent(result.topGainer.changePercent)}`
    : "none";
  const loss = result.biggestCrash
    ? `${result.biggestCrash.ticker} ${percent(result.biggestCrash.changePercent)}`
    : "none";
  const richest = result.richest
    ? `@${result.richest.name} (${result.richest.capped ? ">=" : ""}${result.richest.netWorth.toLocaleString("en-US")} Coins)`
    : "none";
  return {
    sessions: [structuredClone(state.session)],
    says: [
      {
        type: "say",
        origin: input.origin,
        priority: "ambient",
        text: `Closing bell: top gainer ${gain}, biggest crash ${loss}, richest ${richest}.`,
      },
    ],
  };
}
