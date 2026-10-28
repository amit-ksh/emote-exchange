import type { AuthRole } from "../auth.ts";
import type { HelixClient } from "../helix.ts";
import { createHelix } from "../helix.ts";
import type { ChatEvent, NormalizerOptions } from "./normalize.ts";
import { normalizeEvent } from "./normalize.ts";
import type { ProtocolEffect, ProtocolInput } from "./protocol.ts";
import { initialProtocolState, record, stepProtocol } from "./protocol.ts";

const types = [
  "channel.chat.message",
  "channel.follow",
  "channel.raid",
  "stream.online",
  "stream.offline",
] as const;
export type SubscriptionType = (typeof types)[number];
export interface SubscriptionState {
  type: SubscriptionType;
  status: "disconnected" | "pending" | "enabled" | "failed" | "revoked";
  httpStatus: number | null;
}
export interface EventSubPublicState {
  status: "disconnected" | "connecting" | "connected" | "lost";
  sessionStartedAt: number | null;
  lastEventAt: number | null;
  eventCount: number;
  chatMessageCount: number;
  issue: "protocol-error" | null;
  streamStatus: "unknown" | "online" | "offline";
  subscriptions: SubscriptionState[];
}
export function eventSubEndpoints(
  wsUrl = "wss://eventsub.wss.twitch.tv/ws",
  subscriptionsUrl = "https://api.twitch.tv/helix/eventsub/subscriptions",
) {
  for (const [name, value, official, localProtocol] of [
    ["EVENTSUB_WS_URL", wsUrl, "wss://eventsub.wss.twitch.tv/ws", "ws:"],
    [
      "EVENTSUB_SUBSCRIPTIONS_URL",
      subscriptionsUrl,
      "https://api.twitch.tv/helix/eventsub/subscriptions",
      "http:",
    ],
  ]) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`${name} must be a Twitch or loopback mock URL.`);
    }
    const source = new URL(official);
    const production = url.origin === source.origin && url.pathname === source.pathname;
    const local =
      url.protocol === localProtocol && ["127.0.0.1", "localhost"].includes(url.hostname);
    if ((!production && !local) || url.username || url.password || url.hash)
      throw new Error(`${name} must be a Twitch or loopback mock URL.`);
  }
  const initial = new URL(wsUrl);
  initial.searchParams.set("keepalive_timeout_seconds", "30");
  return { wsUrl: initial.href, subscriptionsUrl };
}
interface RunnerOptions {
  clientId: string;
  auth: {
    identity: (role: AuthRole) => string | undefined;
    accessToken: (role: AuthRole) => string | undefined;
    refresh: (role: AuthRole) => Promise<void>;
    invalidate: (role: AuthRole) => void;
  };
  wsUrl?: string;
  subscriptionsUrl?: string;
  now?: () => number;
  fetcher?: typeof fetch;
  helix?: HelixClient;
  createSocket?: (url: string) => Pick<WebSocket, "addEventListener" | "close">;
  autoTick?: boolean;
  onChange?: () => void;
  onEvent?: (event: ChatEvent) => void;
  lookupEmote?: NormalizerOptions["lookupEmote"];
  wasSent?: NormalizerOptions["wasSent"];
  logError?: (message: string) => void;
}
export function createEventSub(options: RunnerOptions) {
  const endpoints = eventSubEndpoints(options.wsUrl, options.subscriptionsUrl);
  const now = options.now ?? Date.now;
  const helix =
    options.helix ??
    createHelix({ clientId: options.clientId, auth: options.auth, fetcher: options.fetcher, now });
  const sockets = new Map<string, Pick<WebSocket, "addEventListener" | "close">>();
  const controllers = new Set<AbortController>();
  let state = initialProtocolState();
  let broadcasterId: string | undefined;
  let generation = 0;
  let closed = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let eventCount = 0;
  let chatMessageCount = 0;
  let lastEventAt: number | null = null;
  let issue: EventSubPublicState["issue"] = null;
  let streamStatus: EventSubPublicState["streamStatus"] = "unknown";
  let subscriptions: SubscriptionState[] = types.map((type) => ({
    type,
    status: "disconnected",
    httpStatus: null,
  }));
  const publicState = (): EventSubPublicState =>
    structuredClone({
      status: state.status,
      sessionStartedAt: state.sessionStartedAt,
      lastEventAt,
      eventCount,
      chatMessageCount,
      issue,
      streamStatus,
      subscriptions,
    });
  let previousProjection = JSON.stringify(publicState());
  const publish = () => {
    const projection = JSON.stringify(publicState());
    if (projection !== previousProjection) {
      previousProjection = projection;
      options.onChange?.();
    }
  };
  function stop() {
    streamStatus = "unknown";
    generation++;
    for (const controller of controllers) controller.abort();
    controllers.clear();
    if (timer) clearInterval(timer);
    timer = undefined;
    dispatch({ type: "stop" });
    subscriptions = types.map((type) => ({ type, status: "disconnected", httpStatus: null }));
    publish();
  }
  async function subscribe(effect: Extract<ProtocolEffect, { type: "subscribe" }>) {
    const run = generation;
    const id = broadcasterId;
    if (!id) return;
    subscriptions = types.map((type) => ({ type, status: "pending", httpStatus: null }));
    publish();
    await Promise.all(
      types.map(async (type) => {
        const controller = new AbortController();
        controllers.add(controller);
        let httpStatus: number | null = null;
        let enabled = false;
        try {
          const condition =
            type === "channel.chat.message"
              ? { broadcaster_user_id: id, user_id: id }
              : type === "channel.follow"
                ? { broadcaster_user_id: id, moderator_user_id: id }
                : type === "channel.raid"
                  ? { to_broadcaster_user_id: id }
                  : { broadcaster_user_id: id };
          if (closed || run !== generation) return;
          const response = await helix.request({
            role: "broadcaster",
            path: "/eventsub/subscriptions",
            url: endpoints.subscriptionsUrl,
            method: "POST",
            signal: controller.signal,
            deadline: effect.deadline,
            beforeAttempt: async () => !closed && run === generation,
            body: {
              type,
              version: type === "channel.follow" ? "2" : "1",
              condition,
              transport: { method: "websocket", session_id: effect.session },
            },
          });
          if (closed || run !== generation) {
            await response.body?.cancel();
            return;
          }
          httpStatus = response.status;
          if (response.status === 202) {
            const body = record(await response.json());
            enabled = Array.isArray(body.data) && record(body.data[0]).status === "enabled";
          } else await response.body?.cancel();
        } catch {
          /* Only fixed status and HTTP codes can leave the transport. */
        } finally {
          controllers.delete(controller);
        }
        if (closed || run !== generation) return;
        subscriptions = subscriptions.map((entry) =>
          entry.type === type
            ? { type, status: enabled ? "enabled" : "failed", httpStatus }
            : entry,
        );
        publish();
      }),
    );
  }
  function execute(effect: ProtocolEffect) {
    if (effect.type === "open") {
      try {
        const socket = (options.createSocket ?? ((url) => new WebSocket(url)))(effect.url);
        sockets.set(effect.socket, socket);
        socket.addEventListener("message", (event) => {
          if (closed || sockets.get(effect.socket) !== socket) return;
          const data = (event as MessageEvent).data;
          if (typeof data !== "string" || Buffer.byteLength(data) > 65_536) return;
          try {
            dispatch({ type: "frame", socket: effect.socket, frame: JSON.parse(data) });
          } catch {
            /* Discard malformed frames. */
          }
        });
        socket.addEventListener("close", (event) => {
          if (closed || sockets.get(effect.socket) !== socket) return;
          sockets.delete(effect.socket);
          dispatch({ type: "closed", socket: effect.socket, code: (event as CloseEvent).code });
        });
        socket.addEventListener("error", () => {
          if (sockets.get(effect.socket) === socket)
            dispatch({ type: "closed", socket: effect.socket, code: 1006 });
        });
      } catch {
        dispatch({ type: "closed", socket: effect.socket, code: 1006 });
      }
    } else if (effect.type === "close") {
      const socket = sockets.get(effect.socket);
      sockets.delete(effect.socket);
      try {
        socket?.close();
      } catch {
        /* Already closed. */
      }
    } else if (effect.type === "subscribe") void subscribe(effect);
    else if (effect.type === "protocol-error") {
      issue = "protocol-error";
      (options.logError ?? console.error)(
        `EventSub protocol error: close ${effect.code}. Check client implementation.`,
      );
    } else if (effect.type === "revocation") {
      const subscription = record(effect.frame.payload.subscription);
      subscriptions = subscriptions.map((entry) =>
        entry.type === subscription.type ? { ...entry, status: "revoked" } : entry,
      );
      if (subscription.status === "authorization_revoked") {
        stop();
        broadcasterId = undefined;
        options.auth.invalidate("broadcaster");
      }
    } else {
      if (!broadcasterId) return;
      const event = normalizeEvent(effect.frame, {
        broadcasterId,
        botId: options.auth.identity("bot"),
        lookupEmote: options.lookupEmote,
        wasSent: options.wasSent,
      });
      if (!event) return;
      if (event.type === "StreamOnline") streamStatus = "online";
      if (event.type === "StreamOffline") streamStatus = "offline";
      eventCount++;
      if (event.type === "ChatMessage") chatMessageCount++;
      lastEventAt = event.at;
      options.onEvent?.(event);
    }
  }
  function dispatch(input: ProtocolInput) {
    const before = state.status;
    const next = stepProtocol(state, input, now());
    state = next.state;
    if (state.status === "lost" && before !== "lost") {
      streamStatus = "unknown";
      generation++;
      for (const controller of controllers) controller.abort();
      subscriptions = types.map((type) => ({ type, status: "disconnected", httpStatus: null }));
    }
    for (const effect of next.effects) execute(effect);
    publish();
  }
  return {
    publicState,
    tick: () => {
      if (!closed) dispatch({ type: "tick" });
    },
    syncAuth() {
      if (closed) return;
      const identity = options.auth.identity("broadcaster");
      if (identity === broadcasterId) return;
      stop();
      broadcasterId = identity;
      if (!identity) return;
      issue = null;
      dispatch({ type: "start", url: endpoints.wsUrl });
      if (options.autoTick !== false) {
        timer = setInterval(() => dispatch({ type: "tick" }), 250);
        timer.unref();
      }
    },
    close() {
      if (!closed) {
        stop();
        closed = true;
        broadcasterId = undefined;
        if (!options.helix) helix.close();
      }
    },
  };
}
