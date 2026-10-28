import type { Emote } from "@emote-exchange/twitch-kit";
import type {
  Candle,
  Holding,
  ListingWrite,
  MarketSession,
  MarketState,
  Trader,
} from "./market.ts";
import { initialMarketState } from "./market.ts";

export interface MarketRows {
  grantRequestIds?: string[];
  checkpoint: string | null;
  traders: Trader[];
  listings: ListingWrite[];
  holdings: Holding[];
  candles: (Candle & { ticker: string })[];
  sessions: MarketSession[];
  firstMessages: { userId: string; at: number }[];
}
function checkpointData(state: MarketState) {
  return {
    version: 1,
    at: state.at,
    lastTickAt: state.lastTickAt,
    startedAt: state.startedAt,
    settings: state.settings,
    paused: state.paused,
    raidUntil: state.raidUntil,
    sessionId: state.session?.id ?? null,
    streamNo: state.streamNo,
    streamLastTickAt: state.streamLastTickAt,
    pending: [...state.pending],
    repeats: [...state.repeats].map(([ticker, users]) => [ticker, [...users]] as const),
    cooldowns: [...state.cooldowns],
    replyCooldowns: [...state.replyCooldowns],
    participation: [...state.participation],
    seenEvents: [...state.seenEvents],
    listings: [...state.listings.values()].map((listing) => ({
      ticker: listing.emote.name,
      heat: listing.heat,
      impact: listing.impact,
      lastHaltAt: listing.lastHaltAt,
      moonFired: listing.moonFired,
      crashFired: listing.crashFired,
      lastOrigin: listing.lastOrigin,
      priceHistory: listing.priceHistory,
    })),
  };
}
export const checkpointMarket = (state: MarketState): string =>
  JSON.stringify(checkpointData(state));

function integer(value: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error();
}
function price(value: number) {
  if (
    !Number.isFinite(value) ||
    value < 1 ||
    value > 2_000_000_000 ||
    Math.abs(value * 100 - Math.round(value * 100)) > 1e-5
  )
    throw new Error();
}
function origin(value: string) {
  if (value !== "sim" && value !== "twitch") throw new Error();
}

export function restoreMarket(
  rows: MarketRows,
  now: number,
  catalog: readonly Emote[] = [],
): MarketState {
  if (rows.checkpoint === null) {
    if (
      rows.traders.length ||
      rows.listings.length ||
      rows.holdings.length ||
      rows.sessions.length ||
      rows.candles.length ||
      rows.firstMessages.length
    )
      throw new Error("Market rows have no checkpoint.");
    return initialMarketState({ now, catalog });
  }
  try {
    const saved = JSON.parse(rows.checkpoint) as ReturnType<typeof checkpointData>;
    if (
      saved.version !== 1 ||
      !Number.isSafeInteger(saved.at) ||
      saved.at < 0 ||
      !Number.isSafeInteger(now) ||
      now < saved.at ||
      !Number.isSafeInteger(saved.lastTickAt) ||
      saved.lastTickAt < 0 ||
      saved.lastTickAt > saved.at
    )
      throw new Error();
    const state = initialMarketState({
      now: saved.at,
      catalog,
      settings: saved.settings,
      seedListings: rows.listings,
    });
    integer(saved.startedAt, 0, saved.at);
    integer(saved.raidUntil);
    if (typeof saved.paused !== "boolean") throw new Error();
    for (const entries of [saved.cooldowns, saved.replyCooldowns])
      for (const [id, until] of entries) {
        if (typeof id !== "string") throw new Error();
        integer(until);
      }
    if (saved.seenEvents.length > 2000) throw new Error();
    for (const [id, at] of saved.seenEvents) {
      if (typeof id !== "string") throw new Error();
      integer(at, 0, saved.at);
    }
    for (const [, part] of saved.participation) {
      integer(part.minuteStart, 0, saved.at);
      if (part.minuteStart % 60_000 !== 0) throw new Error();
      origin(part.origin);
    }
    for (const [, users] of saved.repeats)
      for (const [, times] of users) for (const at of times) integer(at, 0, saved.at);
    initialMarketState({
      now: saved.at,
      catalog: saved.pending.map(([, pending]) => pending.emote),
    });
    for (const [ticker, pending] of saved.pending) {
      if (ticker !== pending.emote.name) throw new Error();
      origin(pending.origin);
      for (const use of pending.uses) {
        integer(use.at, 0, saved.at);
        if (
          !Number.isFinite(use.weight) ||
          use.weight < 0 ||
          use.weight > 1 ||
          typeof use.chatterId !== "string"
        )
          throw new Error();
      }
    }
    state.lastTickAt = saved.lastTickAt;
    state.startedAt = saved.startedAt;
    state.grantRequests = new Set(rows.grantRequestIds ?? []);
    state.paused = saved.paused;
    state.raidUntil = saved.raidUntil;
    state.pending = new Map(structuredClone(saved.pending));
    state.repeats = new Map(
      saved.repeats.map(([ticker, users]) => [ticker, new Map(structuredClone(users))]),
    );
    state.cooldowns = new Map(saved.cooldowns);
    state.replyCooldowns = new Map(saved.replyCooldowns);
    state.participation = new Map(structuredClone(saved.participation));
    state.seenEvents = new Map(saved.seenEvents);
    state.firstMessages = new Map(rows.firstMessages.map(({ userId, at }) => [userId, at]));
    state.session = structuredClone(
      rows.sessions.find((session) => session.id === saved.sessionId) ?? null,
    );
    if (saved.sessionId !== null && state.session === null) throw new Error();
    state.streamNo = saved.streamNo ?? state.session?.streamNo ?? 0;
    integer(state.streamNo);
    state.streamLastTickAt = saved.streamLastTickAt ?? saved.lastTickAt;
    integer(state.streamLastTickAt, 0, saved.at);
    if (state.session && state.session.streamNo !== state.streamNo) throw new Error();
    for (const trader of rows.traders) {
      integer(trader.greetingStreak);
      if (trader.lastGreetingStreamNo !== null)
        integer(trader.lastGreetingStreamNo, 0, state.streamNo);
      if (
        trader.sessionOpenWorth !== null &&
        (typeof trader.sessionOpenWorth !== "string" || !/^\d{1,64}$/.test(trader.sessionOpenWorth))
      )
        throw new Error();
      if (!Number.isSafeInteger(trader.coins) || trader.coins < 0 || trader.coins > 1_000_000_000)
        throw new Error();
      integer(trader.createdAt, 0, saved.at);
      integer(trader.lastActiveAt, trader.createdAt, saved.at);
      if (
        typeof trader.id !== "string" ||
        typeof trader.login !== "string" ||
        typeof trader.displayName !== "string" ||
        !/^#[\da-f]{6}$/i.test(trader.color) ||
        typeof trader.frozen !== "boolean" ||
        typeof trader.isSim !== "boolean"
      )
        throw new Error();
      state.traders.set(trader.id, { ...trader });
    }
    for (const holding of rows.holdings) {
      if (
        !state.traders.has(holding.userId) ||
        !state.listings.has(holding.ticker) ||
        !Number.isSafeInteger(holding.shares) ||
        holding.shares < 1 ||
        !Number.isSafeInteger(holding.costBasis) ||
        holding.costBasis < 0
      )
        throw new Error();
      const holdings = state.holdings.get(holding.userId) ?? new Map();
      holdings.set(holding.ticker, { ...holding });
      state.holdings.set(holding.userId, holdings);
    }
    if (saved.listings.length !== state.listings.size) throw new Error();
    for (const row of saved.listings) {
      const listing = state.listings.get(row.ticker);
      const durable = rows.listings.find((value) => value.emote.name === row.ticker);
      if (
        !listing ||
        !durable ||
        !Number.isFinite(durable.price) ||
        durable.price < 1 ||
        row.priceHistory.length > 602
      )
        throw new Error();
      if (
        !Number.isFinite(row.heat) ||
        row.heat < 0 ||
        row.heat > 1_000_000_000 ||
        !Number.isFinite(row.impact) ||
        row.impact < -0.5 ||
        row.impact > 1 ||
        typeof row.moonFired !== "boolean" ||
        typeof row.crashFired !== "boolean"
      )
        throw new Error();
      integer(durable.haltedUntil);
      if (row.lastHaltAt !== null) integer(row.lastHaltAt, 0, saved.at);
      origin(row.lastOrigin);
      price(durable.price);
      price(durable.sessionOpenPrice);
      let lastAt = -1;
      for (const point of row.priceHistory) {
        integer(point.at, 0, saved.at);
        price(point.price);
        if (point.at <= lastAt) throw new Error();
        lastAt = point.at;
      }
      const { ticker: _, ...rules } = structuredClone(row);
      Object.assign(listing, rules, { price: durable.price });
      listing.candles = rows.candles
        .filter((candle) => candle.ticker === row.ticker)
        .map(({ ticker: _, ...candle }) => ({ ...candle }))
        .sort((a, b) => a.minuteStart - b.minuteStart);
      if (listing.candles.length > 11) throw new Error();
      for (const candle of listing.candles) {
        integer(candle.minuteStart, 0, saved.at);
        if (candle.minuteStart % 60_000 !== 0) throw new Error();
        for (const value of [candle.open, candle.high, candle.low, candle.close]) price(value);
        if (
          candle.high < Math.max(candle.open, candle.close) ||
          candle.low > Math.min(candle.open, candle.close)
        )
          throw new Error();
      }
    }
    const gap = now - saved.at;
    state.at = now;
    if (gap > 0) {
      state.lastTickAt = now;
      for (const listing of state.listings.values()) {
        listing.heat =
          gap >= 600_000 ? 0 : listing.heat * 2 ** (-gap / (state.settings.HEAT_HALF_LIFE * 1000));
        listing.impact =
          gap >= 600_000
            ? 0
            : listing.impact * 2 ** (-gap / (state.settings.IMPACT_HALF_LIFE * 1000));
        if (listing.haltedUntil <= now) listing.haltedUntil = 0;
        listing.candles = listing.candles.filter(
          (candle) => candle.minuteStart >= Math.floor(now / 60_000) * 60_000 - 600_000,
        );
        let boundary = 0;
        for (const [index, point] of listing.priceHistory.entries()) {
          if (point.at > now - 600_000) break;
          boundary = index;
        }
        listing.priceHistory = listing.priceHistory.slice(boundary);
      }
      for (const [id, until] of state.cooldowns) if (until <= now) state.cooldowns.delete(id);
      for (const [id, until] of state.replyCooldowns)
        if (until <= now) state.replyCooldowns.delete(id);
      for (const [id, part] of state.participation)
        if (part.minuteStart < Math.floor(now / 60_000) * 60_000) state.participation.delete(id);
      for (const [id, at] of state.seenEvents) if (now - at >= 600_000) state.seenEvents.delete(id);
      if (state.raidUntil <= now) state.raidUntil = 0;
      if (gap >= 600_000) {
        state.pending.clear();
        state.repeats.clear();
      } else {
        for (const [ticker, pending] of state.pending) {
          pending.uses = pending.uses.filter((use) => now - use.at < state.settings.IPO_WINDOW_MS);
          if (!pending.uses.length) state.pending.delete(ticker);
        }
        for (const [ticker, users] of state.repeats) {
          for (const [id, uses] of users) {
            const retained = uses.filter((at) => now - at < 30_000);
            if (retained.length) users.set(id, retained);
            else users.delete(id);
          }
          if (!users.size) state.repeats.delete(ticker);
        }
      }
    }
    return state;
  } catch {
    throw new Error("Invalid, unsupported or backwards market recovery.");
  }
}
