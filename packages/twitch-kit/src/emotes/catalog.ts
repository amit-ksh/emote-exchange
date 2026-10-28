import { readdirSync } from "node:fs";
import { record } from "../eventsub/protocol.ts";
import type { HelixClient } from "../helix.ts";
import type { Store, StoreWrite } from "../store/index.ts";
import type { CatalogEmote, Provider, Scope } from "./providers.ts";
import { buildCatalog, imageUrl, parseProvider, providers, validName } from "./providers.ts";

export interface CatalogSource {
  provider: Provider;
  scope: Scope;
  count: number;
  status: "idle" | "loading" | "ready" | "cached" | "unavailable" | "not-configured" | "needs-auth";
  updatedAt: number | null;
  httpStatus: number | null;
}
export interface CatalogPublicState {
  ready: boolean;
  total: number;
  demoCount: number;
  sources: CatalogSource[];
  examples: CatalogEmote[];
}
interface Source extends CatalogSource {
  entries: CatalogEmote[];
  storageScope: string;
  lastAttempt: number;
  controller?: AbortController;
  pending?: Promise<void>;
}
interface Options {
  store: Store;
  helix: HelixClient;
  auth: { identity: (role: "broadcaster") => string | undefined };
  demo: readonly CatalogEmote[];
  fetcher?: typeof fetch;
  now?: () => number;
  autoRefresh?: boolean;
  onChange?: () => void;
}
export function loadDemoCatalog(directory: string | URL): CatalogEmote[] {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[A-Za-z][A-Za-z0-9_]{0,63}\.svg$/.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((entry) => {
      const name = entry.name.slice(0, -4);
      return {
        provider: "demo",
        scope: "demo",
        key: `demo:${name}`,
        name,
        imageUrl: `/demo-emotes/${entry.name}`,
        animated: false,
      };
    });
}
async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Invalid emote catalog.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 5 * 1024 * 1024) {
        await reader.cancel();
        throw new Error("Emote catalog exceeds limit.");
      }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}
export function createEmoteCatalog(options: Options) {
  const now = options.now ?? Date.now;
  const fetcher = options.fetcher ?? fetch;
  const demo = structuredClone(options.demo) as CatalogEmote[];
  const sources = new Map<string, Source>();
  let broadcaster = options.auth.identity("broadcaster");
  let closed = false;
  let started = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let index = buildCatalog(demo);
  const key = (provider: Provider, scope: Scope) => `${provider}:${scope}`;
  function load(provider: Provider, scope: Scope): Source {
    const storageScope = scope === "global" ? "global" : `channel:${broadcaster ?? "none"}`;
    const source: Source = {
      provider,
      scope,
      storageScope,
      count: 0,
      status: "idle",
      updatedAt: null,
      httpStatus: null,
      entries: [],
      lastAttempt: -Infinity,
    };
    if (scope === "channel" && !broadcaster) {
      source.status = "needs-auth";
      return source;
    }
    const rows = options.store.read<{
      key: string;
      name: string;
      image_url: string;
      animated: number;
      fetched_at: number;
    }>(
      "SELECT key, name, image_url, animated, fetched_at FROM emote_cache WHERE provider = ? AND scope = ? LIMIT 10000",
      [provider, storageScope],
    );
    for (const row of rows) {
      const url = imageUrl(provider, row.image_url);
      if (
        !url ||
        !validName(row.name) ||
        !row.key.startsWith(`${provider}:`) ||
        !/^[\w:-]{1,160}$/.test(row.key) ||
        ![0, 1].includes(row.animated) ||
        !Number.isSafeInteger(row.fetched_at) ||
        row.fetched_at < 0
      )
        continue;
      source.entries.push({
        provider,
        scope,
        key: row.key,
        name: row.name,
        imageUrl: url,
        animated: row.animated === 1,
      });
      source.updatedAt = Math.max(source.updatedAt ?? 0, row.fetched_at);
    }
    const meta = options.store.read<{ value: string }>("SELECT value FROM kv WHERE key = ?", [
      `emote-cache:${key(provider, scope)}`,
    ])[0];
    if (meta) {
      try {
        const value = record(JSON.parse(meta.value));
        if (
          value.scope === storageScope &&
          typeof value.at === "number" &&
          Number.isSafeInteger(value.at) &&
          value.at >= 0 &&
          value.count === source.entries.length
        )
          source.updatedAt = value.at;
      } catch {
        /* Ignore invalid cache metadata; usable rows still stand on their own. */
      }
    }
    source.count = source.entries.length;
    source.status =
      source.updatedAt === null
        ? provider === "twitch" && !broadcaster
          ? "needs-auth"
          : "idle"
        : "cached";
    source.lastAttempt = source.updatedAt ?? -Infinity;
    return source;
  }
  function rebuild() {
    index = buildCatalog([...demo, ...[...sources.values()].flatMap((source) => source.entries)]);
  }
  const publish = () => {
    rebuild();
    options.onChange?.();
  };
  for (const provider of providers)
    for (const scope of ["channel", "global"] as const)
      sources.set(key(provider, scope), load(provider, scope));
  rebuild();
  function persist(source: Source, entries: CatalogEmote[], at: number) {
    const writes: StoreWrite[] = [
      {
        sql: "DELETE FROM emote_cache WHERE provider = ? AND scope = ?",
        params: [source.provider, source.storageScope],
      },
    ];
    for (const entry of entries)
      writes.push({
        sql: "INSERT INTO emote_cache(provider, scope, key, name, image_url, animated, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        params: [
          source.provider,
          source.storageScope,
          entry.key,
          entry.name,
          entry.imageUrl,
          entry.animated ? 1 : 0,
          at,
        ],
      });
    writes.push({
      sql: "INSERT INTO kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      params: [
        `emote-cache:${key(source.provider, source.scope)}`,
        JSON.stringify({ scope: source.storageScope, at, count: entries.length }),
      ],
    });
    options.store.writeBatch(writes);
  }
  async function fetchSource(source: Source) {
    const controller = new AbortController();
    source.controller = controller;
    const id = broadcaster;
    source.lastAttempt = now();
    source.status = "loading";
    publish();
    let status: number | null = null;
    try {
      let response: Response;
      if (source.provider === "twitch")
        response = await options.helix.request({
          role: "broadcaster",
          path:
            source.scope === "channel"
              ? `/chat/emotes?broadcaster_id=${encodeURIComponent(id ?? "")}`
              : "/chat/emotes/global",
          signal: controller.signal,
          deadline: now() + 10_000,
          beforeAttempt: async () => !closed && options.auth.identity("broadcaster") === id,
        });
      else {
        const channel = source.scope === "channel";
        const endpoint =
          source.provider === "7tv"
            ? channel
              ? `https://7tv.io/v3/users/twitch/${encodeURIComponent(id ?? "")}`
              : "https://7tv.io/v3/emote-sets/global"
            : `https://api.betterttv.net/3/cached/${source.provider === "ffz" ? "frankerfacez/" : ""}${channel ? `users/twitch/${encodeURIComponent(id ?? "")}` : "emotes/global"}`;
        response = await fetcher(endpoint, {
          redirect: "error",
          headers: { Accept: "application/json" },
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]),
        });
      }
      status = response.status;
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("Emote provider unavailable.");
      }
      const body = await readJson(response);
      const entries = parseProvider(source.provider, source.scope, body);
      if (
        closed ||
        controller.signal.aborted ||
        sources.get(key(source.provider, source.scope)) !== source
      )
        return;
      const at = now();
      persist(source, entries, at);
      source.entries = entries;
      source.count = entries.length;
      source.updatedAt = at;
      source.status =
        source.provider === "7tv" && source.scope === "channel" && record(body).emote_set === null
          ? "not-configured"
          : "ready";
    } catch {
      if (
        closed ||
        controller.signal.aborted ||
        sources.get(key(source.provider, source.scope)) !== source
      )
        return;
      source.status =
        source.updatedAt !== null
          ? "cached"
          : status === 404 && source.scope === "channel"
            ? "not-configured"
            : "unavailable";
    } finally {
      source.controller = undefined;
      if (!closed && sources.get(key(source.provider, source.scope)) === source) {
        source.httpStatus = status;
        publish();
      }
    }
  }
  function refresh(force = true): Promise<void> {
    if (closed) return Promise.resolve();
    const pending: Promise<void>[] = [];
    for (const source of sources.values()) {
      if ((source.scope === "channel" || source.provider === "twitch") && !broadcaster) continue;
      if (source.pending) {
        pending.push(source.pending);
        continue;
      }
      if (!force && now() - source.lastAttempt < 1_800_000) continue;
      source.pending = fetchSource(source).finally(() => {
        source.pending = undefined;
      });
      pending.push(source.pending);
    }
    return Promise.all(pending).then(() => {});
  }
  return {
    publicState(): CatalogPublicState {
      const examples: CatalogEmote[] = [];
      for (const provider of providers) {
        const seen = new Set<string>();
        const entries = [...sources.values()]
          .filter((source) => source.provider === provider)
          .flatMap((source) => source.entries);
        examples.push(
          ...entries
            .filter((entry) => {
              if (seen.has(entry.key)) return false;
              seen.add(entry.key);
              return true;
            })
            .slice(0, 6),
        );
      }
      examples.push(...demo.slice(0, 6));
      return structuredClone({
        ready: demo.length > 0,
        total: index.size,
        demoCount: demo.length,
        sources: [...sources.values()].map(
          ({ provider, scope, count, status, updatedAt, httpStatus }) => ({
            provider,
            scope,
            count,
            status,
            updatedAt,
            httpStatus,
          }),
        ),
        examples,
      });
    },
    lookup(name: string): CatalogEmote | undefined {
      const entry = index.get(name);
      return entry ? { ...entry } : undefined;
    },
    entries(): CatalogEmote[] {
      return [...index.values()].map((entry) => ({ ...entry }));
    },
    refresh,
    start() {
      if (closed || started) return;
      started = true;
      void refresh();
      if (options.autoRefresh !== false) {
        timer = setInterval(() => {
          void refresh();
        }, 1_800_000);
        timer.unref();
      }
    },
    syncAuth() {
      if (closed) return;
      const identity = options.auth.identity("broadcaster");
      if (identity === broadcaster) return;
      broadcaster = identity;
      if (identity)
        options.store.writeBatch([
          {
            sql: "DELETE FROM emote_cache WHERE scope LIKE 'channel:%' AND scope != ?",
            params: [`channel:${identity}`],
          },
        ]);
      for (const provider of providers)
        for (const scope of ["channel", "global"] as const) {
          if (scope === "global" && provider !== "twitch") continue;
          sources.get(key(provider, scope))?.controller?.abort();
          const source = load(provider, scope);
          source.lastAttempt = -Infinity;
          sources.set(key(provider, scope), source);
        }
      publish();
      if (started) void refresh(false);
    },
    close() {
      if (closed) return;
      closed = true;
      if (timer) clearInterval(timer);
      for (const source of sources.values()) source.controller?.abort();
    },
  };
}
