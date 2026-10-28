import type { ChatEvent, Emote, Say } from "@emote-exchange/twitch-kit";
import type { AccountChanges } from "./accounts.ts";
import { accountChanges, accountWrites, settleDelist } from "./accounts.ts";
import { marketCommand } from "./commands.ts";
import { greeting } from "./greetings.ts";
import { priceEvents } from "./price-events.ts";
import { advanceRewards, followOrRaid, observeMessage, touchTrader } from "./rewards.ts";
import { bell } from "./sessions.ts";
import type { MarketSettings } from "./settings.ts";
import { marketSettings } from "./settings.ts";
import { trade } from "./trading.ts";

export interface Trader {
  greetingStreak: number;
  lastGreetingStreamNo: number | null;
  id: string;
  login: string;
  displayName: string;
  color: string;
  coins: number;
  createdAt: number;
  lastActiveAt: number;
  isSim: boolean;
  frozen: boolean;
  sessionOpenWorth: string | null;
}
export interface Holding {
  userId: string;
  ticker: string;
  shares: number;
  costBasis: number;
}
export interface Trade {
  id: string;
  at: number;
  origin: ChatEvent["origin"];
  userId: string;
  ticker: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  coins: number;
}
export interface Credit {
  id: string;
  at: number;
  origin: ChatEvent["origin"];
  userId: string;
  kind: "delist" | "follow" | "visa" | "stipend" | "greeting";
  coins: number;
}
export interface SessionSummary {
  topGainer: { ticker: string; changePercent: number } | null;
  biggestCrash: { ticker: string; changePercent: number } | null;
  richest: { userId: string; name: string; netWorth: number; capped: boolean } | null;
}
export interface MarketSession {
  streamNo: number;
  id: string;
  openedAt: number;
  closedAt: number | null;
  summary: SessionSummary | null;
}
export type MarketSay = Say & { type: "say"; userId?: string };
export type MarketInput =
  | ChatEvent
  | { type: "Tick" }
  | { type: "Settings"; settings: unknown }
  | { type: "Pause"; id: string; origin: ChatEvent["origin"]; value: boolean }
  | { type: "Freeze"; id: string; origin: ChatEvent["origin"]; userId: string; value: boolean }
  | { type: "Delist"; id: string; origin: ChatEvent["origin"]; ticker: string }
  | { type: "Reset"; id: string; origin: ChatEvent["origin"]; confirmation: string };
// Runtime guards/role checks authorize these actions before dispatch.
export interface Listing {
  emote: Emote;
  ipoAt: number;
  sessionOpenPrice: number;
  heat: number;
  base: number;
  impact: number;
  price: number;
  lastUseAt: number;
  candles: Candle[];
  priceHistory: { at: number; price: number }[];
  haltedUntil: number;
  lastHaltAt: number | null;
  moonFired: boolean;
  crashFired: boolean;
  lastOrigin: ChatEvent["origin"];
}
export interface Candle {
  minuteStart: number;
  open: number;
  high: number;
  low: number;
  close: number;
}
type PriceFlags = "haltedUntil" | "lastHaltAt" | "moonFired" | "crashFired" | "lastOrigin";
export type SeedListing = Omit<Listing, "price" | "candles" | "priceHistory" | PriceFlags> &
  Partial<Pick<Listing, PriceFlags>>;
export type ListingWrite = Omit<Listing, "candles" | "priceHistory">;
interface Use {
  at: number;
  chatterId: string;
  weight: number;
}
interface PendingListing {
  emote: Emote;
  uses: Use[];
  origin: ChatEvent["origin"];
  eventId: string;
}
export interface MarketState {
  streamNo: number;
  streamLastTickAt: number;
  settings: Readonly<MarketSettings>;
  at: number;
  lastTickAt: number;
  catalog: Map<string, Emote>;
  traders: Map<string, Trader>;
  listings: Map<string, Listing>;
  pending: Map<string, PendingListing>;
  repeats: Map<string, Map<string, number[]>>;
  holdings: Map<string, Map<string, Holding>>;
  cooldowns: Map<string, number>;
  replyCooldowns: Map<string, number>;
  feed: MarketMoment[];
  paused: boolean;
  participation: Map<string, { minuteStart: number; origin: ChatEvent["origin"] }>;
  firstMessages: Map<string, number>;
  raidUntil: number;
  seenEvents: Map<string, number>;
  startedAt: number;
  session: MarketSession | null;
}
export interface MarketMoment {
  id: string;
  at: number;
  origin: ChatEvent["origin"];
  kind:
    | "IPO"
    | "DELIST"
    | "TRADE"
    | "FOLLOW"
    | "VISA"
    | "RAID"
    | "HALT"
    | "MOON"
    | "CRASH"
    | "BELL"
    | "PAUSED"
    | "TOP"
    | "GREETING";
  streak?: number;
  ticker?: string;
  price?: number;
  userId?: string;
  name?: string;
  side?: "buy" | "sell";
  shares?: number;
  coins?: number;
  viewers?: number;
  phase?: "open" | "close";
  summary?: SessionSummary;
  paused?: boolean;
}
export interface MarketDisplay {
  traderCount: number;
  feed: MarketMoment[];
  paused: boolean;
  session: MarketSession | null;
  listings: {
    ticker: string;
    imageUrl: string;
    price: number;
    heat: number;
    sessionChangePercent: number;
  }[];
}
export type MarketEffect =
  | {
      type: "persist";
      checkpoint: true;
      traders: Trader[];
      listings: ListingWrite[];
      delisted: ListingWrite[];
      candles: (Candle & { ticker: string })[];
      pruneCandlesBefore: number;
      trades: Trade[];
      holdings: Holding[];
      credits: Credit[];
      firstMessages: { userId: string; at: number }[];
      sessions: MarketSession[];
      reset: boolean;
    }
  | { type: "broadcast"; display: MarketDisplay; moments: MarketMoment[] }
  | MarketSay;
const commands = new Set([
  "buy",
  "sell",
  "portfolio",
  "pf",
  "top",
  "market",
  "delist",
  "freeze",
  "unfreeze",
  "greetings",
]);
function approvedEmote(value: Emote): Emote | null {
  if (
    typeof value.name !== "string" ||
    !/^[^\s\p{Cc}]{1,100}$/u.test(value.name) ||
    typeof value.key !== "string" ||
    !/^(demo|twitch|7tv|bttv|ffz):[\w-]{1,128}$/.test(value.key) ||
    typeof value.animated !== "boolean" ||
    typeof value.imageUrl !== "string" ||
    value.imageUrl.length > 1024
  )
    return null;
  const provider = value.key.split(":")[0];
  if (provider === "demo") {
    if (!/^\/demo-emotes\/[^/?#\\\s]{1,120}\.svg$/.test(value.imageUrl)) return null;
  } else {
    try {
      const url = new URL(value.imageUrl);
      const hosts: Record<string, string[]> = {
        twitch: ["static-cdn.jtvnw.net"],
        "7tv": ["cdn.7tv.app", "cdn.7tv.io"],
        bttv: ["cdn.betterttv.net"],
        ffz: ["cdn.betterttv.net", "cdn.frankerfacez.com"],
      };
      if (
        url.protocol !== "https:" ||
        !hosts[provider]?.includes(url.hostname) ||
        url.port ||
        url.username ||
        url.password ||
        url.hash ||
        url.search
      )
        return null;
    } catch {
      return null;
    }
  }
  return { key: value.key, name: value.name, imageUrl: value.imageUrl, animated: value.animated };
}
function sample(listing: Listing, now: number) {
  const minuteStart = Math.floor(now / 60_000) * 60_000;
  const current = listing.candles.at(-1);
  if (current?.minuteStart === minuteStart) {
    listing.candles = [
      ...listing.candles.slice(0, -1),
      {
        ...current,
        high: Math.max(current.high, listing.price),
        low: Math.min(current.low, listing.price),
        close: listing.price,
      },
    ];
  } else
    listing.candles = [
      ...listing.candles,
      {
        minuteStart,
        open: listing.price,
        high: listing.price,
        low: listing.price,
        close: listing.price,
      },
    ];
  const last = listing.priceHistory.at(-1);
  const point = { at: now, price: listing.price };
  if (
    last &&
    Math.floor(last.at / 1000) === Math.floor(now / 1000) &&
    (listing.priceHistory.length > 1 || last.at === now)
  )
    listing.priceHistory = [...listing.priceHistory.slice(0, -1), point];
  else listing.priceHistory = [...listing.priceHistory, point];
}
function listingWrite(listing: Listing): ListingWrite {
  return {
    emote: { ...listing.emote },
    ipoAt: listing.ipoAt,
    sessionOpenPrice: listing.sessionOpenPrice,
    heat: listing.heat,
    base: listing.base,
    impact: listing.impact,
    price: listing.price,
    lastUseAt: listing.lastUseAt,
    haltedUntil: listing.haltedUntil,
    lastHaltAt: listing.lastHaltAt,
    moonFired: listing.moonFired,
    crashFired: listing.crashFired,
    lastOrigin: listing.lastOrigin,
  };
}
function persist(
  state: MarketState,
  traders: Trader[],
  listings: Listing[],
  delisted: Listing[] = [],
): Extract<MarketEffect, { type: "persist" }> {
  const unique = [
    ...new Map(
      listings
        .filter((listing) => state.listings.has(listing.emote.name))
        .map((listing) => [listing.emote.name, listing]),
    ).values(),
  ];
  return {
    type: "persist",
    checkpoint: true,
    traders: traders.map((trader) => ({ ...trader })),
    listings: unique.map(listingWrite),
    delisted: delisted.map(listingWrite),
    candles: unique.flatMap((listing) => {
      const last = listing.candles.at(-1);
      return last ? [{ ticker: listing.emote.name, ...last }] : [];
    }),
    pruneCandlesBefore: Math.floor(state.at / 60_000) * 60_000 - 600_000,
    trades: [],
    holdings: [],
    credits: [],
    firstMessages: [],
    sessions: [],
    reset: false,
  };
}
function newListing(seed: SeedListing, now: number): Listing {
  const approved = approvedEmote(seed.emote);
  if (!approved) throw new Error("Invalid market seed Emote.");
  const result: Listing = {
    emote: approved,
    ipoAt: seed.ipoAt,
    sessionOpenPrice: seed.sessionOpenPrice,
    heat: seed.heat,
    base: seed.base,
    impact: seed.impact,
    lastUseAt: seed.lastUseAt,
    price: Math.round(Math.max(1, seed.base * (1 + seed.impact)) * 100) / 100,
    candles: [],
    priceHistory: [],
    haltedUntil: seed.haltedUntil ?? 0,
    lastHaltAt: seed.lastHaltAt ?? null,
    moonFired: seed.moonFired ?? false,
    crashFired: seed.crashFired ?? false,
    lastOrigin: seed.lastOrigin ?? "sim",
  };
  sample(result, now);
  return result;
}
export function initialMarketState({
  now,
  catalog = [],
  seedListings = [],
  settings,
}: {
  now: number;
  catalog?: readonly Emote[];
  seedListings?: readonly SeedListing[];
  settings?: Partial<MarketSettings>;
}): MarketState {
  if (!Number.isSafeInteger(now) || now < 0) throw new Error("Invalid market clock.");
  const config = marketSettings(settings);
  if (
    seedListings.length > config.MAX_LISTINGS ||
    new Set(seedListings.map((listing) => listing.emote.name)).size !== seedListings.length
  )
    throw new Error("Invalid market seed Listings.");
  for (const seed of seedListings) {
    if (
      !approvedEmote(seed.emote) ||
      !Number.isFinite(seed.heat) ||
      seed.heat < 0 ||
      seed.heat > 1_000_000_000 ||
      !Number.isFinite(seed.base) ||
      seed.base <= 0 ||
      seed.base > 1_000_000_000 ||
      !Number.isFinite(seed.sessionOpenPrice) ||
      seed.sessionOpenPrice < 1 ||
      seed.sessionOpenPrice > 1_000_000_000 ||
      !Number.isFinite(seed.impact) ||
      seed.impact < -0.5 ||
      seed.impact > 1 ||
      !Number.isSafeInteger(seed.ipoAt) ||
      seed.ipoAt < 0 ||
      seed.ipoAt > now ||
      !Number.isSafeInteger(seed.lastUseAt) ||
      seed.lastUseAt < 0 ||
      seed.lastUseAt > now
    )
      throw new Error("Invalid market seed Listing.");
  }
  const approved = catalog.map((value) => {
    const emote = approvedEmote(value);
    if (!emote) throw new Error("Invalid market Emote.");
    return emote;
  });
  return {
    settings: config,
    at: now,
    lastTickAt: now,
    catalog: new Map(approved.map((value) => [value.name, value])),
    traders: new Map(),
    listings: new Map(
      seedListings.map((listing) => [listing.emote.name, newListing(listing, now)]),
    ),
    pending: new Map(),
    repeats: new Map(),
    holdings: new Map(),
    cooldowns: new Map(),
    replyCooldowns: new Map(),
    feed: [],
    paused: false,
    participation: new Map(),
    firstMessages: new Map(),
    raidUntil: 0,
    seenEvents: new Map(),
    startedAt: now,
    session: null,
    streamNo: 0,
    streamLastTickAt: now,
  };
}
export function marketDisplay(state: MarketState): MarketDisplay {
  return {
    traderCount: state.traders.size,
    feed: structuredClone(state.feed),
    paused: state.paused,
    session: structuredClone(state.session),
    listings: [...state.listings.values()].map((listing) => ({
      ticker: listing.emote.name,
      imageUrl: listing.emote.imageUrl,
      price: listing.price,
      heat: listing.heat,
      sessionChangePercent: (listing.price / listing.sessionOpenPrice - 1) * 100,
    })),
  };
}
function broadcast(
  state: MarketState,
  moments: MarketMoment[],
): Extract<MarketEffect, { type: "broadcast" }> {
  const ids = new Set(state.feed.map((moment) => moment.id));
  state.feed = [...state.feed, ...moments.filter((moment) => !ids.has(moment.id))].slice(-5);
  return { type: "broadcast", display: marketDisplay(state), moments: structuredClone(moments) };
}
function promote(
  state: MarketState,
  now: number,
  moments: MarketMoment[],
  changed: Listing[],
  delisted: Listing[],
  accounts: AccountChanges,
) {
  for (const [name, pending] of state.pending) {
    if (new Set(pending.uses.map((use) => use.chatterId)).size < state.settings.IPO_MIN_CHATTERS)
      continue;
    if (state.listings.size >= state.settings.MAX_LISTINGS) {
      const coldest = [...state.listings.values()]
        .filter((listing) => now - listing.lastUseAt >= 1_800_000)
        .sort(
          (a, b) =>
            a.heat - b.heat ||
            a.ipoAt - b.ipoAt ||
            (a.emote.name < b.emote.name ? -1 : a.emote.name > b.emote.name ? 1 : 0),
        )[0];
      if (!coldest) continue;
      settleDelist(state, coldest, now, { id: pending.eventId, origin: pending.origin }, accounts);
      state.listings.delete(coldest.emote.name);
      state.repeats.delete(coldest.emote.name);
      delisted.push(coldest);
      moments.push({
        id: `${pending.eventId}:delist:${encodeURIComponent(coldest.emote.name)}`,
        at: now,
        origin: pending.origin,
        kind: "DELIST",
        ticker: coldest.emote.name,
        price: coldest.price,
      });
    }
    const created = newListing(
      {
        emote: pending.emote,
        ipoAt: now,
        sessionOpenPrice: state.settings.IPO_PRICE,
        base: state.settings.IPO_PRICE,
        heat: pending.uses.reduce(
          (sum, use) =>
            sum + use.weight * 2 ** (-(now - use.at) / (state.settings.HEAT_HALF_LIFE * 1000)),
          0,
        ),
        impact: 0,
        lastUseAt: pending.uses.at(-1)?.at ?? now,
        lastOrigin: pending.origin,
      },
      now,
    );
    state.listings.set(name, created);
    state.pending.delete(name);
    changed.push(created);
    moments.push({
      id: `${pending.eventId}:ipo:${encodeURIComponent(name)}`,
      at: now,
      origin: pending.origin,
      kind: "IPO",
      ticker: name,
      price: created.price,
    });
  }
}
function applyMarket(
  previous: MarketState,
  input: MarketInput,
  now: number,
): { state: MarketState; effects: MarketEffect[] } {
  if (!Number.isSafeInteger(now) || now < previous.at)
    throw new Error("Invalid or backwards market clock.");
  if (input.type === "Reset" && input.confirmation !== "RESET")
    throw new Error("Type RESET to confirm a Season reset.");
  if (input.type === "Settings") {
    const state = { ...previous, at: now, settings: marketSettings(input.settings) };
    return { state, effects: [persist(state, [], []), broadcast(state, [])] };
  }
  const relevant =
    input.type !== "Tick" &&
    [
      "ChatMessage",
      "Follow",
      "Raid",
      "StreamOnline",
      "StreamOffline",
      "Pause",
      "Freeze",
      "Delist",
      "Reset",
    ].includes(input.type) &&
    !(input.type === "ChatMessage" && (input.foreign || input.selfSent));
  const deliveryKey = relevant ? `${input.origin}:${input.id}` : null;
  if (
    deliveryKey &&
    previous.seenEvents.has(deliveryKey) &&
    now - (previous.seenEvents.get(deliveryKey) ?? 0) < 600_000
  )
    return { state: previous, effects: [] };
  // Copy mutable containers and records. Retained samples/Uses are immutable;
  // replace their arrays on write instead of copying the entire chart per message.
  const state: MarketState = {
    ...previous,
    at: now,
    traders: new Map(previous.traders),
    listings: new Map([...previous.listings].map(([ticker, listing]) => [ticker, { ...listing }])),
    pending: new Map([...previous.pending].map(([ticker, pending]) => [ticker, { ...pending }])),
    repeats: new Map(
      [...previous.repeats].map(([ticker, chatters]) => [ticker, new Map(chatters)]),
    ),
    holdings: new Map([...previous.holdings].map(([id, holdings]) => [id, new Map(holdings)])),
    cooldowns: new Map(previous.cooldowns),
    participation: new Map(previous.participation),
    firstMessages: new Map(previous.firstMessages),
    seenEvents: new Map(previous.seenEvents),
  };
  for (const [id, at] of state.seenEvents) {
    if (now - at < 600_000) break;
    state.seenEvents.delete(id);
  }
  if (deliveryKey) state.seenEvents.set(deliveryKey, now);
  while (state.seenEvents.size > 2000) {
    const first = state.seenEvents.keys().next().value;
    if (first !== undefined) state.seenEvents.delete(first);
  }
  if (input.type === "Reset") {
    const fresh = initialMarketState({
      now,
      settings: state.settings,
      catalog: [...state.catalog.values()],
    });
    // Retain delivery suppression so replaying a pre-reset event cannot repeat a fill or reset.
    fresh.seenEvents = state.seenEvents;
    const write = persist(fresh, [], []);
    write.reset = true;
    return { state: fresh, effects: [write, broadcast(fresh, [])] };
  }
  let pruned = false;
  for (const [id, until] of state.cooldowns)
    if (until <= now) {
      state.cooldowns.delete(id);
      pruned = true;
    }
  const prunedListings: Listing[] = [];
  for (const listing of state.listings.values()) {
    if (listing.haltedUntil > 0 && listing.haltedUntil <= now) {
      listing.haltedUntil = 0;
      pruned = true;
      prunedListings.push(listing);
    }
    const previousCandles = listing.candles.length;
    listing.candles = listing.candles.filter(
      (candle) => candle.minuteStart >= Math.floor(now / 60_000) * 60_000 - 600_000,
    );
    let boundary = -1;
    for (const [index, point] of listing.priceHistory.entries()) {
      if (point.at > now - 600_000) break;
      boundary = index;
    }
    if (boundary > 0) listing.priceHistory = listing.priceHistory.slice(boundary);
    if (boundary > 0 || previousCandles !== listing.candles.length) {
      pruned = true;
      prunedListings.push(listing);
    }
  }
  for (const [ticker, pending] of state.pending) {
    const remaining = pending.uses.filter((use) => now - use.at < state.settings.IPO_WINDOW_MS);
    if (remaining.length !== pending.uses.length) pruned = true;
    pending.uses = remaining;
    if (!remaining.length) state.pending.delete(ticker);
  }
  for (const [ticker, chatters] of state.repeats) {
    for (const [id, uses] of chatters) {
      const remaining = uses.filter((at) => now - at < 30_000);
      if (remaining.length !== uses.length) pruned = true;
      if (remaining.length) chatters.set(id, remaining);
      else chatters.delete(id);
    }
    if (!chatters.size) state.repeats.delete(ticker);
  }
  const moments: MarketMoment[] = [];
  const delisted: Listing[] = [];
  const accounts = accountChanges();
  advanceRewards(state, now, accounts);
  if (input.type === "ChatMessage") observeMessage(state, input, now, accounts, moments);
  if (input.type === "Follow" || input.type === "Raid") {
    followOrRaid(state, input, now, accounts, moments);
    return {
      state,
      effects: [
        accountWrites(persist(state, [], prunedListings), state, accounts),
        broadcast(state, moments),
      ],
    };
  }
  if (input.type === "StreamOnline" || input.type === "StreamOffline") {
    const result = bell(state, input, now, moments);
    const write = accountWrites(
      persist(state, input.type === "StreamOnline" ? [...state.traders.values()] : [], [
        ...state.listings.values(),
      ]),
      state,
      accounts,
    );
    write.sessions = result.sessions;
    return { state, effects: [write, broadcast(state, moments), ...result.says] };
  }
  if (input.type === "Delist") {
    const exact = state.listings.get(input.ticker);
    const matches = [...state.listings.values()].filter(
      (listing) => listing.emote.name.toLowerCase() === input.ticker.toLowerCase(),
    );
    const listing = exact ?? (matches.length === 1 ? matches[0] : undefined);
    if (listing) {
      settleDelist(state, listing, now, input, accounts);
      state.listings.delete(listing.emote.name);
      state.pending.delete(listing.emote.name);
      state.repeats.delete(listing.emote.name);
      delisted.push(listing);
      moments.push({
        id: `${input.id}:delist`,
        at: now,
        origin: input.origin,
        kind: "DELIST",
        ticker: listing.emote.name,
        price: listing.price,
      });
    }
    return {
      state,
      effects: [
        accountWrites(persist(state, [], prunedListings, delisted), state, accounts),
        broadcast(state, moments),
      ],
    };
  }
  if (input.type === "Pause" || input.type === "Freeze") {
    const traders: Trader[] = [];
    if (input.type === "Pause") {
      state.paused = input.value;
      moments.push({
        id: `${input.id}:pause`,
        at: now,
        origin: input.origin,
        kind: "PAUSED",
        paused: input.value,
      });
    } else {
      const existing = state.traders.get(input.userId);
      if (existing) {
        const updated = { ...existing, frozen: input.value };
        state.traders.set(existing.id, updated);
        traders.push(updated);
      }
    }
    return {
      state,
      effects: [
        accountWrites(persist(state, traders, prunedListings), state, accounts),
        broadcast(state, moments),
      ],
    };
  }
  if (input.type === "Tick") {
    if (state.session?.closedAt === null) state.streamLastTickAt = now;
    for (const listing of state.listings.values()) {
      const dt = (now - Math.max(state.lastTickAt, listing.ipoAt)) / 1000;
      listing.heat *= 2 ** (-dt / state.settings.HEAT_HALF_LIFE);
      listing.impact *= 2 ** (-dt / state.settings.IMPACT_HALF_LIFE);
    }
    const total = [...state.listings.values()].reduce((sum, listing) => sum + listing.heat, 0);
    for (const listing of state.listings.values()) {
      const dt = (now - Math.max(state.lastTickAt, listing.ipoAt)) / 1000;
      if (total >= state.settings.QUIET_HEAT) {
        const ratio = Math.min(
          10,
          Math.max(0.1, (listing.heat / total) * Math.max(state.listings.size, 4)),
        );
        const target = state.settings.IPO_PRICE * ratio ** state.settings.ELASTICITY;
        listing.base += (target - listing.base) * (1 - Math.exp(-dt / state.settings.PRICE_TAU));
      }
      listing.price = Math.round(Math.max(1, listing.base * (1 + listing.impact)) * 100) / 100;
      priceEvents(listing, now, moments);
      sample(listing, now);
    }
    state.lastTickAt = now;
    promote(state, now, moments, [], delisted, accounts);
    return {
      state,
      effects: [
        accountWrites(persist(state, [], [...state.listings.values()], delisted), state, accounts),
        broadcast(state, moments),
      ],
    };
  }
  if (
    input.type !== "ChatMessage" ||
    input.foreign ||
    input.selfSent ||
    (input.command && !commands.has(input.command.name))
  )
    return {
      state,
      effects:
        pruned || deliveryKey || accounts.credits.length || accounts.firstMessages.length
          ? [
              accountWrites(persist(state, [], prunedListings), state, accounts),
              ...(moments.length || accounts.credits.length ? [broadcast(state, moments)] : []),
            ]
          : [],
    };
  if (input.command?.name === "greetings") {
    const say = greeting(state, input, now, accounts, moments);
    return {
      state,
      effects: [
        accountWrites(persist(state, [], prunedListings), state, accounts),
        broadcast(state, moments),
        say,
      ],
    };
  }
  const trader = touchTrader(state, input.chatter, input.origin, now, input.chatter.color);
  if (!input.command)
    state.participation.set(trader.id, {
      minuteStart: Math.floor(now / 60_000) * 60_000,
      origin: input.origin,
    });
  if (input.command?.name === "buy" || input.command?.name === "sell") {
    const result = trade(state, input, now);
    if (result.trades.length) {
      const listing = state.listings.get(result.trades[0].ticker);
      if (listing) {
        listing.lastOrigin = input.origin;
        priceEvents(listing, now, result.moments, input);
        sample(listing, now);
      }
    }
    const write = persist(
      state,
      [trader],
      [
        ...prunedListings,
        ...(result.trades.length ? [state.listings.get(result.trades[0].ticker) as Listing] : []),
      ],
    );
    write.trades = result.trades;
    write.holdings = result.holdings.map((holding) => ({ ...holding }));
    return {
      state,
      effects: [
        accountWrites(write, state, accounts),
        broadcast(state, [...moments, ...result.moments]),
        ...result.says,
      ],
    };
  }
  const names = new Set(
    input.command
      ? []
      : input.parts.filter((part) => part.type === "emote").map((part) => part.name),
  );
  const changed: Listing[] = prunedListings;
  for (const name of names) {
    const fragment = input.parts.find(
      (part) => part.type === "emote" && part.name === name && part.key.startsWith("twitch:"),
    );
    const emote =
      state.catalog.get(name) ?? (fragment?.type === "emote" ? approvedEmote(fragment) : null);
    if (!emote) continue;
    const repeats = state.repeats.get(name) ?? new Map<string, number[]>();
    const times = (repeats.get(trader.id) ?? []).filter((at) => now - at < 30_000);
    const weight = 0.5 ** times.length;
    repeats.set(trader.id, [...times, now]);
    state.repeats.set(name, repeats);
    const listing = state.listings.get(name);
    if (listing) {
      listing.heat += weight;
      listing.lastUseAt = now;
      listing.lastOrigin = input.origin;
      changed.push(listing);
      continue;
    }
    const pending = state.pending.get(name) ?? {
      emote,
      uses: [],
      origin: input.origin,
      eventId: input.id,
    };
    pending.uses = pending.uses.filter((use) => now - use.at < state.settings.IPO_WINDOW_MS);
    pending.uses.push({ at: now, chatterId: trader.id, weight });
    pending.origin = input.origin;
    pending.eventId = input.id;
    state.pending.set(name, pending);
  }
  promote(state, now, moments, changed, delisted, accounts);
  return {
    state,
    effects: [
      accountWrites(
        persist(
          state,
          [trader],
          changed.filter((listing) => state.listings.has(listing.emote.name)),
          delisted,
        ),
        state,
        accounts,
      ),
      broadcast(state, moments),
    ],
  };
}

export function stepMarket(
  previous: MarketState,
  input: MarketInput,
  now: number,
): { state: MarketState; effects: MarketEffect[] } {
  const result = applyMarket(previous, input, now);
  if (
    !result.effects.length ||
    input.type !== "ChatMessage" ||
    input.foreign ||
    input.selfSent ||
    !input.command ||
    input.command.name === "buy" ||
    input.command.name === "sell"
  )
    return result;
  const command = marketCommand(result.state, input, now);
  if (command.action) {
    const action = applyMarket(result.state, command.action, now);
    result.state = action.state;
    result.effects.push(...action.effects);
  }
  if (command.moment) result.effects.push(broadcast(result.state, [command.moment]));
  if (command.say) result.effects.push(command.say);
  return result;
}
