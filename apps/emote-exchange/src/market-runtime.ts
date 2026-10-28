import type { Emote, Say, Store } from "@emote-exchange/twitch-kit";
import type { MarketEffect, MarketInput, MarketMoment } from "./engine/market.ts";
import { initialMarketState, stepMarket } from "./engine/market.ts";
import { marketProjection } from "./market-display.ts";
import { createMarketRepository } from "./market-store.ts";

interface Options {
  store: Store;
  now: () => number;
  catalog: readonly Emote[];
  autoTick?: boolean;
  say: (say: Say) => unknown;
  publish: (moments: MarketMoment[]) => void;
}
export function createMarketRuntime(options: Options) {
  const repo = createMarketRepository(options.store);
  let state = repo.load(options.now(), options.catalog);
  let awaitingBell = state.session?.closedAt === null;
  const recoveredStreamTick = state.streamLastTickAt;
  let status: "ready" | "storage-error" = "ready";
  let closed = false;
  // Persist recovered analytical state and expired Listing deadlines atomically,
  // without manufacturing a tick, rewards, candles or animation effects.
  const recovery: Extract<MarketEffect, { type: "persist" }> = {
    type: "persist",
    checkpoint: true,
    traders: [],
    listings: [...state.listings.values()].map(
      ({ candles: _, priceHistory: __, ...listing }) => listing,
    ),
    delisted: [],
    candles: [],
    pruneCandlesBefore: Math.floor(state.at / 60_000) * 60_000 - 600_000,
    trades: [],
    holdings: [],
    credits: [],
    firstMessages: [],
    sessions: [],
    reset: false,
  };
  repo.commit(state, [recovery]);
  function receive(input: MarketInput) {
    if (closed || status !== "ready")
      throw new Error("Market is unavailable. Restart after resolving storage.");
    const now = options.now();
    const next = stepMarket(state, input, now);
    // Recovery ticks must not erase the previous broadcast's end before EventSub
    // confirms its next opening bell. This value is checkpointed on every tick.
    if (awaitingBell && input.type === "Tick") next.state.streamLastTickAt = recoveredStreamTick;
    if (input.type === "StreamOnline" || input.type === "StreamOffline" || input.type === "Reset")
      awaitingBell = false;
    if (!next.effects.length) return;
    const budget = new Map([...next.state.replyCooldowns].filter(([, until]) => until > now));
    const says: Say[] = [];
    for (const effect of next.effects)
      if (effect.type === "say") {
        if (effect.priority === "reply" && effect.userId) {
          if ((budget.get(effect.userId) ?? 0) > now) continue;
          budget.set(effect.userId, now + 20_000);
        }
        says.push(effect);
      }
    next.state.replyCooldowns = budget;
    try {
      repo.commit(next.state, next.effects);
    } catch {
      status = "storage-error";
      options.publish([]);
      throw new Error("Market storage failed. No event effects were delivered.");
    }
    state = next.state;
    const moments = next.effects.flatMap((effect) =>
      effect.type === "broadcast" ? effect.moments : [],
    );
    options.publish(moments);
    for (const say of says) options.say(say);
  }
  const timer =
    options.autoTick === false
      ? null
      : setInterval(() => {
          if (!closed && status === "ready") {
            try {
              receive({ type: "Tick" });
            } catch {
              /* Status is public; failed writes never deliver effects. */
            }
          }
        }, 1000);
  timer?.unref();
  return {
    receive,
    tick: () => receive({ type: "Tick" }),
    display: () => marketProjection(state, status),
    settings: () => ({ ...state.settings }),
    setCatalog(catalog: readonly Emote[]) {
      if (!closed)
        state = { ...state, catalog: initialMarketState({ now: state.at, catalog }).catalog };
    },
    close() {
      closed = true;
      if (timer) clearInterval(timer);
    },
  };
}
