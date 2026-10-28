import { memo, useEffect, useId, useState } from "react";
import type { AnalyticsMetrics, AnalyticsSnapshot } from "./analytics-model.ts";
import { readAnalytics } from "./analytics-model.ts";

type Source = "twitch" | "sim" | "all";
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
const compact = (value: number) =>
  value.toLocaleString(undefined, {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  });
function useAnalytics() {
  const [snapshot, setSnapshot] = useState<AnalyticsSnapshot | null>(null);
  const [status, setStatus] = useState("connecting");
  useEffect(() => {
    const events = new EventSource("/api/analytics/events");
    let sequence = -1;
    events.onopen = () => {
      sequence = -1;
    };
    const receive = (event: MessageEvent<string>) => {
      try {
        const next = readAnalytics(JSON.parse(event.data));
        if (!next) throw new Error();
        if (next.seq <= sequence) return;
        sequence = next.seq;
        setSnapshot(next);
        setStatus("connected");
      } catch {
        setStatus("reconnecting");
      }
    };
    events.addEventListener("analytics", receive);
    events.onerror = () => setStatus("reconnecting");
    return () => {
      events.removeEventListener("analytics", receive);
      events.close();
    };
  }, []);
  return { snapshot, status };
}
function Sparkline({ label, values }: { label: string; values: number[] }) {
  const id = useId();
  const maximum = Math.max(1, ...values);
  const last = values.at(-1) ?? 0;
  const points = values
    .map((value, index) => `${(index * 600) / 59},${96 - (value / maximum) * 88}`)
    .join(" ");
  return (
    <div className="live-spark">
      <div>
        <span>{label}</span>
        <strong>{number(last)}</strong>
      </div>
      <svg viewBox="0 0 600 104" role="img" aria-labelledby={id} preserveAspectRatio="none">
        <title id={id}>
          {label}: last 60 minutes, latest {number(last)}, peak {number(Math.max(...values))}.
        </title>
        <path d="M0 96H600" className="spark-baseline" />
        <polyline points={points} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
function Stat({
  label,
  value,
  unit = "",
  baseline,
  note = "This Stream",
}: {
  label: string;
  value: number;
  unit?: string;
  baseline?: number;
  note?: string;
}) {
  const delta = baseline === undefined ? null : value - baseline;
  return (
    <section className="stat-card">
      <span>{label}</span>
      <strong className="display-number" title={`${number(value)}${unit}`}>
        {compact(value)}
        {unit}
      </strong>
      <span className="live-stat-note">{note}</span>
      {delta !== null && (
        <span className="live-stat-note">{`${delta >= 0 ? "+" : "−"}${number(Math.abs(delta))}${unit ? " pp" : ""} vs recent median`}</span>
      )}
    </section>
  );
}
function Economy({ data }: { data: AnalyticsMetrics }) {
  const labels = {
    starting: "Starting Coins",
    stipend: "Stipend",
    follow: "Follow",
    visa: "Raid Visa",
    greeting: "Greeting",
    grant: "Grant",
  };
  return (
    <section className="market-panel live-card">
      <h2>Economy</h2>
      <dl className="live-ledger">
        <dt>Coins held by Traders</dt>
        <dd>{number(data.coinsHeld)}</dd>
        <dt>Coins issued this Stream</dt>
        <dd>{number(Object.values(data.issued).reduce((sum, value) => sum + value, 0))}</dd>
        {(Object.keys(labels) as (keyof typeof labels)[]).map((key) => (
          <div className="ledger-source" key={key}>
            <dt>{labels[key]}</dt>
            <dd>+{number(data.issued[key])}</dd>
          </div>
        ))}
        <dt>Fees burned</dt>
        <dd>{number(data.fees)}</dd>
      </dl>
      <p className="copy-feedback">
        Play rewards issue new Coins. Fees exclude settlement rounding.
      </p>
    </section>
  );
}
function LiveContent() {
  const { snapshot, status } = useAnalytics();
  const [selection, setSelection] = useState<Source | null>(null);
  const source = selection ?? (snapshot?.hasLive ? "twitch" : "sim");
  const data = snapshot?.[source];
  const baseline = source === "twitch" ? snapshot?.comparison : null;
  const selectedMoments =
    snapshot?.moments.filter((row) => source === "all" || row.origin === source) ?? [];
  const minutes = Math.floor((snapshot?.stream.uptimeMs ?? 0) / 60_000);
  return (
    <div className="live-page">
      <div className="live-toolbar">
        <fieldset className="live-source">
          <legend>Event source</legend>
          {(
            [
              ["twitch", "Live"],
              ["sim", "Sim"],
              ["all", "All"],
            ] as const
          ).map(([value, label]) => (
            <button
              className="button"
              type="button"
              key={value}
              aria-pressed={source === value}
              onClick={() => setSelection(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <div className="live-stream-meta">
          {source !== "twitch" && <span className="tag">SIM</span>}
          <span>
            {snapshot?.stream.open
              ? `Stream ${snapshot.stream.number} · ${Math.floor(minutes / 60)}h ${minutes % 60}m`
              : "Market closed"}
          </span>
          {data && (
            <span>
              {data.follows} follows · {data.raids} raids
            </span>
          )}
        </div>
      </div>
      <p className="copy-feedback">
        Counters reset when the app restarts.{" "}
        {source === "all"
          ? "All includes live and simulated events."
          : source === "sim"
            ? "Showing simulated engagement."
            : "Broadcaster, foreign and bot messages are excluded."}
      </p>
      {status !== "connected" && (
        <p role="status" className="inline-notice">
          {status === "connecting"
            ? "Connecting to Live analytics…"
            : "Reconnecting to analytics… Showing the last received counters."}
        </p>
      )}
      {!snapshot ? (
        <p className="empty-state">Waiting for your local Exchange.</p>
      ) : !snapshot.stream.open ? (
        <section className="market-panel live-empty">
          <h2>Ready for your next Stream</h2>
          <p>Open the market to start collecting. In demo mode, press Start demo.</p>
          <a className="button button-primary" href="#demo">
            Open Demo
          </a>
        </section>
      ) : (
        data && (
          <>
            <div className="overview-stats live-stats">
              <Stat
                label="Messages per min"
                note="Last 60 seconds"
                value={data.messagesPerMinute}
                baseline={baseline?.messagesPerMinute}
              />
              <Stat
                label="Active chatters"
                note="Last 5 minutes"
                value={data.activeChatters}
                baseline={baseline?.activeChatters}
              />
              <Stat
                label="Trading participation"
                value={data.participation}
                unit="%"
                baseline={baseline?.participation}
              />
              <Stat
                label="Trades per min"
                note="Last 60 seconds"
                value={data.tradesPerMinute}
                baseline={baseline?.tradesPerMinute}
              />
            </div>
            {baseline && (
              <p className="copy-feedback">
                Compared with the median of {baseline.streams} completed live Streams. Active
                chatters compares against recent peaks.
              </p>
            )}
            <div className="live-grid">
              <section className="market-panel live-card">
                <h2>Chat activity</h2>
                <Sparkline
                  label="Messages per minute"
                  values={data.sparkline.map((row) => row.messages)}
                />
                <Sparkline
                  label="Active chatters · 5 minute window"
                  values={data.sparkline.map((row) => row.active)}
                />
                <div className="live-chart-axis">
                  <span>60 minutes ago</span>
                  <span>Now</span>
                </div>
                <p className="copy-feedback">
                  Commands count as messages. Each line has its own scale.
                </p>
              </section>
              <section className="market-panel live-card">
                <h2>Trading activity</h2>
                <Sparkline
                  label="Trades per minute"
                  values={data.sparkline.map((row) => row.trades)}
                />
                <Sparkline
                  label="Coins traded per minute"
                  values={data.sparkline.map((row) => row.coins)}
                />
                <div className="live-chart-axis">
                  <span>60 minutes ago</span>
                  <span>Now</span>
                </div>
                <p className="copy-feedback">Coins traded uses applied buy and sell settlements.</p>
              </section>
            </div>
            <div className="live-grid">
              <Economy data={data} />
              <section className="market-panel live-card">
                <h2>Greetings &amp; returning Traders</h2>
                <dl className="live-ledger">
                  <dt>Greetings this Stream</dt>
                  <dd>{number(data.greetings.claims)}</dd>
                  <dt>Returning · Streak 2 or more</dt>
                  <dd>{number(data.greetings.returning)}</dd>
                  <dt>Longest live Streak</dt>
                  <dd>
                    {data.greetings.longest
                      ? `${data.greetings.longest.name} · ${data.greetings.longest.streak}`
                      : "—"}
                  </dd>
                  <dt>New chatters this Stream</dt>
                  <dd>{data.newChatters}</dd>
                  <dt>First Trade within 10 minutes</dt>
                  <dd>
                    {data.convertedNewChatters} / {data.newChatters}
                  </dd>
                  <dt>Distinct chatters this Stream</dt>
                  <dd>{data.distinctChatters}</dd>
                </dl>
                <p className="copy-feedback">
                  New chatters are first-time channel participants observed by the Exchange.
                </p>
              </section>
            </div>
            <div className="live-grid">
              <section className="market-panel live-card">
                <div className="section-heading">
                  <h2>Market now</h2>
                  <span className="tag neutral">{snapshot.market.activeListings} Listings</span>
                </div>
                <p className="live-hottest">
                  {snapshot.market.hottest ? (
                    <>
                      <strong>{snapshot.market.hottest.ticker}</strong>
                      <span>Hottest · {snapshot.market.hottest.price.toFixed(2)}</span>
                    </>
                  ) : (
                    "Two chatters can list the first emote."
                  )}
                </p>
                {(
                  [
                    ["up", "Biggest movers up"],
                    ["down", "Biggest movers down"],
                  ] as const
                ).map(([side, label]) => (
                  <div className="live-movers" key={side}>
                    <h3>{label}</h3>
                    {snapshot.market[side].length ? (
                      <ul>
                        {snapshot.market[side].map((row) => (
                          <li key={row.ticker}>
                            <span>{row.ticker}</span>
                            <strong>
                              {side === "up" ? "↑" : "↓"} {number(Math.abs(row.changePercent))}%
                            </strong>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="copy-feedback">No movers yet.</p>
                    )}
                  </div>
                ))}
                <p className="copy-feedback">
                  Changes compare with Session Open Prices. The market is shared by Live and Sim.
                </p>
              </section>
              <section className="market-panel live-card">
                <h2>Moments</h2>
                <ol className="live-moments">
                  {selectedMoments
                    .slice()
                    .reverse()
                    .map((row) => (
                      <li key={row.number}>
                        <span className="tag neutral">{row.kind}</span>
                        <strong>{row.ticker ?? row.name ?? "Market"}</strong>
                        <time>
                          {new Date(row.at).toLocaleTimeString(undefined, {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                            hour12: false,
                          })}
                        </time>
                      </li>
                    ))}
                </ol>
                {!selectedMoments.length && (
                  <p className="empty-state">
                    IPOs, Halts, Moons, Crashes and Raids will appear here.
                  </p>
                )}
              </section>
            </div>
          </>
        )
      )}
    </div>
  );
}
// The dashboard's general market stream may update faster; this subtree only
// changes when its own one-Hz analytics stream or source selection changes.
export const LivePage = memo(LiveContent);
