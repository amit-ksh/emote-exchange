import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { FoundationSnapshot } from "../../src/public-state.ts";
import { ChatOutPanel, readChatOut } from "./chat-out.tsx";
import { EmoteCatalogPanel, readCatalog } from "./emotes.tsx";
import { EventSubPanel, readEventSub } from "./eventsub.tsx";
import { OverlayUrlPanel, SetupChecklist } from "./setup.tsx";
import { readSimulator, SimulatorPanel } from "./simulator.tsx";
import "./styles.css";

type ConnectionStatus = "connecting" | "connected" | "reconnecting";

function readAuth(value: unknown): FoundationSnapshot["auth"] | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.configured !== "boolean") return null;
  const result = { configured: source.configured } as FoundationSnapshot["auth"];
  for (const role of ["broadcaster", "bot"] as const) {
    const account = source[role] as Record<string, unknown> | undefined;
    if (
      !account ||
      typeof account.connected !== "boolean" ||
      (account.login !== null && typeof account.login !== "string") ||
      typeof account.reconnect !== "boolean" ||
      !Array.isArray(account.scopes) ||
      !account.scopes.every((scope) => typeof scope === "string")
    )
      return null;
    result[role] = {
      connected: account.connected,
      login: account.login as string | null,
      reconnect: account.reconnect,
      scopes: account.scopes as string[],
    };
  }
  return result;
}

function readSnapshot(value: unknown): FoundationSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const auth = readAuth(candidate.auth);
  const eventsub = readEventSub(candidate.eventsub);
  const chatOut = readChatOut(candidate.chatOut);
  const catalog = readCatalog(candidate.catalog);
  const simulator = readSimulator(candidate.simulator);
  if (
    candidate.v !== 1 ||
    !Number.isSafeInteger(candidate.seq) ||
    (candidate.seq as number) < 0 ||
    candidate.app !== "Emote Exchange" ||
    !["demo", "live"].includes(candidate.mode as string) ||
    candidate.phase !== "foundation" ||
    typeof candidate.simulatorRunning !== "boolean" ||
    typeof candidate.overlayUrl !== "string" ||
    !Number.isSafeInteger(candidate.overlayClients) ||
    (candidate.overlayClients as number) < 0 ||
    !Number.isSafeInteger(candidate.connectionChecks) ||
    (candidate.connectionChecks as number) < 0 ||
    !Array.isArray(candidate.moments) ||
    !auth ||
    !eventsub ||
    !chatOut ||
    !catalog ||
    !simulator ||
    simulator.running !== candidate.simulatorRunning
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
    mode: candidate.mode as FoundationSnapshot["mode"],
    phase: "foundation",
    simulatorRunning: candidate.simulatorRunning,
    overlayUrl: candidate.overlayUrl,
    overlayClients: candidate.overlayClients as number,
    connectionChecks: candidate.connectionChecks as number,
    auth,
    eventsub,
    chatOut,
    catalog,
    simulator,
    moments: candidate.moments.filter(
      (moment): moment is FoundationSnapshot["moments"][number] =>
        typeof moment === "object" &&
        moment !== null &&
        typeof moment.id === "string" &&
        Number.isFinite(moment.at),
    ),
  };
}

function useFoundation(client: "dashboard" | "overlay") {
  const [snapshot, setSnapshot] = useState<FoundationSnapshot | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");

  useEffect(() => {
    const controller = new AbortController();
    let receivedStreamSnapshot = false;
    let lastSequence = -1;
    const events = new EventSource(`/events?client=${client}`);

    const receiveSnapshot = (event: MessageEvent<string>) => {
      try {
        const next = readSnapshot(JSON.parse(event.data));
        if (!next) {
          setStatus("reconnecting");
          return;
        }
        if (event.type === "delta" && next.seq <= lastSequence) return;
        lastSequence = next.seq;
        receivedStreamSnapshot = true;
        setSnapshot(next);
        setStatus("connected");
      } catch {
        setStatus("reconnecting");
      }
    };

    events.addEventListener("snapshot", receiveSnapshot);
    events.addEventListener("delta", receiveSnapshot);
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
      events.removeEventListener("delta", receiveSnapshot);
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

function ConnectionPanel({ auth }: { auth: FoundationSnapshot["auth"] | undefined }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const result = new URLSearchParams(window.location.search).get("auth");
  async function disconnect(role: "broadcaster" | "bot") {
    setBusy(role);
    setError(false);
    try {
      const response = await fetch("/api/auth/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CTA": "1" },
        body: JSON.stringify({ role }),
      });
      if (!response.ok) throw new Error("Disconnect failed");
      window.history.replaceState(null, "", window.location.pathname);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="overlay-setup" aria-labelledby="twitch-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR CHANNEL</p>
          <h2 id="twitch-title">Connect Twitch.</h2>
        </div>
      </div>
      <p className="copy-feedback" role="status">
        {error
          ? "Could not disconnect. Try again."
          : result === "failed"
            ? "Twitch connection failed. Start a new login attempt."
            : result === "connected"
              ? "Twitch account connected."
              : "Authorize your channel to receive live Twitch events."}
      </p>
      {!auth?.configured ? (
        <p className="copy-feedback">
          Add your Twitch app credentials to the local .env file, then restart the app.
        </p>
      ) : (
        (["broadcaster", "bot"] as const).map((role) => (
          <div className="auth-account" key={role}>
            <div>
              <h3>{role === "broadcaster" ? "Broadcaster" : "Bot · optional"}</h3>
              <p>{auth[role].connected ? `Connected as @${auth[role].login}` : "Not connected"}</p>
            </div>
            {auth[role].connected ? (
              <button
                className="button button-secondary"
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  void disconnect(role);
                }}
              >
                {busy === role ? "Disconnecting…" : `Disconnect ${role}`}
              </button>
            ) : (
              <a className="button button-primary" href={`/auth/login?role=${role}`}>
                {auth[role].reconnect
                  ? "Reconnect"
                  : role === "broadcaster"
                    ? "Connect Twitch"
                    : "Connect bot"}
              </a>
            )}
          </div>
        ))
      )}
      <p className="copy-feedback">
        Incoming Twitch events stay on this machine. The simulator is ready; market rules are next.
      </p>
    </section>
  );
}

function measureOverlayScale() {
  return Math.min(1, window.innerWidth / 1920, window.innerHeight / 1080);
}

function Dashboard() {
  const { snapshot, status } = useFoundation("dashboard");
  const [checkStatus, setCheckStatus] = useState<"idle" | "checking" | "success" | "failed">(
    "idle",
  );
  const fallbackOverlayUrl = new URL("/overlay", window.location.origin);
  fallbackOverlayUrl.hostname = "127.0.0.1";
  const overlayUrl = snapshot?.overlayUrl ?? fallbackOverlayUrl.href;
  const connectionLabel = {
    connecting: "Connecting to local server",
    connected: "Receiving local updates",
    reconnecting: "Reconnecting to local server",
  }[status];

  async function checkLocalConnection() {
    setCheckStatus("checking");
    try {
      const response = await fetch("/api/setup/check", {
        method: "POST",
        headers: { "X-CTA": "1" },
      });
      if (!response.ok) throw new Error("Local check failed");
      setCheckStatus("success");
    } catch {
      setCheckStatus("failed");
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
          <span className="mode-tag">
            {snapshot?.mode === "live" ? "Twitch connected" : "Demo mode"}
          </span>
          {snapshot?.simulatorRunning && <span className="sim-badge">SIM</span>}
        </div>
      </header>

      <main id="main">
        {snapshot?.mode === "demo" && (
          <aside className="demo-banner">
            <strong>Demo mode: simulated chat only</strong>
            <a href="/setup-guide" target="_blank" rel="noreferrer">
              Twitch setup guide ↗
            </a>
          </aside>
        )}
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
              Twitch sign-in, incoming events, the simulator, and the transparent overlay are ready.
              Market rules and trading come next.
            </p>
            <div className="connection-status" role="status">
              <span>{connectionLabel}</span>
              <span className="connection-glyph" aria-hidden="true">
                {status === "connected" ? "✓" : "↻"}
              </span>
            </div>
            <div className="local-check">
              <button
                className="button button-secondary"
                type="button"
                onClick={checkLocalConnection}
                disabled={checkStatus === "checking"}
              >
                {checkStatus === "checking" ? "Checking…" : "Test local connection"}
              </button>
              <p role="status">
                {checkStatus === "failed"
                  ? "Could not complete the check. Try again."
                  : checkStatus === "success"
                    ? "Local connection checked."
                    : "Check that your local setup can save and send updates."}
              </p>
              {snapshot && (
                <span className="saved-check-count">
                  Successful checks: {snapshot.connectionChecks}
                </span>
              )}
            </div>
          </aside>
        </section>

        <SetupChecklist snapshot={snapshot} current={status === "connected"} />
        <OverlayUrlPanel
          url={overlayUrl}
          clients={snapshot?.overlayClients ?? 0}
          current={status === "connected"}
        />
        <SimulatorPanel simulator={snapshot?.simulator} demo={snapshot?.mode !== "live"} />
        <ConnectionPanel auth={snapshot?.auth} />
        <EventSubPanel connection={snapshot?.eventsub} />
        <EmoteCatalogPanel catalog={snapshot?.catalog} />
        <ChatOutPanel
          output={snapshot?.chatOut}
          connected={snapshot?.auth.broadcaster.connected ?? false}
        />
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
              <span className="planned-label">Ready</span>
            </li>
            <li>
              <span className="step-index" aria-hidden="true">
                02
              </span>
              <div>
                <h3>Give it a dry run</h3>
                <p>Simulated chat and channel events, with no Twitch account required.</p>
              </div>
              <span className="planned-label">Ready</span>
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
  const { snapshot } = useFoundation("overlay");
  const [scale, setScale] = useState(measureOverlayScale);

  useEffect(() => {
    const resize = () => setScale(measureOverlayScale());
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <main className="overlay-viewport" aria-label="Emote Exchange OBS overlay">
      <div className="overlay-canvas" style={{ transform: `scale(${scale})` }}>
        {snapshot?.simulatorRunning && (
          <aside className="overlay-sim-badge" aria-label="Simulation running">
            SIM
          </aside>
        )}
        <section className="foundation-label" aria-label="Emote Exchange, market coming next">
          <span className="overlay-brand-mark" aria-hidden="true">
            EX
          </span>
          <div>
            <h1>Emote Exchange</h1>
            <p>
              <span>{snapshot?.mode === "live" ? "Twitch connected" : "Demo mode"}</span>
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
