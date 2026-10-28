import type { ChatEvent, Emote } from "@emote-exchange/twitch-kit";
import type { MarketSettings } from "./settings.ts";
import { marketSettings } from "./settings.ts";

export interface Trader {
  id: string;
  login: string;
  displayName: string;
  color: string;
  coins: number;
  createdAt: number;
  lastActiveAt: number;
  isSim: boolean;
}
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
}
export interface Candle {
  minuteStart: number;
  open: number;
  high: number;
  low: number;
  close: number;
}
export type SeedListing = Omit<Listing, "price" | "candles" | "priceHistory">;
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
  settings: Readonly<MarketSettings>;
  at: number;
  lastTickAt: number;
  catalog: Map<string, Emote>;
  traders: Map<string, Trader>;
  listings: Map<string, Listing>;
  pending: Map<string, PendingListing>;
  repeats: Map<string, Map<string, number[]>>;
}
export interface MarketMoment {
  id: string;
  at: number;
  origin: ChatEvent["origin"];
  kind: "IPO" | "DELIST";
  ticker: string;
  price: number;
}
export interface MarketDisplay {
  traderCount: number;
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
    }
  | { type: "broadcast"; display: MarketDisplay; moments: MarketMoment[] };
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
  };
}
function persist(
  state: MarketState,
  traders: Trader[],
  listings: Listing[],
  delisted: Listing[] = [],
): Extract<MarketEffect, { type: "persist" }> {
  const unique = [...new Map(listings.map((listing) => [listing.emote.name, listing])).values()];
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
      seed.sessionOpenPrice <= 0 ||
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
  };
}
export function marketDisplay(state: MarketState): MarketDisplay {
  return {
    traderCount: state.traders.size,
    listings: [...state.listings.values()].map((listing) => ({
      ticker: listing.emote.name,
      imageUrl: listing.emote.imageUrl,
      price: listing.price,
      heat: listing.heat,
      sessionChangePercent: (listing.price / listing.sessionOpenPrice - 1) * 100,
    })),
  };
}
function promote(
  state: MarketState,
  now: number,
  moments: MarketMoment[],
  changed: Listing[],
  delisted: Listing[],
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
export function stepMarket(
  previous: MarketState,
  input: ChatEvent | { type: "Tick" },
  now: number,
): { state: MarketState; effects: MarketEffect[] } {
  if (!Number.isSafeInteger(now) || now < previous.at)
    throw new Error("Invalid or backwards market clock.");
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
  };
  let pruned = false;
  const prunedListings: Listing[] = [];
  for (const listing of state.listings.values()) {
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
  if (input.type === "Tick") {
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
      sample(listing, now);
    }
    state.lastTickAt = now;
    promote(state, now, moments, [], delisted);
    return {
      state,
      effects: [
        persist(state, [], [...state.listings.values()], delisted),
        { type: "broadcast", display: marketDisplay(state), moments },
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
      effects: pruned ? [persist(state, [], prunedListings)] : [],
    };
  const existing = state.traders.get(input.chatter.id);
  const trader: Trader = {
    id: input.chatter.id,
    login: input.chatter.login,
    displayName: input.chatter.displayName,
    color: input.chatter.color,
    coins: existing?.coins ?? state.settings.STARTING_COINS,
    createdAt: existing?.createdAt ?? now,
    lastActiveAt: now,
    isSim: existing?.isSim ?? input.origin === "sim",
  };
  state.traders.set(trader.id, trader);
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
  promote(state, now, moments, changed, delisted);
  return {
    state,
    effects: [
      persist(
        state,
        [trader],
        changed.filter((listing) => state.listings.has(listing.emote.name)),
        delisted,
      ),
      { type: "broadcast", display: marketDisplay(state), moments },
    ],
  };
}
