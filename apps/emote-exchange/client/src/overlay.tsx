import type { CSSProperties } from "react";
import { memo, useEffect, useRef, useState } from "react";
import type { MarketMoment } from "../../src/engine/market.ts";
import type { OverlayListing, OverlayMarket } from "./overlay-model.ts";
import {
  changeLabel,
  compactCoins,
  overlayOptions,
  priceLabel,
  readableChatColor,
} from "./overlay-model.ts";
import { useOverlayStream } from "./overlay-stream.ts";
import "./overlay.css";

function Change({ value }: { value: number | null }) {
  return (
    <span
      className={`ex-change ${value === null || value === 0 ? "flat" : value > 0 ? "up" : "down"}`}
    >
      <span aria-hidden="true">
        {value === null ? "" : value > 0 ? "↑" : value < 0 ? "↓" : "→"}
      </span>{" "}
      {changeLabel(value)}
    </span>
  );
}
function EmoteImage({ url, size = 40 }: { url?: string; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  return url && failed !== url ? (
    <img
      className="ex-emote"
      src={url}
      width={size}
      height={size}
      alt=""
      onError={() => setFailed(url)}
    />
  ) : (
    <span className="ex-emote-fallback" style={{ width: size, height: size }}>
      {size < 40 ? "✦" : "EX"}
    </span>
  );
}
function shortName(value: string, max: number) {
  const chars = [...value];
  return chars.length <= max
    ? value
    : `${chars.slice(0, max - 5).join("")}…${chars.slice(-4).join("")}`;
}
const Tape = memo(function Tape({
  listings,
  reduced,
  now,
}: {
  listings: OverlayListing[];
  reduced: boolean;
  now: number;
}) {
  const previous = useRef(new Map<string, number>());
  const directions = new Map(
    listings.map((listing) => [
      listing.ticker,
      (previous.current.get(listing.ticker) ?? listing.price) < listing.price
        ? "up"
        : (previous.current.get(listing.ticker) ?? listing.price) > listing.price
          ? "down"
          : "flat",
    ]),
  );
  useEffect(() => {
    previous.current = new Map(listings.map((listing) => [listing.ticker, listing.price]));
  }, [listings]);
  if (!listings.length)
    return (
      <section className="ex-tape ex-panel" aria-label="Price tape">
        <span className="ex-tape-brand">EX</span>
        <p className="ex-tape-empty">
          Two chatters list an emote. Type <strong>!market</strong>
        </p>
      </section>
    );
  const copies = Math.max(1, Math.ceil(5 / listings.length));
  const all = Array.from({ length: copies }, () => listings).flat();
  const distance = all.length * 520;
  const reducedPage = Math.floor(now / 8000) % Math.ceil(listings.length / 3);
  const item = (listing: OverlayListing, index: number) => (
    <div
      className="ex-tape-item"
      key={`${listing.ticker}:${index}`}
      title={`${listing.ticker} ${listing.price.toFixed(2)}`}
    >
      <EmoteImage url={listing.imageUrl} />
      <strong className="ex-ticker">{listing.ticker}</strong>
      <span
        key={`${listing.ticker}:${listing.price}`}
        className={`ex-price-tick ${directions.get(listing.ticker)}`}
      >
        {priceLabel(listing.price)}
      </span>
      {listing.haltedUntil > now ? (
        <span className="ex-halt">Ⅱ HALT</span>
      ) : (
        <Change value={listing.sessionChangePercent} />
      )}
    </div>
  );
  return (
    <section className="ex-tape ex-panel" aria-label="Price tape">
      <span className="ex-tape-brand">EX</span>
      <div className="ex-tape-window">
        {reduced ? (
          <div className="ex-tape-static" key={reducedPage}>
            {listings.slice(reducedPage * 3, reducedPage * 3 + 3).map(item)}
          </div>
        ) : (
          <div
            className="ex-tape-track"
            style={
              {
                "--tape-distance": `${distance}px`,
                "--tape-duration": `${distance / 60}s`,
              } as CSSProperties
            }
          >
            <div className="ex-tape-group">{all.map(item)}</div>
            <div className="ex-tape-group" aria-hidden="true">
              {all.map(item)}
            </div>
          </div>
        )}
      </div>
    </section>
  );
});

function PricePlot({
  listing,
  now,
  visible,
}: {
  listing: OverlayListing;
  now: number;
  visible: boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current;
    if (!node || !visible) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    node.width = 472 * ratio;
    node.height = 110 * ratio;
    const context = node.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.clearRect(0, 0, 472, 110);
    const points = listing.candles.map((candle) => ({
      at: candle.minuteStart,
      price: candle.close,
    }));
    if (points.length) points[points.length - 1] = { at: now, price: listing.price };
    if (!points.length) return;
    const values = points.map((point) => point.price);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(1, (max - min) * 0.12);
    const x = (at: number) =>
      Math.min(364, Math.max(2, 2 + ((at - (now - 600_000)) / 600_000) * 362));
    const y = (price: number) => 100 - ((price - (min - pad)) / (max - min + 2 * pad)) * 92;
    context.strokeStyle = "#ffffff20";
    context.lineWidth = 1;
    for (const line of [12, 56, 100]) {
      context.beginPath();
      context.moveTo(0, line);
      context.lineTo(366, line);
      context.stroke();
    }
    const color = listing.sessionChangePercent < 0 ? "#FF5A5F" : "#2BD47D";
    if (points.length > 1) {
      const fill = context.createLinearGradient(0, 0, 0, 110);
      fill.addColorStop(0, `${color}42`);
      fill.addColorStop(1, `${color}00`);
      context.beginPath();
      context.moveTo(x(points[0].at), 110);
      for (const point of points) context.lineTo(x(point.at), y(point.price));
      context.lineTo(x(points.at(-1)?.at ?? now), 110);
      context.closePath();
      context.fillStyle = fill;
      context.fill();
    }
    context.beginPath();
    points.forEach((point, index) => {
      if (index === 0) context.moveTo(x(point.at), y(point.price));
      else context.lineTo(x(point.at), y(point.price));
    });
    context.strokeStyle = color;
    context.lineWidth = 2.5;
    context.lineJoin = "round";
    context.stroke();
    context.beginPath();
    context.arc(x(now), y(listing.price), 4, 0, Math.PI * 2);
    context.fillStyle = "#F5F2FA";
    context.fill();
    context.font = '24px "JetBrains Mono", monospace';
    context.fillStyle = "#D4D0DF";
    context.textAlign = "right";
    context.fillText(compactCoins(max), 472, 28);
    context.fillText(compactCoins(min), 472, 103);
  }, [listing, now, visible]);
  return (
    <canvas
      ref={canvas}
      className="ex-plot"
      aria-label={`${listing.ticker} Price over the last ten minutes`}
      role="img"
    />
  );
}
function ChartFace({
  listing,
  now,
  visible,
}: {
  listing: OverlayListing;
  now: number;
  visible: boolean;
}) {
  return (
    <div className="ex-chart-face">
      <div className="ex-chart-heading">
        <span className="ex-label">HOTTEST LISTING</span>
        <EmoteImage url={listing.imageUrl} size={64} />
      </div>
      <h2 className="ex-chart-ticker" title={listing.ticker}>
        {listing.ticker}
      </h2>
      <div className="ex-chart-price">
        {priceLabel(listing.price)} <Change value={listing.sessionChangePercent} />
      </div>
      <PricePlot listing={listing} now={now} visible={visible} />
      <div className="ex-chart-axis">
        <span>−10m</span>
        <span>now</span>
      </div>
    </div>
  );
}
const Chart = memo(function Chart({
  listing,
  now,
  visible,
}: {
  listing?: OverlayListing;
  now: number;
  visible: boolean;
}) {
  const old = useRef<OverlayListing | undefined>(undefined);
  const [outgoing, setOutgoing] = useState<OverlayListing | undefined>(undefined);
  useEffect(() => {
    if (old.current && listing && old.current.ticker !== listing.ticker) setOutgoing(old.current);
    old.current = listing;
    const timer = setTimeout(() => setOutgoing(undefined), 240);
    return () => clearTimeout(timer);
  }, [listing]);
  return (
    <section className="ex-chart ex-panel" aria-label="Listing chart">
      {outgoing && (
        <div className="ex-chart-outgoing">
          <ChartFace listing={outgoing} now={now} visible={visible} />
        </div>
      )}
      {listing ? (
        <div className="ex-chart-incoming" key={listing.ticker}>
          <ChartFace listing={listing} now={now} visible={visible} />
        </div>
      ) : (
        <div className="ex-empty">
          <p className="ex-label">HOTTEST LISTING</p>
          <h2>Waiting for a Listing</h2>
          <p>
            Two chatters. One emote.
            <br />
            That’s an IPO.
          </p>
        </div>
      )}
    </section>
  );
});
const Board = memo(function Board({ market, pulse }: { market: OverlayMarket; pulse: boolean }) {
  const top = market.traders.slice(0, 5);
  return (
    <section
      className={`ex-board ex-panel ${pulse ? "ex-board-pulse" : ""}`}
      aria-label="Top Traders"
    >
      <header>
        <h2>TOP TRADERS</h2>
        <span>NET WORTH</span>
      </header>
      {!top.length ? (
        <p className="ex-board-empty">
          Your first message starts
          <br />
          your Portfolio.
        </p>
      ) : (
        <ol>
          {top.map((trader, index) => (
            <li key={trader.userId} style={{ transform: `translateY(${index * 38}px)` }}>
              <span className="ex-rank">{index + 1}</span>
              <span
                className="ex-trader-name"
                style={{ color: readableChatColor(trader.color) }}
                title={trader.name}
              >
                {shortName(trader.name, 11)}
              </span>
              <span className="ex-worth">
                {trader.capped ? "≥" : ""}
                {compactCoins(trader.netWorth)}
              </span>
              <Change value={trader.sessionChangePercent} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});

function feedText(moment: MarketMoment) {
  switch (moment.kind) {
    case "TRADE":
      return `${moment.name ?? "Trader"} ${moment.side?.toUpperCase()} ${moment.shares} ${moment.ticker} @ ${priceLabel(moment.price ?? 1)}`;
    case "FOLLOW":
      return `${moment.name} joined · +${moment.coins} Coins`;
    case "VISA":
      return `${moment.name} · Raid Visa +${moment.coins}`;
    case "RAID":
      return `${moment.name} raided · ${moment.viewers} viewers`;
    case "IPO":
      return `${moment.ticker} listed at ${priceLabel(moment.price ?? 100)}`;
    case "DELIST":
      return `${moment.ticker} delisted · holders paid`;
    case "BELL":
      return moment.phase === "close"
        ? "Closing bell · Session complete"
        : "Opening bell · Market open";
    case "PAUSED":
      return moment.paused ? "Market paused" : "Market resumed";
    case "HALT":
      return `${moment.ticker} · trading halted`;
    case "MOON":
      return `${moment.ticker} to the Moon`;
    case "CRASH":
      return `${moment.ticker} · Crash`;
    default:
      return "";
  }
}
function Feed({
  moments,
  listings,
  now,
}: {
  moments: MarketMoment[];
  listings: OverlayListing[];
  now: number;
}) {
  return (
    <section className="ex-feed" aria-label="Recent market events">
      <h2 className="ex-label">ON THE FLOOR</h2>
      <div>
        {moments.map((moment) => (
          <article
            key={moment.id}
            className={`ex-feed-item ex-panel ${moment.side === "sell" || moment.kind === "CRASH" ? "down" : ""}`}
            aria-label={feedText(moment)}
            style={{ opacity: moment.at + 8000 - now < 250 ? 0 : 1 }}
          >
            <EmoteImage
              url={listings.find((listing) => listing.ticker === moment.ticker)?.imageUrl}
              size={28}
            />
            {moment.kind === "TRADE" ? (
              <>
                <span className="ex-feed-name" title={moment.name}>
                  {shortName(moment.name ?? "Trader", 7)}
                </span>
                <div className="ex-feed-trade">
                  <strong title={`${moment.side} ${moment.shares}`}>
                    {moment.side?.toUpperCase()}{" "}
                    {new Intl.NumberFormat("en-US", {
                      notation: "compact",
                      maximumSignificantDigits: 3,
                    }).format(moment.shares ?? 0)}
                  </strong>
                  <span title={moment.ticker}>{moment.ticker}</span>
                  <span>{priceLabel(moment.price ?? 1)}</span>
                </div>
              </>
            ) : (
              <p>{feedText(moment)}</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
function bannerCopy(moment: MarketMoment, now: number) {
  switch (moment.kind) {
    case "IPO":
      return {
        label: "NEW LISTING",
        title: moment.ticker ?? "IPO",
        detail: `Opening Price ${priceLabel(moment.price ?? 100)} · now trading`,
      };
    case "HALT":
      return {
        label: "TRADING HALTED",
        title: moment.ticker ?? "Halt",
        detail: `${Math.max(0, Math.ceil((moment.at + 30_000 - now) / 1000))}s remaining · Prices keep moving`,
      };
    case "MOON":
      return {
        label: "TO THE MOON",
        title: moment.ticker ?? "Moon",
        detail: "2.5× Session Open Price",
      };
    case "CRASH":
      return {
        label: "MARKET CRASH",
        title: moment.ticker ?? "Crash",
        detail: "0.4× Session Open Price",
      };
    case "RAID":
      return {
        label: "RAID INCOMING",
        title: `${compactCoins(moment.viewers ?? 0)} viewers`,
        detail: `${moment.name ?? "A channel"} arrived · first-time chatters earn a Visa`,
      };
    case "DELIST":
      return {
        label: "LISTING DELISTED",
        title: moment.ticker ?? "Delist",
        detail: "Holdings settled · no fee",
      };
    case "PAUSED":
      return {
        label: "EMOTE EXCHANGE",
        title: moment.paused ? "MARKET PAUSED" : "MARKET RESUMED",
        detail: moment.paused
          ? "Prices keep moving · Trades on hold"
          : "The floor is open for trading",
      };
    default: {
      const summary = moment.summary;
      return moment.phase === "close"
        ? {
            label: "CLOSING BELL",
            title: summary?.richest
              ? `@${summary.richest.name} leads the floor`
              : "SESSION COMPLETE",
            detail: summary?.topGainer
              ? `${summary.topGainer.ticker} ${changeLabel(summary.topGainer.changePercent)} · ${summary.biggestCrash?.ticker ?? "—"} ${changeLabel(summary.biggestCrash?.changePercent ?? null)}`
              : "The bell rings. Trading stays open.",
          }
        : {
            label: "OPENING BELL",
            title: "MARKET OPEN",
            detail: "Chat is the market. Make your move.",
          };
    }
  }
}
function Banner({
  active,
  listings,
  now,
}: {
  active: { moment: MarketMoment; until: number } | null;
  listings: OverlayListing[];
  now: number;
}) {
  if (!active) return null;
  const { moment } = active;
  const copy = bannerCopy(moment, now);
  return (
    <section
      key={moment.id}
      className={`ex-banner ex-panel ex-banner-${moment.kind.toLowerCase()}`}
      aria-label={`${copy.label}: ${copy.title}. ${copy.detail}`}
      data-leaving={active.until - now < 250}
    >
      <div className="ex-banner-icon">
        <EmoteImage
          url={listings.find((listing) => listing.ticker === moment.ticker)?.imageUrl}
          size={72}
        />
      </div>
      <div className="ex-banner-copy">
        <p className="ex-label">{copy.label}</p>
        <h2 title={copy.title}>{copy.title}</h2>
        <p className="ex-banner-detail">{copy.detail}</p>
      </div>
      <span
        className="ex-banner-progress"
        style={{ transform: `scaleX(${Math.max(0, (active.until - now) / 4000)})` }}
      />
    </section>
  );
}

export function ExchangeOverlay() {
  const stream = useOverlayStream();
  const [size, setSize] = useState(() =>
    Math.min(window.innerWidth / 1920, window.innerHeight / 1080),
  );
  const [prefersReduced, setPrefersReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const resize = () => setSize(Math.min(window.innerWidth / 1920, window.innerHeight / 1080));
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => setPrefersReduced(media.matches);
    window.addEventListener("resize", resize);
    media.addEventListener("change", preference);
    return () => {
      window.removeEventListener("resize", resize);
      media.removeEventListener("change", preference);
    };
  }, []);
  const options = overlayOptions(window.location.search, prefersReduced);
  const market = stream.market;
  const listings = market?.listings ?? [];
  const now = Math.floor(stream.now / 1000) * 1000;
  const pulse = stream.queue.topUntil > stream.now;
  return (
    <main className="overlay-viewport" aria-label="Emote Exchange OBS overlay">
      <div
        className="overlay-canvas exchange-overlay"
        data-reduced={options.reduced}
        data-hidden={!stream.visible}
        style={{ transform: `scale(${size})` }}
      >
        {stream.sim && (
          <aside className="ex-sim" aria-label="Simulation running">
            SIM
          </aside>
        )}
        {(stream.status !== "connected" || market?.status === "storage-error") && (
          <aside className="ex-connection">
            {market?.status === "storage-error"
              ? "Market unavailable · check dashboard"
              : stream.status === "connecting"
                ? "Connecting to the Exchange…"
                : "Reconnecting to the Exchange…"}
          </aside>
        )}
        {options.widgets.has("chart") && (
          <Chart
            listing={listings.find((listing) => listing.ticker === stream.selected?.ticker)}
            now={now}
            visible={stream.visible}
          />
        )}
        {options.widgets.has("board") && market && <Board market={market} pulse={pulse} />}
        {options.widgets.has("feed") && (
          <Feed moments={stream.queue.feed} listings={listings} now={stream.now} />
        )}
        {options.widgets.has("banners") && (
          <Banner active={stream.queue.active} listings={listings} now={stream.now} />
        )}
        {options.widgets.has("tape") && (
          <Tape listings={listings} reduced={options.reduced} now={now} />
        )}
      </div>
    </main>
  );
}
