import { useEffect, useState } from "react";
import type { OverlayMarket } from "./overlay-model.ts";

export async function marketPost(path: string, body: unknown) {
  const response = await fetch(`/api/market/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CTA": "1" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      "The action could not be saved. Check your connection and values, then try again.",
    );
  return response.json();
}
const coins = (value: number) => value.toLocaleString();
export function MarketPanel({ market, current }: { market?: OverlayMarket; current: boolean }) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [delist, setDelist] = useState<string | null>(null);
  async function action(body: unknown) {
    setBusy(true);
    try {
      await marketPost("action", body);
      setFeedback("Market updated.");
      setDelist(null);
    } catch (error) {
      setFeedback(String((error as Error).message));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="market-panel">
      <div className="section-heading">
        <h2>{market?.listings.length ?? 0} active Listings</h2>
        <button
          type="button"
          className="button button-primary"
          disabled={!current || busy}
          onClick={() => void action({ type: "Pause", value: !market?.paused })}
        >
          {market?.paused ? "Resume trading" : "Pause trading"}
        </button>
      </div>
      <p className="copy-feedback" role="status">
        {feedback ||
          (market?.paused
            ? "Trading paused. Prices continue to move."
            : "Prices follow chat's emote attention.")}
      </p>
      <div className="table-scroll">
        <table className="market-table">
          <caption className="sr-only">Market Listings</caption>
          <thead>
            <tr>
              <th scope="col">Listing</th>
              <th scope="col">Heat</th>
              <th scope="col">Price</th>
              <th scope="col">Session</th>
              <th scope="col">Holders</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {market?.listings.map((row) => (
              <tr key={row.ticker}>
                <th scope="row">
                  <span className="listing-name">
                    <img src={row.imageUrl} alt="" width="32" height="32" />
                    {row.ticker}
                  </span>
                </th>
                <td>{row.heat.toFixed(1)}</td>
                <td>{row.price.toFixed(2)}</td>
                <td>
                  {row.sessionChangePercent >= 0 ? "↑" : "↓"}{" "}
                  {Math.abs(row.sessionChangePercent).toFixed(1)}%
                </td>
                <td>{row.holders}</td>
                <td>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={!current || busy}
                    onClick={() => setDelist(row.ticker)}
                  >
                    Delist {row.ticker}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!market?.listings.length && (
        <p className="empty-state">
          Two chatters list an emote. Open Demo and press Start demo to try it.
        </p>
      )}
      {delist && (
        <div className="inline-notice">
          <p>Delist {delist}? Holdings will be settled at its current Price without a fee.</p>
          <div className="action-row">
            <button
              type="button"
              className="button button-primary"
              disabled={busy || !current}
              onClick={() => void action({ type: "Delist", ticker: delist })}
            >
              Confirm Delist
            </button>
            <button
              type="button"
              className="button button-secondary"
              onClick={() => setDelist(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
export function TradersPanel({ market, current }: { market?: OverlayMarket; current: boolean }) {
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  async function freeze(userId: string, value: boolean) {
    setBusy(true);
    try {
      await marketPost("action", { type: "Freeze", userId, value });
      setFeedback(value ? "Trader frozen." : "Trader unfrozen.");
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows =
    market?.traders.filter((row) =>
      `${row.name} ${row.login}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <section className="market-panel">
      <div className="section-heading">
        <h2>Traders</h2>
        <span className="tag neutral">{market?.traderCount ?? 0} total</span>
      </div>
      <label className="trader-search">
        Search Traders
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Name or login"
        />
      </label>
      <p className="copy-feedback" role="status">
        {feedback}
      </p>
      <div className="table-scroll">
        <table className="market-table">
          <caption className="sr-only">Traders by Net Worth</caption>
          <thead>
            <tr>
              <th scope="col">Trader</th>
              <th scope="col">Coins</th>
              <th scope="col">Net Worth</th>
              <th scope="col">Status</th>
              <th scope="col">Streak</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId}>
                <th scope="row">
                  {row.name} {row.isSim && <small className="tag neutral">SIM</small>}
                </th>
                <td>{coins(row.coins)}</td>
                <td>
                  {row.capped ? "≥" : ""}
                  {coins(row.netWorth)}
                </td>
                <td>{row.frozen ? "Frozen" : "Active"}</td>
                <td>{row.streak === null ? "—" : row.streak}</td>
                <td>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={!current || busy}
                    onClick={() => void freeze(row.userId, !row.frozen)}
                  >
                    {row.frozen ? "Unfreeze" : "Freeze"} {row.name}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && (
        <p className="empty-state">
          {search ? "No Traders match your search." : "Traders appear when chat joins the market."}
        </p>
      )}
    </section>
  );
}
const fields = [
  ["STARTING_COINS", "Starting Coins", 0, 1_000_000_000, 1],
  ["FEE", "Trade fee (0.01 = 1%)", 0, 0.1, 0.0001],
  ["TRADE_COOLDOWN_MS", "Trade cooldown (milliseconds)", 0, 60_000, 1],
  ["HEAT_HALF_LIFE", "Heat half-life (seconds)", 1, 3600, 0.1],
] as const;
function readSettings(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const result: Record<string, number> = {};
  for (const [key, , min, max, step] of fields) {
    const number = row[key];
    if (
      typeof number !== "number" ||
      !Number.isFinite(number) ||
      number < min ||
      number > max ||
      (step === 1 && !Number.isSafeInteger(number))
    )
      return null;
    result[key] = number;
  }
  return result;
}
export function MarketSettingsPanel({ current }: { current: boolean }) {
  const [values, setValues] = useState<Record<string, number> | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/market/settings", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const next = readSettings(await response.json());
        if (!next) throw new Error();
        setValues(next);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setFeedback("Settings unavailable. Reopen Settings to retry.");
      });
    return () => controller.abort();
  }, []);
  async function save(reset = false) {
    setBusy(true);
    try {
      const next = readSettings(await marketPost("settings", reset ? { reset: true } : values));
      if (!next) throw new Error("Settings unavailable.");
      setValues(next);
      setFeedback(
        reset ? "Default settings restored." : "Settings saved. Future actions use these values.",
      );
    } catch (error) {
      setFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="market-panel">
        <h2>Market settings</h2>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="market-settings-grid">
            {fields.map(([key, label, min, max, step]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  required
                  min={min}
                  max={max}
                  step={step}
                  disabled={!values || busy}
                  value={values?.[key] ?? ""}
                  onChange={(event) =>
                    setValues((old) => old && { ...old, [key]: event.target.valueAsNumber })
                  }
                />
                <small>
                  {min.toLocaleString()}–{max.toLocaleString()}
                </small>
              </label>
            ))}
          </div>
          <div className="action-row">
            <button
              className="button button-primary"
              disabled={!current || !values || busy}
              type="submit"
            >
              Save settings
            </button>
            <button
              className="button button-secondary"
              disabled={!current || busy}
              type="button"
              onClick={() => void save(true)}
            >
              Reset to defaults
            </button>
          </div>
        </form>
        <p className="copy-feedback" role="status">
          {feedback}
        </p>
      </section>
      <section className="market-panel">
        <h2>New Season</h2>
        <p>Clears all Traders, Holdings, Listings and market history. This cannot be undone.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            void marketPost("action", { type: "Reset", confirmation })
              .then(() => {
                setConfirmation("");
                setFeedback("New Season started.");
              })
              .catch((error: Error) => setFeedback(error.message))
              .finally(() => setBusy(false));
          }}
        >
          <label>
            Type RESET to confirm
            <input
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <button
            className="button button-secondary"
            type="submit"
            disabled={!current || busy || confirmation !== "RESET"}
          >
            Reset Season
          </button>
        </form>
      </section>
    </>
  );
}
