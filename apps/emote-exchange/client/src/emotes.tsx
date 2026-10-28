import type {
  CatalogEmote,
  CatalogPublicState,
  CatalogSource,
  Provider,
} from "@emote-exchange/twitch-kit";
import { useState } from "react";

const providers = ["twitch", "7tv", "bttv", "ffz"] as const;
const names = { twitch: "Twitch", "7tv": "7TV", bttv: "BTTV", ffz: "FFZ", demo: "Bundled demo" };
const labels: Record<CatalogSource["status"], string> = {
  idle: "Waiting",
  loading: "Refreshing",
  ready: "Ready",
  cached: "Cached",
  unavailable: "Unavailable",
  "not-configured": "No channel set",
  "needs-auth": "Connect Twitch",
};
export function readCatalog(value: unknown): CatalogPublicState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const count = (value: unknown) =>
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100_000;
  if (
    typeof source.ready !== "boolean" ||
    !count(source.total) ||
    !count(source.demoCount) ||
    !Array.isArray(source.sources) ||
    source.sources.length !== 8 ||
    !Array.isArray(source.examples) ||
    source.examples.length > 30
  )
    return null;
  const sources: CatalogSource[] = [];
  const seen = new Set<string>();
  for (const row of source.sources) {
    if (
      !row ||
      typeof row !== "object" ||
      !providers.includes(row.provider) ||
      !["channel", "global"].includes(row.scope) ||
      !count(row.count) ||
      !Object.hasOwn(labels, row.status) ||
      (row.updatedAt !== null &&
        (typeof row.updatedAt !== "number" ||
          !Number.isFinite(row.updatedAt) ||
          row.updatedAt < 0)) ||
      (row.httpStatus !== null &&
        (!Number.isInteger(row.httpStatus) || row.httpStatus < 100 || row.httpStatus > 599))
    )
      return null;
    const key = `${row.provider}:${row.scope}`;
    if (seen.has(key)) return null;
    seen.add(key);
    sources.push({
      provider: row.provider,
      scope: row.scope,
      count: row.count,
      status: row.status,
      updatedAt: row.updatedAt,
      httpStatus: row.httpStatus,
    });
  }
  const examples: CatalogEmote[] = [];
  for (const row of source.examples) {
    if (
      !row ||
      typeof row !== "object" ||
      ![...providers, "demo"].includes(row.provider) ||
      !["channel", "global", "demo"].includes(row.scope) ||
      typeof row.key !== "string" ||
      row.key.length > 160 ||
      typeof row.name !== "string" ||
      !/^[^\s<>]{1,100}$/u.test(row.name) ||
      typeof row.imageUrl !== "string" ||
      typeof row.animated !== "boolean"
    )
      return null;
    if (row.provider === "demo") {
      if (!/^\/demo-emotes\/[A-Za-z][A-Za-z0-9_]{0,63}\.svg$/.test(row.imageUrl)) return null;
    } else {
      try {
        const url = new URL(row.imageUrl);
        if (
          url.protocol !== "https:" ||
          ![
            "static-cdn.jtvnw.net",
            "cdn.7tv.app",
            "cdn.7tv.io",
            "cdn.betterttv.net",
            "cdn.frankerfacez.com",
          ].includes(url.hostname) ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          url.port
        )
          return null;
      } catch {
        return null;
      }
    }
    examples.push({
      provider: row.provider,
      scope: row.scope,
      key: row.key,
      name: row.name,
      imageUrl: row.imageUrl,
      animated: row.animated,
    });
  }
  return {
    ready: source.ready,
    total: source.total as number,
    demoCount: source.demoCount as number,
    sources,
    examples,
  };
}
function SourceCount({ source }: { source?: CatalogSource }) {
  return (
    <>
      <strong>{source?.count ?? 0}</strong>
      <span className="catalog-source-status">
        {source ? labels[source.status] : "Waiting"}
        {source?.httpStatus && source.httpStatus !== 200 ? ` · HTTP ${source.httpStatus}` : ""}
      </span>
    </>
  );
}
export function EmoteCatalogPanel({ catalog }: { catalog?: CatalogPublicState }) {
  const [feedback, setFeedback] = useState("");
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");
  const [limit, setLimit] = useState(24);
  const [busy, setBusy] = useState(false);
  const refreshing = catalog?.sources.some((source) => source.status === "loading") ?? false;
  async function refresh() {
    setBusy(true);
    try {
      const result = await fetch("/api/emotes/refresh", {
        method: "POST",
        headers: { "X-CTA": "1" },
      });
      if (!result.ok) throw new Error();
      setFeedback("Refresh requested. Provider results update below.");
    } catch {
      setFeedback("Could not request a refresh. Check your local connection.");
    } finally {
      setBusy(false);
    }
  }
  const source = (provider: Provider, scope: CatalogSource["scope"]) =>
    catalog?.sources.find((entry) => entry.provider === provider && entry.scope === scope);
  return (
    <section className="overlay-setup" aria-labelledby="catalog-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">THE EMOTE CATALOG</p>
          <h2 id="catalog-title">Emote catalog</h2>
        </div>
        <button
          className="button button-secondary"
          type="button"
          disabled={!catalog || busy || refreshing}
          onClick={() => {
            void refresh();
          }}
        >
          {refreshing ? "Refreshing emotes…" : "Refresh emotes"}
        </button>
      </div>
      <p>
        {catalog?.total ?? 0} unique emote names available, including {catalog?.demoCount ?? 0}{" "}
        bundled originals. Demo emotes work offline; provider sets refresh in the background every
        30 minutes.
      </p>
      <div className="provider-grid">
        {providers.map((provider) => (
          <div className="provider-tile" key={provider}>
            <h3>{names[provider]}</h3>
            <div className="provider-counts">
              <div data-provider={provider} data-scope="channel">
                <span>Channel</span>
                <SourceCount source={source(provider, "channel")} />
              </div>
              <div data-provider={provider} data-scope="global">
                <span>Global</span>
                <SourceCount source={source(provider, "global")} />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="emote-toolbar">
        <label>
          Search emotes
          <input
            type="search"
            placeholder="Search emote names"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(24);
            }}
          />
        </label>
        <div className="filter-chips">
          {["all", ...providers, "demo"].map((provider) => (
            <button
              type="button"
              key={provider}
              aria-pressed={providerFilter === provider}
              onClick={() => {
                setProviderFilter(provider);
                setLimit(24);
              }}
            >
              {provider === "all" ? "All" : names[provider as keyof typeof names]}
            </button>
          ))}
        </div>
      </div>

      {catalog?.sources.some(
        (source) => source.provider === "7tv" && source.status === "not-configured",
      ) && (
        <p className="copy-feedback">
          No active 7TV channel set was found.{" "}
          <a href="https://7tv.app/" target="_blank" rel="noreferrer">
            Manage your 7TV set
          </a>
          , then refresh here.
        </p>
      )}
      <p className="copy-feedback" role="status">
        {feedback}
      </p>
      <ul className="emote-examples" aria-label="Emote samples">
        {catalog?.examples
          .filter(
            (emote) =>
              (providerFilter === "all" || emote.provider === providerFilter) &&
              emote.name.toLowerCase().includes(query.toLowerCase()),
          )
          .slice(0, limit)
          .map((emote) => (
            <li className="emote-example" key={`${emote.provider}:${emote.scope}:${emote.key}`}>
              <span className="emote-image">
                <span aria-hidden="true">✦</span>
                <img
                  src={emote.imageUrl}
                  alt=""
                  width="48"
                  height="48"
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  data-provider={emote.provider}
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              </span>
              <span className="emote-name">{emote.name}</span>
              <span className="catalog-source-status">{names[emote.provider]}</span>
            </li>
          ))}
      </ul>
      {catalog &&
        !catalog.examples.some(
          (emote) =>
            (providerFilter === "all" || emote.provider === providerFilter) &&
            emote.name.toLowerCase().includes(query.toLowerCase()),
        ) && <p className="empty-state">No emotes match your search.</p>}
      {catalog &&
        catalog.examples.filter(
          (emote) =>
            (providerFilter === "all" || emote.provider === providerFilter) &&
            emote.name.toLowerCase().includes(query.toLowerCase()),
        ).length > limit && (
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setLimit(limit + 24)}
          >
            Show more
          </button>
        )}
    </section>
  );
}
