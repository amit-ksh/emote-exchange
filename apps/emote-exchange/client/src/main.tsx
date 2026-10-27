import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { FoundationSnapshot } from "../../src/public-state.ts";
import "./styles.css";

type ConnectionStatus = "connecting" | "connected" | "reconnecting";

function readSnapshot(value: unknown): FoundationSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.v !== 1 ||
    !Number.isSafeInteger(candidate.seq) ||
    (candidate.seq as number) < 0 ||
    candidate.app !== "Emote Exchange" ||
    candidate.mode !== "demo" ||
    candidate.phase !== "foundation" ||
    candidate.simulatorRunning !== false ||
    typeof candidate.overlayUrl !== "string"
  ) {
    return null;
  }
  try {
    const url = new URL(candidate.overlayUrl);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1"].includes(url.hostname) ||
      url.port !== window.location.port ||
      url.pathname !== "/overlay" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
  } catch {
    return null;
  }
  return {
    v: 1,
    seq: candidate.seq as number,
    app: "Emote Exchange",
    mode: "demo",
    phase: "foundation",
    simulatorRunning: false,
    overlayUrl: candidate.overlayUrl,
  };
}

function useFoundation(client: "dashboard" | "overlay") {
  const [snapshot, setSnapshot] = useState<FoundationSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const controller = new AbortController();
    let receivedStreamSnapshot = false;
    const events = new EventSource(`/events?client=${client}`);

    const receiveSnapshot = (event: MessageEvent<string>) => {
      try {
        const next = readSnapshot(JSON.parse(event.data));
        if (!next) {
          setStatus("reconnecting");
          return;
        }
        receivedStreamSnapshot = true;
        setSnapshot(next);
        setStatus("connected");
      } catch {
        setStatus("reconnecting");
      }
    };

    events.addEventListener("snapshot", receiveSnapshot);
    events.onerror = () => setStatus("reconnecting");

    void fetch("/api/snapshot", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Snapshot unavailable");
        const next = readSnapshot(await response.json());
        if (!next) throw new Error("Snapshot unavailable");
        if (!receivedStreamSnapshot) setSnapshot(next);
      })
      .catch(() => {
        if (!controller.signal.aborted && !receivedStreamSnapshot) {
          setStatus("reconnecting");
        }
      });

    return () => {
      controller.abort();
      events.removeEventListener("snapshot", receiveSnapshot);
      events.close();
    };
  }, [client]);

  return { snapshot, status };
}

function Wordmark() {
  return (
    <span className="wordmark">
      <span className="brand-mark" aria-hidden="true">
        EX
      </span>
      <span>Emote Exchange</span>
    </span>
  );
}

function measureOverlayScale() {
  return Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080);
}

function Dashboard() {
  const { snapshot, status } = useFoundation("dashboard");
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const fallbackOverlayUrl = new URL("/overlay", window.location.origin);
  fallbackOverlayUrl.hostname = "127.0.0.1";
  const overlayUrl = snapshot?.overlayUrl ?? fallbackOverlayUrl.href;
  const connectionLabel = {
    connecting: "Connecting to local server",
    connected: "Receiving local updates",
    reconnecting: "Reconnecting to local server",
  }[status];

  async function copyOverlayUrl() {
    try {
      await navigator.clipboard.writeText(overlayUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  }

  return (
    <div className="dashboard">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <Wordmark />
        <div className="header-context">
          <span className="local-label">LOCAL WORKSPACE</span>
          <span className="mode-tag">Demo mode</span>
        </div>
      </header>

      <main id="main">
        <section className="intro" aria-labelledby="intro-title">
          <div className="intro-copy">
            <p className="eyebrow">CHAT DRIVES THE MARKET.</p>
            <h1 id="intro-title">
              A little emote.
              <br />A lot of attention.
            </h1>
            <p className="intro-description">
              Your channel’s emotes, a play-money market, and a front-row seat in OBS. The local
              foundation is the first step.
            </p>
          </div>
          <aside className="foundation-status" aria-labelledby="foundation-title">
            <div className="status-heading">
              <span className={`status-indicator status-indicator--${status}`} aria-hidden="true" />
              <span className="eyebrow">FOUNDATION STATUS</span>
            </div>
            <h2 id="foundation-title">
              {snapshot ? "Local foundation ready." : "Checking the local server."}
            </h2>
            <p>
              The dashboard and transparent overlay are in place. Twitch connection, the simulator,
              and trading come next.
            </p>
            <div className="connection-status" role="status">
              <span>{connectionLabel}</span>
              <span className="connection-glyph" aria-hidden="true">
                {status === "connected" ? "✓" : "↻"}
              </span>
            </div>
          </aside>
        </section>

        <section className="overlay-setup" aria-labelledby="overlay-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">YOUR STREAM, YOUR EXCHANGE</p>
              <h2 id="overlay-title">Make room in OBS.</h2>
            </div>
            <a className="button button-primary" href={overlayUrl} target="_blank" rel="noreferrer">
              Open overlay <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className="overlay-details">
            <div className="overlay-url-block">
              <label htmlFor="overlay-url">Browser source URL</label>
              <div className="url-control">
                <input
                  id="overlay-url"
                  type="text"
                  value={overlayUrl}
                  readOnly
                  spellCheck={false}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button className="button button-secondary" type="button" onClick={copyOverlayUrl}>
                  {copyStatus === "copied" ? "Copied" : "Copy URL"}
                </button>
              </div>
              <p className="copy-feedback" role="status">
                {copyStatus === "copied"
                  ? "OBS URL copied to your clipboard."
                  : copyStatus === "failed"
                    ? "Clipboard unavailable. Select the URL above and copy it manually."
                    : "Add a Browser source in OBS and paste this URL."}
              </p>
            </div>
            <dl className="canvas-specs">
              <div>
                <dt>Canvas</dt>
                <dd>1920 × 1080</dd>
              </div>
              <div>
                <dt>Background</dt>
                <dd>Transparent</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>Local browser</dd>
              </div>
            </dl>
          </div>
          <div className="foundation-note">
            <span className="note-marker" aria-hidden="true">
              i
            </span>
            <p>
              The overlay currently shows a foundation label. Market widgets arrive in the next
              build.
            </p>
          </div>
        </section>

        <section className="build-next" aria-labelledby="next-title">
          <div className="next-intro">
            <h2 id="next-title">Next on the floor.</h2>
            <p>One complete loop, built in order.</p>
          </div>
          <ol className="next-list">
            <li>
              <span className="step-index" aria-hidden="true">
                01
              </span>
              <div>
                <h3>Connect the channel</h3>
                <p>Twitch login, chat events, and your emote catalog.</p>
              </div>
              <span className="planned-label">Planned</span>
            </li>
            <li>
              <span className="step-index" aria-hidden="true">
                02
              </span>
              <div>
                <h3>Give it a dry run</h3>
                <p>A seeded simulator, with no Twitch account required.</p>
              </div>
              <span className="planned-label">Planned</span>
            </li>
            <li>
              <span className="step-index" aria-hidden="true">
                03
              </span>
              <div>
                <h3>Open the market</h3>
                <p>Listings, trades, and market moments on your stream.</p>
              </div>
              <span className="planned-label">Planned</span>
            </li>
          </ol>
        </section>
      </main>

      <footer className="site-footer">
        <span>Built for chat. Kept on your machine.</span>
        <span>Play Coins only. No real money.</span>
      </footer>
    </div>
  );
}

function Overlay() {
  useFoundation("overlay");
  const [scale, setScale] = useState(measureOverlayScale);

  useEffect(() => {
    const resize = () => setScale(measureOverlayScale());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <main className="overlay-viewport" aria-label="Emote Exchange OBS overlay">
      <div className="overlay-canvas" style={{ transform: `scale(${scale})` }}>
        <section className="foundation-label" aria-label="Demo mode, market coming next">
          <span className="overlay-brand-mark" aria-hidden="true">
            EX
          </span>
          <div>
            <h1>Emote Exchange</h1>
            <p>
              <span>Demo mode</span>
              <span className="label-separator" aria-hidden="true">
                /
              </span>
              Market coming next
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

const isOverlay = window.location.pathname.replace(/\/$/, "") === "/overlay";
document.documentElement.dataset.view = isOverlay ? "overlay" : "dashboard";
const root = document.getElementById("root");
if (!root) throw new Error("App root is missing");
createRoot(root).render(<StrictMode>{isOverlay ? <Overlay /> : <Dashboard />}</StrictMode>);
