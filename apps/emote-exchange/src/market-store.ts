import type { Emote, Migration, Store, StoreWrite } from "@emote-exchange/twitch-kit";
import type {
  Candle,
  Holding,
  ListingWrite,
  MarketEffect,
  MarketSession,
  MarketState,
  Trader,
} from "./engine/market.ts";
import { checkpointMarket, restoreMarket } from "./engine/recovery.ts";

export const marketMigrations: readonly Migration[] = [
  {
    version: 2,
    sql: `
  CREATE TABLE traders (user_id TEXT PRIMARY KEY, login TEXT NOT NULL, display_name TEXT NOT NULL, color TEXT NOT NULL,
    coins INTEGER NOT NULL CHECK(typeof(coins)='integer' AND coins BETWEEN 0 AND 1000000000), frozen INTEGER NOT NULL CHECK(frozen IN (0,1)),
    created_at INTEGER NOT NULL, last_active_at INTEGER NOT NULL, is_sim INTEGER NOT NULL CHECK(is_sim IN (0,1)));
  CREATE TABLE listings (ticker TEXT PRIMARY KEY, emote_key TEXT NOT NULL, provider TEXT NOT NULL, image_url TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active','delisted')), ipo_at INTEGER NOT NULL, session_open_price REAL NOT NULL,
    base REAL NOT NULL, last_price REAL NOT NULL, halted_until INTEGER NOT NULL, last_use_at INTEGER NOT NULL,
    data TEXT NOT NULL CHECK(json_valid(data)));
  CREATE TABLE holdings (user_id TEXT NOT NULL REFERENCES traders(user_id), ticker TEXT NOT NULL REFERENCES listings(ticker),
    shares INTEGER NOT NULL CHECK(typeof(shares)='integer' AND shares > 0), cost_basis INTEGER NOT NULL CHECK(typeof(cost_basis)='integer' AND cost_basis >= 0), PRIMARY KEY(user_id,ticker));
  CREATE TABLE trades (id TEXT PRIMARY KEY, at INTEGER NOT NULL, origin TEXT NOT NULL, user_id TEXT NOT NULL, ticker TEXT NOT NULL,
    side TEXT NOT NULL CHECK(side IN ('buy','sell')), shares INTEGER NOT NULL CHECK(shares BETWEEN 1 AND 1000000), price REAL NOT NULL,
    coins INTEGER NOT NULL CHECK(typeof(coins)='integer' AND coins BETWEEN 0 AND 1000000000));
  CREATE TABLE credits (id TEXT PRIMARY KEY, at INTEGER NOT NULL, origin TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL,
    coins INTEGER NOT NULL CHECK(typeof(coins)='integer' AND coins BETWEEN 0 AND 1000000000));
  CREATE TABLE candles (ticker TEXT NOT NULL REFERENCES listings(ticker), minute_start INTEGER NOT NULL, open REAL NOT NULL,
    high REAL NOT NULL, low REAL NOT NULL, close REAL NOT NULL, PRIMARY KEY(ticker,minute_start));
  CREATE TABLE sessions (id TEXT PRIMARY KEY, opened_at INTEGER NOT NULL, closed_at INTEGER, summary TEXT CHECK(summary IS NULL OR json_valid(summary)));
  CREATE TABLE first_messages (user_id TEXT PRIMARY KEY, at INTEGER NOT NULL);
  CREATE TABLE engine_state (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version INTEGER NOT NULL, saved_at INTEGER NOT NULL,
    last_tick_at INTEGER NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)));
`,
  },
];

export function createMarketRepository(store: Store) {
  return {
    load(now: number, catalog: readonly Emote[] = []): MarketState {
      const saved = store.read<{ version: number; data: string }>(
        "SELECT version,data FROM engine_state WHERE singleton=1",
      )[0];
      if (saved && saved.version !== 1) throw new Error("Unsupported market checkpoint version.");
      return restoreMarket(
        {
          checkpoint: saved?.data ?? null,
          traders: store
            .read<Omit<Trader, "frozen" | "isSim"> & { frozen: number; isSim: number }>(
              "SELECT user_id AS id,login,display_name AS displayName,color,coins,frozen,created_at AS createdAt,last_active_at AS lastActiveAt,is_sim AS isSim FROM traders ORDER BY rowid",
            )
            .map((row) => ({ ...row, frozen: Boolean(row.frozen), isSim: Boolean(row.isSim) })),
          listings: store
            .read<{ data: string }>(
              "SELECT data FROM listings WHERE status='active' ORDER BY rowid",
            )
            .map((row) => JSON.parse(row.data) as ListingWrite),
          holdings: store.read<Holding>(
            "SELECT user_id AS userId,ticker,shares,cost_basis AS costBasis FROM holdings ORDER BY rowid",
          ),
          candles: store.read<Candle & { ticker: string }>(
            "SELECT ticker,minute_start AS minuteStart,open,high,low,close FROM candles ORDER BY minute_start",
          ),
          firstMessages: store.read<{ userId: string; at: number }>(
            "SELECT user_id AS userId,at FROM first_messages ORDER BY rowid",
          ),
          sessions: store
            .read<{
              id: string;
              openedAt: number;
              closedAt: number | null;
              summary: string | null;
            }>(
              "SELECT id,opened_at AS openedAt,closed_at AS closedAt,summary FROM sessions ORDER BY rowid",
            )
            .map((row) => ({
              ...row,
              summary: row.summary ? (JSON.parse(row.summary) as MarketSession["summary"]) : null,
            })),
        },
        now,
        catalog,
      );
    },
    commit(state: MarketState, effects: readonly MarketEffect[]) {
      const writes: StoreWrite[] = [];
      for (const effect of effects) {
        if (effect.type !== "persist") continue;
        if (effect.reset)
          for (const table of [
            "holdings",
            "trades",
            "credits",
            "candles",
            "first_messages",
            "sessions",
            "listings",
            "traders",
            "engine_state",
          ])
            writes.push({ sql: `DELETE FROM ${table}` });
        for (const row of effect.traders)
          writes.push({
            sql: "INSERT INTO traders VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET login=excluded.login,display_name=excluded.display_name,color=excluded.color,coins=excluded.coins,frozen=excluded.frozen,last_active_at=excluded.last_active_at,is_sim=excluded.is_sim",
            params: [
              row.id,
              row.login,
              row.displayName,
              row.color,
              row.coins,
              Number(row.frozen),
              row.createdAt,
              row.lastActiveAt,
              Number(row.isSim),
            ],
          });
        for (const [status, listings] of [
          ["active", effect.listings],
          ["delisted", effect.delisted],
        ] as const)
          for (const row of listings) {
            writes.push({
              sql: "INSERT INTO listings VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(ticker) DO UPDATE SET emote_key=excluded.emote_key,provider=excluded.provider,image_url=excluded.image_url,status=excluded.status,ipo_at=excluded.ipo_at,session_open_price=excluded.session_open_price,base=excluded.base,last_price=excluded.last_price,halted_until=excluded.halted_until,last_use_at=excluded.last_use_at,data=excluded.data",
              params: [
                row.emote.name,
                row.emote.key,
                row.emote.key.split(":")[0],
                row.emote.imageUrl,
                status,
                row.ipoAt,
                row.sessionOpenPrice,
                row.base,
                row.price,
                row.haltedUntil,
                row.lastUseAt,
                JSON.stringify(row),
              ],
            });
            if (status === "delisted")
              writes.push({ sql: "DELETE FROM candles WHERE ticker=?", params: [row.emote.name] });
          }
        for (const row of effect.holdings)
          writes.push(
            row.shares === 0
              ? {
                  sql: "DELETE FROM holdings WHERE user_id=? AND ticker=?",
                  params: [row.userId, row.ticker],
                }
              : {
                  sql: "INSERT INTO holdings VALUES (?,?,?,?) ON CONFLICT(user_id,ticker) DO UPDATE SET shares=excluded.shares,cost_basis=excluded.cost_basis",
                  params: [row.userId, row.ticker, row.shares, row.costBasis],
                },
          );
        for (const row of effect.trades)
          writes.push({
            sql: "INSERT INTO trades VALUES (?,?,?,?,?,?,?,?,?)",
            params: [
              row.id,
              row.at,
              row.origin,
              row.userId,
              row.ticker,
              row.side,
              row.shares,
              row.price,
              row.coins,
            ],
          });
        for (const row of effect.credits)
          writes.push({
            sql: "INSERT INTO credits VALUES (?,?,?,?,?,?)",
            params: [row.id, row.at, row.origin, row.userId, row.kind, row.coins],
          });
        for (const row of effect.firstMessages)
          writes.push({
            sql: "INSERT INTO first_messages VALUES (?,?)",
            params: [row.userId, row.at],
          });
        for (const row of effect.sessions)
          writes.push({
            sql: "INSERT INTO sessions VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET closed_at=excluded.closed_at,summary=excluded.summary",
            params: [
              row.id,
              row.openedAt,
              row.closedAt,
              row.summary ? JSON.stringify(row.summary) : null,
            ],
          });
        for (const row of effect.candles)
          writes.push({
            sql: "INSERT INTO candles VALUES (?,?,?,?,?,?) ON CONFLICT(ticker,minute_start) DO UPDATE SET high=excluded.high,low=excluded.low,close=excluded.close",
            params: [row.ticker, row.minuteStart, row.open, row.high, row.low, row.close],
          });
        writes.push({
          sql: "DELETE FROM candles WHERE minute_start < ?",
          params: [effect.pruneCandlesBefore],
        });
      }
      writes.push({
        sql: "INSERT INTO engine_state VALUES (1,1,?,?,?) ON CONFLICT(singleton) DO UPDATE SET version=excluded.version,saved_at=excluded.saved_at,last_tick_at=excluded.last_tick_at,data=excluded.data",
        params: [state.at, state.lastTickAt, checkpointMarket(state)],
      });
      store.writeBatch(writes);
    },
  };
}
