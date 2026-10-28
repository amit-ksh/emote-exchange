import type { ChatEvent, Emote } from "../eventsub/normalize.ts";
import { record } from "../eventsub/protocol.ts";
import type { SimAction, SimConfig, SimScenario } from "./engine.ts";
import { freePlay, initialSimulatorState, stepSimulator, validateSimConfig } from "./engine.ts";

export interface SimulatorPublicState {
  running: boolean;
  config: SimConfig;
  elapsedMs: number;
  eventCount: number;
  chatMessageCount: number;
  lastEvent: { type: ChatEvent["type"]; at: number } | null;
  scenarios: {
    id: string;
    label: string;
    description: string;
    defaults: SimScenario["defaults"];
    durationMs: number | null;
  }[];
}
interface Options {
  emotes: readonly Emote[];
  scenarios?: readonly SimScenario[];
  now?: () => number;
  autoTick?: boolean;
  initialRun?: number;
  onRun?: (run: number) => void;
  onEvent?: (event: ChatEvent) => void;
  onChange?: () => void;
}
export function createSimulator(options: Options) {
  const now = options.now ?? Date.now;
  const scenarios = new Map(
    [freePlay, ...(options.scenarios ?? [])].map((scenario) => [scenario.id, scenario]),
  );
  if (
    scenarios.size !== 1 + (options.scenarios?.length ?? 0) ||
    scenarios.size > 20 ||
    !Number.isSafeInteger(options.initialRun ?? 0) ||
    (options.initialRun ?? 0) < 0
  )
    throw new Error("Invalid simulator setup.");
  let state = initialSimulatorState(options.initialRun);
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  const scenario = () => scenarios.get(state.config.scenario) ?? freePlay;
  const stopTimer = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };
  function apply(input: Parameters<typeof stepSimulator>[1], selected = scenario()) {
    if (closed) return;
    const next = stepSimulator(state, input, now(), selected);
    if (input.type === "start") options.onRun?.(next.state.run);
    const changed =
      next.state.running !== state.running ||
      next.state.elapsedMs !== state.elapsedMs ||
      next.events.length > 0;
    state = next.state;
    for (const event of next.events) options.onEvent?.(event);
    if (!state.running) stopTimer();
    if (changed) options.onChange?.();
  }
  function readConfig(value: unknown): SimConfig {
    const source = record(value);
    const mix = record(source.mix);
    const config = {
      seed: source.seed,
      rate: source.rate,
      chatters: source.chatters,
      scenario: source.scenario,
      mix: { plain: mix.plain, emote: mix.emote, follow: mix.follow, raid: mix.raid },
    } as SimConfig;
    const selected = scenarios.get(config.scenario);
    if (!selected) throw new Error("Choose a valid simulator scenario.");
    validateSimConfig(config, selected);
    return config;
  }
  return {
    readConfig,
    publicState(): SimulatorPublicState {
      return structuredClone({
        running: state.running,
        config: state.config,
        elapsedMs: state.elapsedMs,
        eventCount: state.eventCount,
        chatMessageCount: state.chatMessageCount,
        lastEvent: state.lastEvent,
        scenarios: [...scenarios.values()].map(
          ({ id, label, description, defaults, durationMs }) => ({
            id,
            label,
            description,
            defaults,
            durationMs: durationMs ?? null,
          }),
        ),
      });
    },
    start(value: unknown) {
      if (closed) throw new Error("Simulator is closed.");
      const config = readConfig(value);
      if (state.run >= Number.MAX_SAFE_INTEGER) throw new Error("Simulator run limit reached.");
      stopTimer();
      apply({ type: "start", config, emotes: options.emotes }, scenarios.get(config.scenario));
      if (options.autoTick !== false) {
        timer = setInterval(() => apply({ type: "tick" }), 100);
        timer.unref();
      }
    },
    stop() {
      apply({ type: "stop" });
      stopTimer();
    },
    tick() {
      apply({ type: "tick" });
    },
    inject(action: SimAction) {
      if (closed || !state.running) return false;
      if (
        "chatter" in action &&
        (!Number.isInteger(action.chatter) ||
          action.chatter < 0 ||
          action.chatter >= state.config.chatters)
      )
        throw new Error("Choose a valid simulated chatter.");
      if (
        action.type === "raid" &&
        (!Number.isSafeInteger(action.viewers) || action.viewers < 1 || action.viewers > 10_000)
      )
        throw new Error("Raid viewers must be between 1 and 10000.");
      apply({ type: "inject", action });
      return true;
    },
    close() {
      if (closed) return;
      stopTimer();
      closed = true;
    },
  };
}
