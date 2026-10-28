import { shownStreak } from "./greetings.ts";
import type { MarketEffect, MarketInput, MarketMoment, MarketState } from "./market.ts";

type Origin = "twitch" | "sim";
export interface AnalyticsBucket {
  at: number;
  messages: number;
  active: number;
  trades: number;
  coins: number;
}
interface Activity {
  at: number;
  messages: number;
  trades: number;
  coins: number;
}
export const issueSources = ["starting", "stipend", "follow", "visa", "greeting", "grant"] as const;
export type Issued = Record<(typeof issueSources)[number], number>;
const issued = (): Issued => ({
  starting: 0,
  stipend: 0,
  follow: 0,
  visa: 0,
  greeting: 0,
  grant: 0,
});
export interface OriginAnalytics {
  buckets: AnalyticsBucket[];
  recent: Activity[];
  active: Map<string, number>;
  chatters: Set<string>;
  messages: number;
  traded: Set<string>;
  newcomers: Map<string, { at: number; converted: boolean }>;
  issued: Issued;
  fees: number;
  trades: number;
  follows: number;
  raids: number;
  greetings: { claims: number; returning: number };
  peakMessages: number;
  peakActive: number;
}
export interface AnalyticsState {
  at: number;
  since: number;
  streamNo: number;
  hasLive: boolean;
  streamStartedAt: number;
  moments: (MarketMoment & { number: number })[];
  momentNo: number;
  twitch: OriginAnalytics;
  sim: OriginAnalytics;
}
function originState(): OriginAnalytics {
  return {
    buckets: [],
    recent: [],
    active: new Map(),
    chatters: new Set(),
    messages: 0,
    traded: new Set(),
    newcomers: new Map(),
    issued: issued(),
    fees: 0,
    trades: 0,
    follows: 0,
    raids: 0,
    greetings: { claims: 0, returning: 0 },
    peakMessages: 0,
    peakActive: 0,
  };
}
export function initialAnalytics(now: number, streamNo = 0, streamStartedAt = now): AnalyticsState {
  return {
    at: now,
    since: now,
    streamNo,
    hasLive: false,
    streamStartedAt,
    moments: [],
    momentNo: 0,
    twitch: originState(),
    sim: originState(),
  };
}
export interface AnalyticsInput {
  event: MarketInput;
  before: MarketState;
  after: MarketState;
  effects: readonly MarketEffect[];
}
export function reduceAnalytics(
  previous: AnalyticsState,
  input: AnalyticsInput,
  now: number,
): AnalyticsState {
  if (!Number.isSafeInteger(now) || now < previous.at) throw new Error("Invalid analytics clock.");
  if (input.event.type === "Reset") return { ...initialAnalytics(now), hasLive: previous.hasLive };
  const freshStream = input.after.streamNo !== previous.streamNo;
  const minute = Math.floor(now / 60_000) * 60_000;
  const state: AnalyticsState = {
    ...previous,
    at: now,
    streamNo: input.after.streamNo,
    streamStartedAt: freshStream ? now : previous.streamStartedAt,
    moments: [...previous.moments],
  };
  for (const origin of ["twitch", "sim"] as const) {
    const old = previous[origin];
    const buckets = old.buckets
      .filter((row) => row.at >= minute - 59 * 60_000)
      .map((row) => ({ ...row }));
    for (
      let at = Math.max(
        0,
        (buckets.at(-1)?.at ?? minute - 60 * 60_000) + 60_000,
        minute - 59 * 60_000,
      );
      at <= minute;
      at += 60_000
    )
      buckets.push({ at, messages: 0, active: 0, trades: 0, coins: 0 });
    const base = freshStream ? originState() : old;
    state[origin] = {
      ...base,
      buckets,
      recent: old.recent.filter((row) => now - row.at < 60_000).map((row) => ({ ...row })),
      active: new Map([...old.active].filter(([, at]) => now - at < 300_000)),
      chatters: new Set(base.chatters),
      traded: new Set(base.traded),
      newcomers: new Map([...base.newcomers].map(([key, row]) => [key, { ...row }])),
      issued: { ...base.issued },
      greetings: { ...base.greetings },
    };
  }
  const event = input.event;
  if ("origin" in event && event.origin === "twitch") state.hasLive = true;
  const open = input.after.session?.closedAt === null || input.before.session?.closedAt === null;
  const eligible =
    input.effects.length > 0 &&
    event.type === "ChatMessage" &&
    !event.foreign &&
    !event.selfSent &&
    !event.chatter.isBroadcaster;
  if (open && eligible && event.type === "ChatMessage") {
    const source = state[event.origin];
    source.messages++;
    source.chatters.add(event.chatter.id);
    source.active.set(event.chatter.id, now);
    if (
      !input.before.firstMessages.has(event.chatter.id) &&
      !source.newcomers.has(event.chatter.id)
    )
      source.newcomers.set(event.chatter.id, { at: now, converted: false });
    const bucket = source.buckets.at(-1);
    if (bucket) bucket.messages++;
    const last = source.recent.at(-1);
    if (last?.at === now) last.messages++;
    else source.recent.push({ at: now, messages: 1, trades: 0, coins: 0 });
  }
  if (open) {
    for (const trader of input.after.traders.values())
      if (!input.before.traders.has(trader.id))
        state[trader.isSim ? "sim" : "twitch"].issued.starting +=
          input.after.settings.STARTING_COINS;
    for (const effect of input.effects) {
      if (effect.type === "persist") {
        for (const credit of effect.credits)
          if (credit.kind !== "delist") state[credit.origin].issued[credit.kind] += credit.coins;
        for (const trade of effect.trades) {
          const source = state[trade.origin];
          const fee = Math.max(1, trade.price * trade.shares * input.after.settings.FEE);
          source.fees += Math.round(fee * 10_000) / 10_000;
          if (!eligible) continue;
          source.trades++;
          const first = !source.traded.has(trade.userId);
          source.traded.add(trade.userId);
          const joined = source.newcomers.get(trade.userId);
          if (first && joined && now - joined.at < 600_000) joined.converted = true;
          const bucket = source.buckets.at(-1);
          if (bucket) {
            bucket.trades++;
            bucket.coins += trade.coins;
          }
          const last = source.recent.at(-1);
          if (last?.at === now) {
            last.trades++;
            last.coins += trade.coins;
          } else source.recent.push({ at: now, messages: 0, trades: 1, coins: trade.coins });
        }
      }
      if (effect.type === "broadcast")
        for (const moment of effect.moments) {
          if (moment.kind === "GREETING") {
            const source = state[moment.origin];
            source.greetings.claims++;
            if ((moment.streak ?? 0) >= 2) source.greetings.returning++;
          }
          if (
            ["IPO", "HALT", "MOON", "CRASH", "RAID"].includes(moment.kind) &&
            !state.moments.some((row) => row.id === moment.id)
          )
            state.moments = [...state.moments, { ...moment, number: ++state.momentNo }].slice(-20);
        }
    }
    if (event.type === "Follow") state[event.origin].follows++;
    if (event.type === "Raid") state[event.origin].raids++;
  }
  for (const origin of ["twitch", "sim"] as const) {
    const bucket = state[origin].buckets.at(-1);
    if (bucket) bucket.active = state[origin].active.size;
    if (open) {
      state[origin].peakMessages = Math.max(
        state[origin].peakMessages,
        state[origin].recent.reduce((sum, row) => sum + row.messages, 0),
      );
      state[origin].peakActive = Math.max(state[origin].peakActive, state[origin].active.size);
    }
  }
  return state;
}
export function analyticsProjection(
  state: AnalyticsState,
  market: MarketState,
  now: number,
  recent: readonly StreamAnalyticsSummary[] = [],
) {
  const selected = (origins: Origin[]) => {
    const sources = origins.map((origin) => state[origin]);
    const sum = (pick: (source: OriginAnalytics) => number) =>
      sources.reduce((total, source) => total + pick(source), 0);
    const distinctChatters = sum((source) => source.chatters.size);
    const traderCount = sum((source) => source.traded.size);
    const newChatters = sum((source) => source.newcomers.size);
    const convertedNewChatters = sum(
      (source) => [...source.newcomers.values()].filter((row) => row.converted).length,
    );
    const traders = [...market.traders.values()].filter((row) =>
      origins.includes(row.isSim ? "sim" : "twitch"),
    );
    const alive = traders
      .map((trader) => ({ name: trader.displayName, streak: shownStreak(market, trader) ?? 0 }))
      .filter((row) => row.streak > 0)
      .sort((a, b) => b.streak - a.streak || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const sparkline: AnalyticsBucket[] = [];
    const minute = Math.floor(now / 60_000) * 60_000;
    for (let at = minute - 59 * 60_000; at <= minute; at += 60_000) {
      const rows = sources.map((source) => source.buckets.find((row) => row.at === at));
      sparkline.push({
        at,
        messages: rows.reduce((sum, row) => sum + (row?.messages ?? 0), 0),
        active: rows.reduce((sum, row) => sum + (row?.active ?? 0), 0),
        trades: rows.reduce((sum, row) => sum + (row?.trades ?? 0), 0),
        coins: rows.reduce((sum, row) => sum + (row?.coins ?? 0), 0),
      });
    }
    return {
      messagesPerMinute: sum((source) =>
        source.recent.reduce((total, row) => total + row.messages, 0),
      ),
      activeChatters: sum((source) => source.active.size),
      tradesPerMinute: sum((source) => source.recent.reduce((total, row) => total + row.trades, 0)),
      coinsPerMinute: sum((source) => source.recent.reduce((total, row) => total + row.coins, 0)),
      distinctChatters,
      participation: distinctChatters ? Math.round((traderCount / distinctChatters) * 100) : 0,
      newChatters,
      convertedNewChatters,
      coinsHeld: Math.min(
        Number.MAX_SAFE_INTEGER,
        traders.reduce((sum, row) => sum + row.coins, 0),
      ),
      issued: Object.fromEntries(
        issueSources.map((key) => [key, sum((source) => source.issued[key])]),
      ) as Issued,
      fees: Math.round(sum((source) => source.fees) * 10_000) / 10_000,
      follows: sum((source) => source.follows),
      raids: sum((source) => source.raids),
      greetings: {
        claims: sum((source) => source.greetings.claims),
        returning: sum((source) => source.greetings.returning),
        longest: alive.length ? alive[0] : null,
      },
      sparkline,
    };
  };
  const listings = [...market.listings.values()].map((row) => ({
    ticker: row.emote.name,
    price: row.price,
    heat: row.heat,
    changePercent: (row.price / row.sessionOpenPrice - 1) * 100,
  }));
  return {
    v: 1 as const,
    at: now,
    since: state.since,
    hasLive: state.hasLive,
    stream: {
      number: state.streamNo,
      open: market.session?.closedAt === null,
      uptimeMs: Math.max(0, now - state.streamStartedAt),
    },
    comparison: recentBaseline(recent),
    twitch: selected(["twitch"]),
    sim: selected(["sim"]),
    all: selected(["twitch", "sim"]),
    market: {
      hottest: listings.length ? [...listings].sort((a, b) => b.heat - a.heat)[0] : null,
      up: listings
        .filter((row) => row.changePercent > 0)
        .sort((a, b) => b.changePercent - a.changePercent)
        .slice(0, 3),
      down: listings
        .filter((row) => row.changePercent < 0)
        .sort((a, b) => a.changePercent - b.changePercent)
        .slice(0, 3),
      activeListings: listings.length,
    },
    moments: state.moments.map((row) => ({
      number: row.number,
      at: row.at,
      kind: row.kind,
      ...(row.name ? { name: row.name } : {}),
      ...(row.ticker ? { ticker: row.ticker } : {}),
      origin: row.origin,
    })),
  };
}

export interface StreamMetrics {
  averageMessagesPerMinute: number;
  peakMessagesPerMinute: number;
  peakActiveChatters: number;
  participation: number;
  newChatterConversion: number;
  coinsIssued: number;
  coinsBurned: number;
  averageTradesPerMinute: number;
}
export interface StreamAnalyticsSummary {
  v: 1;
  streamNo: number;
  since: number;
  closedAt: number;
  live: boolean;
  twitch: StreamMetrics;
  sim: StreamMetrics;
}
export function analyticsSummary(
  state: AnalyticsState,
  now: number,
  live: boolean,
): StreamAnalyticsSummary {
  const summarize = (source: OriginAnalytics): StreamMetrics => ({
    averageMessagesPerMinute:
      source.messages / Math.max(1, (now - Math.max(state.since, state.streamStartedAt)) / 60_000),
    peakMessagesPerMinute: source.peakMessages,
    peakActiveChatters: source.peakActive,
    participation: source.chatters.size
      ? Math.round((source.traded.size / source.chatters.size) * 100)
      : 0,
    newChatterConversion: source.newcomers.size
      ? Math.round(
          ([...source.newcomers.values()].filter((row) => row.converted).length /
            source.newcomers.size) *
            100,
        )
      : 0,
    coinsIssued: Object.values(source.issued).reduce((sum, value) => sum + value, 0),
    coinsBurned: source.fees,
    averageTradesPerMinute:
      source.trades / Math.max(1, (now - Math.max(state.since, state.streamStartedAt)) / 60_000),
  });
  return {
    v: 1,
    streamNo: state.streamNo,
    since: Math.max(state.since, state.streamStartedAt),
    closedAt: now,
    live,
    twitch: summarize(state.twitch),
    sim: summarize(state.sim),
  };
}
export function recentBaseline(recent: readonly StreamAnalyticsSummary[]) {
  const byStream = new Map<number, StreamAnalyticsSummary>();
  for (const summary of recent) if (summary.live) byStream.set(summary.streamNo, summary);
  const rows = [...byStream.values()].sort((a, b) => a.closedAt - b.closedAt).slice(-5);
  if (rows.length < 2) return null;
  const median = (pick: (row: StreamMetrics) => number) => {
    const values = rows.map((row) => pick(row.twitch)).sort((a, b) => a - b);
    const middle = Math.floor(values.length / 2);
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  };
  return {
    streams: rows.length,
    messagesPerMinute: median((row) => row.averageMessagesPerMinute),
    activeChatters: median((row) => row.peakActiveChatters),
    participation: median((row) => row.participation),
    tradesPerMinute: median((row) => row.averageTradesPerMinute),
  };
}
export type AnalyticsDisplay = ReturnType<typeof analyticsProjection>;
