import type { AnalyticsDisplay } from "../../src/engine/analytics.ts";

export type AnalyticsSnapshot = AnalyticsDisplay & { seq: number };
export type AnalyticsMetrics = AnalyticsSnapshot["sim"];
const sources = ["starting", "stipend", "follow", "visa", "greeting", "grant"] as const;
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}
function number(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error();
  return value;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const result = number(value, min, max);
  if (!Number.isSafeInteger(result)) throw new Error();
  return result;
}
function text(value: unknown) {
  if (typeof value !== "string" || !value.length || value.length > 100 || /[\p{Cc}]/u.test(value))
    throw new Error();
  return value;
}
function boolean(value: unknown) {
  if (typeof value !== "boolean") throw new Error();
  return value;
}
function array(value: unknown, max: number) {
  if (!Array.isArray(value) || value.length > max) throw new Error();
  return value as unknown[];
}
function listing(value: unknown) {
  const row = object(value);
  return {
    ticker: text(row.ticker),
    price: number(row.price, 1),
    heat: number(row.heat),
    changePercent: number(row.changePercent, -100),
  };
}
function metrics(value: unknown): AnalyticsMetrics {
  const row = object(value);
  const rawIssued = object(row.issued);
  const greeting = object(row.greetings);
  const longest = greeting.longest === null ? null : object(greeting.longest);
  const issued = Object.fromEntries(
    sources.map((key) => [key, integer(rawIssued[key])]),
  ) as AnalyticsMetrics["issued"];
  const sparkline = array(row.sparkline, 60).map((value) => {
    const point = object(value);
    return {
      at: integer(point.at, Number.MIN_SAFE_INTEGER),
      messages: integer(point.messages),
      active: integer(point.active),
      trades: integer(point.trades),
      coins: integer(point.coins),
    };
  });
  if (
    sparkline.length !== 60 ||
    sparkline.some((point, index) => index > 0 && point.at !== sparkline[index - 1].at + 60_000)
  )
    throw new Error();
  const result = {
    messagesPerMinute: integer(row.messagesPerMinute),
    activeChatters: integer(row.activeChatters),
    tradesPerMinute: integer(row.tradesPerMinute),
    coinsPerMinute: integer(row.coinsPerMinute),
    distinctChatters: integer(row.distinctChatters),
    participation: integer(row.participation, 0, 100),
    newChatters: integer(row.newChatters),
    convertedNewChatters: integer(row.convertedNewChatters),
    coinsHeld: integer(row.coinsHeld),
    issued,
    fees: number(row.fees),
    follows: integer(row.follows),
    raids: integer(row.raids),
    greetings: {
      claims: integer(greeting.claims),
      returning: integer(greeting.returning),
      longest: longest ? { name: text(longest.name), streak: integer(longest.streak, 1) } : null,
    },
    sparkline,
  };
  if (
    result.convertedNewChatters > result.newChatters ||
    result.greetings.returning > result.greetings.claims
  )
    throw new Error();
  return result;
}
export function readAnalytics(value: unknown): AnalyticsSnapshot | null {
  try {
    const row = object(value);
    if (row.v !== 1) throw new Error();
    const stream = object(row.stream);
    const market = object(row.market);
    const comparison = row.comparison === null ? null : object(row.comparison);
    const result: AnalyticsSnapshot = {
      v: 1,
      seq: integer(row.seq),
      at: integer(row.at),
      since: integer(row.since),
      hasLive: boolean(row.hasLive),
      stream: {
        number: integer(stream.number),
        open: boolean(stream.open),
        uptimeMs: integer(stream.uptimeMs),
      },
      comparison: comparison
        ? {
            streams: integer(comparison.streams, 2, 5),
            messagesPerMinute: number(comparison.messagesPerMinute),
            activeChatters: number(comparison.activeChatters),
            participation: number(comparison.participation, 0, 100),
            tradesPerMinute: number(comparison.tradesPerMinute),
          }
        : null,
      twitch: metrics(row.twitch),
      sim: metrics(row.sim),
      all: metrics(row.all),
      market: {
        hottest: market.hottest === null ? null : listing(market.hottest),
        up: array(market.up, 3).map(listing),
        down: array(market.down, 3).map(listing),
        activeListings: integer(market.activeListings, 0, 24),
      },
      moments: array(row.moments, 20).map((value) => {
        const item = object(value);
        if (
          !["IPO", "HALT", "MOON", "CRASH", "RAID"].includes(String(item.kind)) ||
          !["sim", "twitch"].includes(String(item.origin))
        )
          throw new Error();
        return {
          number: integer(item.number, 1),
          at: integer(item.at),
          kind: item.kind as AnalyticsSnapshot["moments"][number]["kind"],
          origin: item.origin as "sim" | "twitch",
          ...(item.name === undefined ? {} : { name: text(item.name) }),
          ...(item.ticker === undefined ? {} : { ticker: text(item.ticker) }),
        };
      }),
    };
    if (
      result.since > result.at ||
      result.moments.some((item) => item.at > result.at) ||
      [result.sim, result.twitch, result.all].some(
        (source) => (source.sparkline.at(-1)?.at ?? 0) > result.at,
      )
    )
      throw new Error();
    return result;
  } catch {
    return null;
  }
}
