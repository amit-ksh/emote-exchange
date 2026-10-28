import type { MarketMoment, MarketSession, SessionSummary } from "../../src/engine/market.ts";
import type { marketProjection } from "../../src/market-display.ts";

export type OverlayMarket = ReturnType<typeof marketProjection>;
export type OverlayListing = OverlayMarket["listings"][number];
export type OverlayTrader = OverlayMarket["traders"][number];
export type Widget = "tape" | "chart" | "board" | "feed" | "banners";
const widgets: Widget[] = ["tape", "chart", "board", "feed", "banners"];
const kinds = new Set([
  "IPO",
  "DELIST",
  "TRADE",
  "FOLLOW",
  "VISA",
  "RAID",
  "HALT",
  "MOON",
  "CRASH",
  "BELL",
  "PAUSED",
  "TOP",
  "GREETING",
]);
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
  return value as Record<string, unknown>;
}
function text(value: unknown, max = 100): string {
  if (typeof value !== "string" || !value.length || value.length > max || /[\p{Cc}]/u.test(value))
    throw new Error();
  return value;
}
function number(value: unknown, min = -Number.MAX_VALUE, max = Number.MAX_VALUE): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    throw new Error();
  return value;
}
function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const result = number(value, min, max);
  if (!Number.isSafeInteger(result)) throw new Error();
  return result;
}
function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error();
  return value;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new Error();
  return value;
}
function imageUrl(value: unknown): string {
  const url = text(value, 1024);
  if (/^\/demo-emotes\/[A-Za-z][A-Za-z0-9_]{0,63}\.svg$/.test(url)) return url;
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    ![
      "static-cdn.jtvnw.net",
      "cdn.7tv.app",
      "cdn.7tv.io",
      "cdn.betterttv.net",
      "cdn.frankerfacez.com",
    ].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.hash ||
    parsed.search
  )
    throw new Error();
  return url;
}
function summary(value: unknown): SessionSummary | null {
  if (value === null) return null;
  const row = object(value);
  const change = (value: unknown) => {
    if (value === null) return null;
    const row = object(value);
    return { ticker: text(row.ticker), changePercent: number(row.changePercent) };
  };
  const rich = row.richest === null ? null : object(row.richest);
  return {
    topGainer: change(row.topGainer),
    biggestCrash: change(row.biggestCrash),
    richest: rich
      ? {
          userId: text(rich.userId, 128),
          name: text(rich.name),
          netWorth: integer(rich.netWorth),
          capped: boolean(rich.capped),
        }
      : null,
  };
}
function session(value: unknown): MarketSession | null {
  if (value === null) return null;
  const row = object(value);
  return {
    id: text(row.id, 256),
    streamNo: integer(row.streamNo),
    openedAt: integer(row.openedAt),
    closedAt: row.closedAt === null ? null : integer(row.closedAt),
    summary: summary(row.summary),
  };
}
function moment(value: unknown): MarketMoment {
  const row = object(value);
  if (!kinds.has(String(row.kind)) || !["sim", "twitch"].includes(String(row.origin)))
    throw new Error();
  const result: MarketMoment = {
    id: text(row.id, 512),
    at: integer(row.at),
    origin: row.origin as MarketMoment["origin"],
    kind: row.kind as MarketMoment["kind"],
  };
  if (row.ticker !== undefined) result.ticker = text(row.ticker);
  if (row.name !== undefined) result.name = text(row.name);
  if (row.userId !== undefined) result.userId = text(row.userId, 128);
  if (row.price !== undefined) result.price = number(row.price, 1);
  if (row.shares !== undefined) result.shares = integer(row.shares, 1);
  if (row.coins !== undefined) result.coins = integer(row.coins, 0, 1_000_000_000);
  if (row.streak !== undefined) result.streak = integer(row.streak, 1);
  if (row.viewers !== undefined) result.viewers = integer(row.viewers);
  if (row.paused !== undefined) result.paused = boolean(row.paused);
  if (row.side !== undefined) {
    if (row.side !== "buy" && row.side !== "sell") throw new Error();
    result.side = row.side;
  }
  if (row.phase !== undefined) {
    if (row.phase !== "open" && row.phase !== "close") throw new Error();
    result.phase = row.phase;
  }
  if (row.summary !== undefined) {
    const value = summary(row.summary);
    if (value) result.summary = value;
  }
  return result;
}
export function readOverlayMoments(value: unknown): MarketMoment[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-100).flatMap((row) => {
    try {
      return [moment(row)];
    } catch {
      return [];
    }
  });
}
export function readOverlayMarket(value: unknown): OverlayMarket | null {
  try {
    const row = object(value);
    if (row.status !== "ready" && row.status !== "storage-error") return null;
    return {
      status: row.status,
      traderCount: integer(row.traderCount),
      paused: boolean(row.paused),
      session: session(row.session),
      feed: array(row.feed, 5).map(moment),
      listings: array(row.listings, 24).map((value) => {
        const listing = object(value);
        return {
          ticker: text(listing.ticker),
          imageUrl: imageUrl(listing.imageUrl),
          price: number(listing.price, 1),
          heat: number(listing.heat, 0),
          sessionChangePercent: number(listing.sessionChangePercent),
          haltedUntil: integer(listing.haltedUntil),
          holders: integer(listing.holders),
          candles: array(listing.candles, 11).map((value) => {
            const candle = object(value);
            return {
              minuteStart: integer(candle.minuteStart),
              open: number(candle.open, 1),
              high: number(candle.high, 1),
              low: number(candle.low, 1),
              close: number(candle.close, 1),
            };
          }),
        };
      }),
      traders: array(row.traders, 100_000).map((value) => {
        const trader = object(value);
        if (typeof trader.color !== "string" || !/^#[\da-f]{6}$/i.test(trader.color))
          throw new Error();
        return {
          userId: text(trader.userId, 128),
          streak: trader.streak === null ? null : integer(trader.streak, 1),
          name: text(trader.name),
          login: text(trader.login),
          color: trader.color,
          coins: integer(trader.coins, 0, 1_000_000_000),
          frozen: boolean(trader.frozen),
          isSim: boolean(trader.isSim),
          netWorth: integer(trader.netWorth),
          capped: boolean(trader.capped),
          sessionChangePercent:
            trader.sessionChangePercent === null ? null : number(trader.sessionChangePercent),
          holdings: array(trader.holdings, 24).map((value) => {
            const holding = object(value);
            return {
              ticker: text(holding.ticker),
              shares: integer(holding.shares, 1),
              costBasis: integer(holding.costBasis),
            };
          }),
        };
      }),
    };
  } catch {
    return null;
  }
}
export function overlayOptions(search: string, prefersReduced: boolean) {
  const params = new URLSearchParams(search);
  const selected = params.has("widgets") ? (params.get("widgets")?.split(",") ?? []) : widgets;
  return {
    widgets: new Set(
      selected.filter((value): value is Widget => widgets.includes(value as Widget)),
    ),
    reduced: prefersReduced || params.get("motion") === "reduced",
    soundOff: true,
  };
}

export interface OverlayQueue {
  topUntil: number;
  seen: Map<string, number>;
  feed: MarketMoment[];
  pending: MarketMoment[];
  active: { moment: MarketMoment; until: number } | null;
}
export const initialOverlayQueue = (): OverlayQueue => ({
  seen: new Map(),
  feed: [],
  pending: [],
  active: null,
  topUntil: 0,
});
const priority = (kind: MarketMoment["kind"]) =>
  kind === "RAID"
    ? 5
    : kind === "HALT"
      ? 4
      : kind === "MOON" || kind === "CRASH"
        ? 3
        : kind === "IPO"
          ? 2
          : 1;
const bannerKinds = new Set(["RAID", "HALT", "MOON", "CRASH", "IPO", "DELIST", "BELL", "PAUSED"]);
export function advanceOverlayQueue(
  previous: OverlayQueue,
  incoming: readonly MarketMoment[],
  now: number,
): OverlayQueue {
  const seen = new Map([...previous.seen].filter(([, at]) => now - at < 60_000));
  let feed = previous.feed.filter((row) => now - row.at < 8000);
  const pending = previous.pending.filter((row) => now - row.at < 30_000);
  let active = previous.active && previous.active.until > now ? previous.active : null;
  let topUntil = previous.topUntil > now ? previous.topUntil : 0;
  for (const row of incoming) {
    if (seen.has(row.id)) continue;
    seen.set(row.id, now);
    if (now - row.at >= 30_000 || row.at > now + 5000) continue;
    if (row.kind === "TOP") topUntil = now + 2000;
    if (row.kind !== "TOP" && now - row.at < 8000) feed = [...feed, row].slice(-5);
    if (!bannerKinds.has(row.kind)) continue;
    const existing = pending.findIndex(
      (value) => value.kind === row.kind && value.ticker === row.ticker,
    );
    if (existing >= 0) pending.splice(existing, 1);
    pending.push(row);
    if (pending.length > 32) {
      const victim = pending.reduce((oldest, value) =>
        priority(value.kind) < priority(oldest.kind) ||
        (priority(value.kind) === priority(oldest.kind) && value.at < oldest.at)
          ? value
          : oldest,
      );
      pending.splice(pending.indexOf(victim), 1);
    }
  }
  while (seen.size > 2048) {
    const first = seen.keys().next().value;
    if (first !== undefined) seen.delete(first);
  }
  if (!active && pending.length) {
    pending.sort((a, b) => priority(b.kind) - priority(a.kind) || a.at - b.at);
    const moment = pending.shift();
    if (moment) active = { moment, until: now + 4000 };
  }
  return { seen, feed, pending, active, topUntil };
}
export function selectChart(
  previous: { ticker: string; at: number } | null,
  listings: readonly OverlayListing[],
  now: number,
): { ticker: string; at: number } | null {
  if (previous && now - previous.at < 20_000) return previous;
  const hottest = [...listings].sort(
    (a, b) => b.heat - a.heat || (a.ticker < b.ticker ? -1 : 1),
  )[0];
  return hottest
    ? { ticker: hottest.ticker, at: previous?.ticker === hottest.ticker ? previous.at : now }
    : null;
}

export function readableChatColor(color: string): string {
  const rgb = /^#[\da-f]{6}$/i.test(color)
    ? [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16))
    : [244, 242, 249];
  const luminance = (values: number[]) =>
    values
      .map((value) => {
        const c = value / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, index) => sum + c * [0.2126, 0.7152, 0.0722][index], 0);
  // 82% near-black glass over pure-white footage is the brightest panel case.
  const background = luminance([54, 54, 58]);
  for (let i = 0; i < 20; i++) {
    if ((luminance(rgb) + 0.05) / (background + 0.05) >= 4.5) break;
    for (let c = 0; c < 3; c++) rgb[c] = Math.min(255, Math.ceil(rgb[c] + (255 - rgb[c]) * 0.15));
  }
  return `#${rgb.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}
export const compactCoins = (value: number) =>
  value >= 1e15
    ? `${new Intl.NumberFormat("en-US", { maximumSignificantDigits: 3 }).format(value / 1e15)}P`
    : new Intl.NumberFormat("en-US", {
        notation: value >= 100_000 ? "compact" : "standard",
        maximumFractionDigits: value >= 100_000 ? 1 : 0,
      }).format(value);
export const priceLabel = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: value >= 1000 ? "compact" : "standard",
    minimumFractionDigits: value >= 1000 ? 0 : 2,
    ...(value >= 1000 ? { maximumSignificantDigits: 3 } : { maximumFractionDigits: 2 }),
  }).format(value);
export function changeLabel(value: number | null): string {
  if (value === null) return "—";
  const magnitude = Math.abs(value);
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${magnitude >= 1e9 ? magnitude.toExponential(0).replace("e+", "e") : new Intl.NumberFormat("en-US", { notation: magnitude >= 1000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(magnitude)}%`;
}
