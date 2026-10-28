import type { SimConfig, SimulatorPublicState } from "@emote-exchange/twitch-kit";
import { useState } from "react";

function readConfig(value: unknown): SimConfig | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const mix = row.mix as Record<string, unknown> | undefined;
  if (
    !Number.isSafeInteger(row.seed) ||
    (row.seed as number) < 0 ||
    (row.seed as number) > 0xffff_ffff ||
    typeof row.scenario !== "string" ||
    !/^[a-z][a-z0-9-]{0,32}$/.test(row.scenario) ||
    typeof row.rate !== "number" ||
    !Number.isFinite(row.rate) ||
    row.rate < 0.2 ||
    row.rate > 50 ||
    !Number.isInteger(row.chatters) ||
    (row.chatters as number) < 1 ||
    (row.chatters as number) > 500 ||
    !mix ||
    typeof mix !== "object"
  )
    return null;
  const weights = [mix.plain, mix.emote, mix.follow, mix.raid];
  if (
    weights.some(
      (value) => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 100,
    ) ||
    (weights as number[]).reduce((sum, value) => sum + value, 0) <= 0
  )
    return null;
  return {
    seed: row.seed as number,
    rate: row.rate,
    chatters: row.chatters as number,
    scenario: row.scenario,
    mix: {
      plain: mix.plain as number,
      emote: mix.emote as number,
      follow: mix.follow as number,
      raid: mix.raid as number,
    },
  };
}
export function readSimulator(value: unknown): SimulatorPublicState | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const config = readConfig(row.config);
  const integer = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
  if (
    typeof row.running !== "boolean" ||
    !config ||
    !integer(row.elapsedMs) ||
    !integer(row.eventCount) ||
    !integer(row.chatMessageCount) ||
    !Array.isArray(row.scenarios) ||
    row.scenarios.length < 1 ||
    row.scenarios.length > 20
  )
    return null;
  let lastEvent: SimulatorPublicState["lastEvent"] = null;
  if (row.lastEvent !== null) {
    const event = row.lastEvent as Record<string, unknown> | undefined;
    if (
      !event ||
      ![
        "ChatMessage",
        "Follow",
        "Raid",
        "StreamOnline",
        "StreamOffline",
        "MessageDeleted",
        "UserCleared",
        "ChatCleared",
        "ConnectionChanged",
      ].includes(event.type as string) ||
      !integer(event.at)
    )
      return null;
    lastEvent = {
      type: event.type as NonNullable<SimulatorPublicState["lastEvent"]>["type"],
      at: event.at as number,
    };
  }
  const scenarios: SimulatorPublicState["scenarios"] = [];
  for (const entry of row.scenarios) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof entry.id !== "string" ||
      typeof entry.label !== "string" ||
      entry.label.length > 80 ||
      typeof entry.description !== "string" ||
      entry.description.length > 240 ||
      (entry.durationMs !== null && (!integer(entry.durationMs) || entry.durationMs <= 0))
    )
      return null;
    const settings = readConfig({ ...entry.defaults, seed: 42, scenario: entry.id });
    if (!settings || scenarios.some((scenario) => scenario.id === entry.id)) return null;
    const { rate, chatters, mix } = settings;
    scenarios.push({
      id: entry.id,
      label: entry.label,
      description: entry.description,
      defaults: { rate, chatters, mix },
      durationMs: entry.durationMs,
    });
  }
  if (!scenarios.some((scenario) => scenario.id === config.scenario)) return null;
  return {
    running: row.running,
    config,
    elapsedMs: row.elapsedMs as number,
    eventCount: row.eventCount as number,
    chatMessageCount: row.chatMessageCount as number,
    lastEvent,
    scenarios,
  };
}

export function SimulatorPanel({
  simulator,
  demo,
}: {
  simulator?: SimulatorPublicState;
  demo: boolean;
}) {
  const [draft, setDraft] = useState<SimConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [viewers, setViewers] = useState(40);
  const opening = simulator?.scenarios.find((scenario) => scenario.id === "opening-day");
  const fallback: SimConfig = {
    seed: 42,
    scenario: "opening-day",
    ...(opening?.defaults ?? {
      rate: 4,
      chatters: 12,
      mix: { plain: 65, emote: 30, follow: 4, raid: 1 },
    }),
  };
  const config = simulator?.running ? simulator.config : (draft ?? fallback);
  const selected = simulator?.scenarios.find((scenario) => scenario.id === config.scenario);
  const disabled = busy || !simulator;
  const editingDisabled = disabled || simulator.running;
  async function action(path: "start" | "stop" | "event", body?: unknown) {
    setBusy(true);
    try {
      const response = await fetch(`/api/sim/${path}`, {
        method: "POST",
        headers: { "X-CTA": "1", "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error();
      setFeedback(
        path === "start"
          ? "Simulation started. All generated output stays local."
          : path === "stop"
            ? "Simulation stopped."
            : "Simulated event added. Check Would have said for its preview.",
      );
    } catch {
      setFeedback(
        "Could not complete the simulation action. Check the settings and local connection.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="overlay-setup" aria-labelledby="simulator-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">A REHEARSAL FOR CHAT</p>
          <h2 id="simulator-title">Give it a dry run.</h2>
        </div>
        <span className={simulator?.running ? "sim-badge" : "local-label"} role="status">
          {simulator?.running ? "SIM · Running" : "Simulator stopped"}
        </span>
      </div>
      <p>
        Generate chat and channel events with the original demo emotes. Market prices and trade
        results arrive in the next build.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void action("start", config);
        }}
      >
        <div className="sim-fields">
          <label className="sim-field">
            Scenario
            <select
              value={config.scenario}
              disabled={editingDisabled}
              onChange={(event) => {
                const scenario = simulator?.scenarios.find(
                  (value) => value.id === event.currentTarget.value,
                );
                if (scenario)
                  setDraft({ seed: config.seed, scenario: scenario.id, ...scenario.defaults });
              }}
            >
              {simulator?.scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
          </label>
          <label className="sim-field">
            Messages per second
            <input
              type="number"
              min="0.2"
              max="50"
              step="any"
              required
              value={config.rate}
              disabled={editingDisabled}
              onChange={(event) => setDraft({ ...config, rate: event.currentTarget.valueAsNumber })}
            />
          </label>
          <label className="sim-field">
            Chatters
            <input
              type="number"
              min="1"
              max="500"
              step="1"
              required
              value={config.chatters}
              disabled={editingDisabled}
              onChange={(event) =>
                setDraft({ ...config, chatters: event.currentTarget.valueAsNumber })
              }
            />
          </label>
          <label className="sim-field">
            Seed
            <input
              type="number"
              min="0"
              max="4294967295"
              step="1"
              required
              value={config.seed}
              disabled={editingDisabled}
              onChange={(event) => setDraft({ ...config, seed: event.currentTarget.valueAsNumber })}
            />
          </label>
        </div>
        <p className="copy-feedback">{selected?.description}</p>
        <fieldset className="sim-personas" disabled={editingDisabled}>
          <legend>Persona weights</legend>
          {(["plain", "emote", "follow", "raid"] as const).map((persona) => (
            <label className="sim-field" key={persona}>
              {
                {
                  plain: "Plain chat",
                  emote: "Emote spam",
                  follow: "Follow generator",
                  raid: "Raid generator",
                }[persona]
              }
              <input
                type="number"
                min="0"
                max="100"
                step="any"
                required
                value={config.mix[persona]}
                onChange={(event) =>
                  setDraft({
                    ...config,
                    mix: { ...config.mix, [persona]: event.currentTarget.valueAsNumber },
                  })
                }
              />
            </label>
          ))}
        </fieldset>
        <p className="copy-feedback">
          Weights are relative and must total more than zero. Follow and raid personas add channel
          events alongside chat messages. Stop the simulation to change settings.
        </p>
        <div className="chat-controls">
          <button
            className="button button-primary sim-start"
            type="submit"
            disabled={editingDisabled}
          >
            {demo ? "Start demo" : "Start simulator"}
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={disabled || !simulator.running}
            onClick={() => {
              void action("stop");
            }}
          >
            Stop simulator
          </button>
        </div>
      </form>
      <dl className="eventsub-stats">
        <div>
          <dt>Simulated events</dt>
          <dd data-testid="sim-event-count">{simulator?.eventCount ?? 0}</dd>
        </div>
        <div>
          <dt>Chat messages</dt>
          <dd>{simulator?.chatMessageCount ?? 0}</dd>
        </div>
        <div>
          <dt>Elapsed</dt>
          <dd>{Math.floor((simulator?.elapsedMs ?? 0) / 1000)}s</dd>
        </div>
      </dl>
      <div className="sim-injections">
        <label className="sim-field">
          Raid viewers
          <input
            type="number"
            min="1"
            max="10000"
            step="1"
            value={viewers}
            onChange={(event) => setViewers(event.currentTarget.valueAsNumber)}
            disabled={disabled || !simulator.running}
          />
        </label>
        <div className="chat-controls">
          {(
            [
              ["follow", "Fake follow"],
              ["raid", "Fake raid"],
              ["online", "Open bell"],
              ["offline", "Close bell"],
            ] as const
          ).map(([type, label]) => (
            <button
              className="button button-secondary"
              type="button"
              key={type}
              disabled={
                disabled ||
                !simulator.running ||
                (type === "raid" && (!Number.isInteger(viewers) || viewers < 1 || viewers > 10000))
              }
              onClick={() => {
                void action("event", { type, ...(type === "raid" ? { viewers } : {}) });
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="copy-feedback" role="status">
        {feedback}
      </p>
    </section>
  );
}
