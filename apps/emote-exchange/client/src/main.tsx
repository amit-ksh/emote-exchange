import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { FoundationSnapshot } from "../../src/public-state.ts";
import { ChatOutPanel, readChatOut } from "./chat-out.tsx";
import { EmoteCatalogPanel, readCatalog } from "./emotes.tsx";
import { EventSubPanel, readEventSub } from "./eventsub.tsx";
import { LivePage } from "./live.tsx";
import { MarketPanel, MarketSettingsPanel, TradersPanel } from "./market.tsx";
import { ExchangeOverlay } from "./overlay.tsx";
import { readOverlayMarket } from "./overlay-model.ts";
import { defaultOverlayUrl, isOverlayUrl } from "./overlay-url.ts";
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
  if (!isOverlayUrl(candidate.overlayUrl, window.location.origin)) return null;
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
    market: readOverlayMarket(candidate.market) ?? undefined,
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
    events.onerror = () => {
      setStatus("reconnecting");
      // A revoked or expired hosted session returns to the server's sign-in screen.
      void fetch("/api/snapshot", { signal: controller.signal })
        .then((response) => {
          if (response.status === 401) window.location.reload();
        })
        .catch(() => {});
    };

    void fetch("/api/snapshot", { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) window.location.reload();
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
          <h2 id="twitch-title">Connect Twitch</h2>
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
              <details>
                <summary>Granted scopes</summary>
                <p>{auth[role].scopes.join(", ") || "No permissions granted yet."}</p>
              </details>
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
      <p className="copy-feedback">Incoming Twitch events stay on this machine.</p>
    </section>
  );
}

const views = [
  "Overview",
  "Live",
  "Market",
  "Traders",
  "Settings",
  "Setup",
  "Demo",
  "Emotes",
  "Chat",
  "Diagnostics",
] as const;
type View = (typeof views)[number];
function Dashboard() {
  const { snapshot, status } = useFoundation("dashboard");
  const [view, setView] = useState<View>("Overview");
  useEffect(() => {
    const navigate = () => {
      const hash = window.location.hash;
      if (hash === "#twitch-title") setView("Setup");
      if (hash === "#eventsub-title") setView("Diagnostics");
      if (hash === "#overlay-title") setView("Overview");
      if (hash === "#demo") setView("Demo");
    };
    navigate();
    window.addEventListener("hashchange", navigate);
    return () => window.removeEventListener("hashchange", navigate);
  }, []);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem("exchange-theme") ?? "system";
    } catch {
      return "system";
    }
  });
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("exchange-theme", theme);
    } catch {
      /* Storage is optional. */
    }
  }, [theme]);
  const current = status === "connected";
  const connected = current && !!snapshot?.auth.broadcaster.connected;
  const overlay = current && (snapshot?.overlayClients ?? 0) > 0;
  const online =
    connected &&
    snapshot?.eventsub.status === "connected" &&
    snapshot.eventsub.streamStatus === "online";
  const complete = Number(connected) + Number(overlay) + Number(online);
  const url = new URL(defaultOverlayUrl(window.location.origin));
  const subtitles: Record<View, string> = {
    Overview: "Your channel, ready for the Exchange.",
    Live: "Watch engagement become a market.",
    Market: "Follow the attention. Manage your Listings.",
    Traders: "The people building your Exchange.",
    Settings: "Tune the market. Changes apply immediately.",
    Setup: "Connect your channel. Keep control on your machine.",
    Demo: "Try the Exchange with simulated chat.",
    Emotes: "The names behind your market.",
    Chat: "Manage what the Exchange sends to your channel.",
    Diagnostics: "A closer look at your Twitch connection.",
  };
  const [checkStatus, setCheckStatus] = useState("");
  async function checkLocalConnection() {
    try {
      const response = await fetch("/api/setup/check", {
        method: "POST",
        headers: { "X-CTA": "1" },
      });
      if (!response.ok) throw new Error();
      setCheckStatus("Local connection checked.");
    } catch {
      setCheckStatus("Could not complete the check. Try again.");
    }
  }
  return (
    <div className="dashboard">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <Wordmark />
        <nav aria-label="Main navigation">
          {views.map((name, index) => (
            <button
              type="button"
              key={name}
              className={view === name ? "nav-pill active" : "nav-pill"}
              aria-current={view === name ? "page" : undefined}
              onClick={() => setView(name)}
            >
              <span className="nav-icon" aria-hidden="true">
                {["◫", "⌁", "↗", "◉", "⚙", "◎", "▷", "✦", "≡", "⌁"][index]}
              </span>
              <span>{name}</span>
              {name === "Setup" && <small>{complete}/3</small>}
              {name === "Emotes" && <small>{snapshot?.catalog.total ?? "—"}</small>}
              {name === "Demo" && snapshot?.simulatorRunning && (
                <small>
                  <i className="status-dot" /> Running
                </small>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mode-card">
            <span className="tag">{snapshot?.mode === "live" ? "Live" : "Demo"}</span>
            <p>
              {snapshot?.mode === "live"
                ? "Connected to your Twitch channel. Your Exchange stays on this machine."
                : "Simulated chat only. Your Twitch stream is not affected."}
            </p>
            <span className="connection-note" role="status">
              {status === "connected"
                ? "● Local connection ready"
                : status === "connecting"
                  ? "Connecting…"
                  : "Reconnecting…"}
            </span>
          </div>
          <button
            className="button button-secondary theme-toggle"
            type="button"
            onClick={() =>
              setTheme(
                (
                  theme === "system"
                    ? matchMedia("(prefers-color-scheme: dark)").matches
                    : theme === "dark"
                )
                  ? "light"
                  : "dark",
              )
            }
            aria-label="Toggle color theme"
          >
            ◐ <span>Appearance</span>
            <small>{theme}</small>
          </button>
        </div>
      </aside>
      <main id="main" className="workspace">
        <header className="page-header">
          <div>
            <h1>
              {view}
              {view === "Demo" && snapshot?.simulatorRunning && <span className="tag">SIM</span>}
            </h1>
            <p>{subtitles[view]}</p>
          </div>
          <span className="page-meta">Play Coins. No real money.</span>
        </header>
        {!current && (
          <p className="inline-notice" role="status">
            {status === "connecting"
              ? "Loading your Exchange…"
              : "Connection interrupted. Showing the last available state while we reconnect."}
          </p>
        )}
        {view === "Overview" && (
          <>
            <div className="overview-stats">
              {[
                ["Mode", snapshot?.mode === "live" ? "Live" : "Demo", "Local workspace"],
                [
                  "Twitch",
                  connected ? "Connected" : "Not connected",
                  connected ? "Ready" : "Needs setup",
                ],
                [
                  "Overlay",
                  snapshot ? String(snapshot.overlayClients) : "—",
                  overlay ? "Receiving updates" : "Waiting",
                ],
                [
                  "Stream",
                  online
                    ? "Live"
                    : snapshot?.eventsub.streamStatus === "offline"
                      ? "Offline"
                      : "Unknown",
                  online ? "On air" : "Waiting for Twitch",
                ],
              ].map(([label, value, note]) => (
                <section className="stat-card" key={label}>
                  <span>{label}</span>
                  <strong className={label === "Overlay" ? "display-number" : "stat-value"}>
                    {value}
                  </strong>
                  <span
                    className={
                      note === "Ready" || note === "Receiving updates" || note === "On air"
                        ? "tag"
                        : "tag neutral"
                    }
                  >
                    {note}
                  </span>
                </section>
              ))}
            </div>
            <div className="overview-grid">
              <SetupChecklist snapshot={snapshot} current={current} />
              <OverlayUrlPanel
                url={snapshot?.overlayUrl ?? url.href}
                clients={snapshot?.overlayClients ?? 0}
                current={current}
              />
            </div>
            <SimulatorPanel
              simulator={snapshot?.simulator}
              demo={snapshot?.mode !== "live"}
              compact
            />
            <button
              className="text-button demo-options"
              type="button"
              onClick={() => setView("Demo")}
            >
              Demo options <span aria-hidden="true">↗</span>
            </button>
          </>
        )}
        {view === "Setup" && <ConnectionPanel auth={snapshot?.auth} />}
        {view === "Live" && <LivePage />}
        {view === "Market" && <MarketPanel market={snapshot?.market} current={current} />}
        {view === "Traders" && <TradersPanel market={snapshot?.market} current={current} />}
        {view === "Settings" && <MarketSettingsPanel current={current} />}
        {view === "Demo" && (
          <SimulatorPanel simulator={snapshot?.simulator} demo={snapshot?.mode !== "live"} />
        )}
        {view === "Emotes" && <EmoteCatalogPanel catalog={snapshot?.catalog} />}
        {view === "Chat" && <ChatOutPanel output={snapshot?.chatOut} connected={connected} />}
        {view === "Diagnostics" && (
          <>
            <EventSubPanel connection={snapshot?.eventsub} />
            <details className="diagnostic-check">
              <summary>Local connection</summary>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void checkLocalConnection()}
              >
                Test local connection
              </button>
              <p role="status">{checkStatus}</p>
            </details>
          </>
        )}
      </main>
    </div>
  );
}

const isOverlay = window.location.pathname.replace(/\/$/, "") === "/overlay";
document.documentElement.dataset.view = isOverlay ? "overlay" : "dashboard";
const root = document.getElementById("root");
if (!root) throw new Error("App root is missing");
createRoot(root).render(<StrictMode>{isOverlay ? <ExchangeOverlay /> : <Dashboard />}</StrictMode>);
