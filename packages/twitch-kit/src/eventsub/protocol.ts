// This module is pure: the runner supplies time and executes the returned effects.
export interface EventSubFrame {
  metadata: { message_id: string; message_type: string; message_timestamp: string };
  payload: Record<string, unknown>;
}

interface SocketState {
  id: string;
  deadline: number;
  timeout: number;
  welcomed: boolean;
}
export interface ProtocolState {
  status: "disconnected" | "connecting" | "connected" | "lost";
  url: string;
  primary: SocketState | null;
  candidate: SocketState | null;
  serial: number;
  backoff: number;
  retryAt: number | null;
  sessionStartedAt: number | null;
  seen: { id: string; at: number }[];
}
export type ProtocolInput =
  | { type: "start"; url: string }
  | { type: "stop" }
  | { type: "tick" }
  | { type: "closed"; socket: string; code: number }
  | { type: "frame"; socket: string; frame: unknown };
export type ProtocolEffect =
  | { type: "open"; socket: string; url: string }
  | { type: "close"; socket: string }
  | { type: "subscribe"; session: string; socket: string; deadline: number }
  | { type: "notification" | "revocation"; frame: EventSubFrame }
  | { type: "protocol-error"; code: number };

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
export function readFrame(value: unknown): EventSubFrame | null {
  const source = record(value);
  const metadata = record(source.metadata);
  if (
    typeof metadata.message_id !== "string" ||
    !metadata.message_id ||
    metadata.message_id.length > 256 ||
    typeof metadata.message_type !== "string" ||
    typeof metadata.message_timestamp !== "string" ||
    !Number.isFinite(Date.parse(metadata.message_timestamp))
  )
    return null;
  return {
    metadata: {
      message_id: metadata.message_id,
      message_type: metadata.message_type,
      message_timestamp: metadata.message_timestamp,
    },
    payload: record(source.payload),
  };
}
export function initialProtocolState(): ProtocolState {
  return {
    status: "disconnected",
    url: "",
    primary: null,
    candidate: null,
    serial: 0,
    backoff: 0,
    retryAt: null,
    sessionStartedAt: null,
    seen: [],
  };
}
export function stepProtocol(
  previous: ProtocolState,
  input: ProtocolInput,
  now: number,
): { state: ProtocolState; effects: ProtocolEffect[] } {
  const state = structuredClone(previous);
  const effects: ProtocolEffect[] = [];
  const open = (url: string): SocketState => {
    const id = `socket:${++state.serial}`;
    effects.push({ type: "open", socket: id, url });
    return { id, deadline: now + 10_000, timeout: 35_000, welcomed: false };
  };
  const closeAll = () => {
    for (const socket of [state.primary, state.candidate])
      if (socket) effects.push({ type: "close", socket: socket.id });
    state.primary = state.candidate = null;
  };
  const lost = () => {
    closeAll();
    state.status = "lost";
    state.sessionStartedAt = null;
    state.retryAt = now + [1000, 2000, 5000, 10000, 30000][Math.min(state.backoff++, 4)];
  };
  if (input.type === "stop") {
    closeAll();
    state.status = "disconnected";
    state.retryAt = null;
    state.sessionStartedAt = null;
  } else if (input.type === "start") {
    closeAll();
    state.url = input.url;
    state.backoff = 0;
    state.retryAt = null;
    state.status = "connecting";
    state.primary = open(input.url);
  } else if (input.type === "tick") {
    if (state.candidate && now >= state.candidate.deadline) lost();
    else if (state.primary && now >= state.primary.deadline) lost();
    else if (state.retryAt !== null && now >= state.retryAt) {
      state.retryAt = null;
      state.status = "connecting";
      state.primary = open(state.url);
    }
  } else if (input.type === "closed") {
    if (state.primary?.id === input.socket || state.candidate?.id === input.socket) {
      if (input.code === 4001 || input.code === 4003)
        effects.push({ type: "protocol-error", code: input.code });
      // If the retiring socket closes during a handoff, the candidate can still finish.
      if (state.primary?.id === input.socket && state.candidate) state.primary = null;
      else lost();
    }
  } else {
    const socket = [state.primary, state.candidate].find((item) => item?.id === input.socket);
    const frame = readFrame(input.frame);
    if (!socket || !frame) return { state, effects };
    const type = frame.metadata.message_type;
    const session = record(frame.payload.session);
    if (type === "session_welcome" && !socket.welcomed) {
      if (
        typeof session.id !== "string" ||
        !session.id ||
        typeof session.keepalive_timeout_seconds !== "number" ||
        !Number.isFinite(session.keepalive_timeout_seconds) ||
        session.keepalive_timeout_seconds < 1 ||
        session.keepalive_timeout_seconds > 600
      )
        return { state, effects };
      socket.welcomed = true;
      socket.timeout = (session.keepalive_timeout_seconds + 5) * 1000;
      socket.deadline = now + socket.timeout;
      if (state.candidate?.id === socket.id) {
        if (state.primary) effects.push({ type: "close", socket: state.primary.id });
        state.primary = socket;
        state.candidate = null;
      } else
        effects.push({
          type: "subscribe",
          session: session.id,
          socket: socket.id,
          deadline: now + 10_000,
        });
      state.sessionStartedAt = now;
      state.status = "connected";
      state.backoff = 0;
    } else if (socket.welcomed) {
      socket.deadline = now + socket.timeout;
      if (
        type === "session_reconnect" &&
        !state.candidate &&
        typeof session.reconnect_url === "string"
      ) {
        try {
          const target = new URL(session.reconnect_url);
          const base = new URL(state.url);
          if (target.origin === base.origin && !target.username && !target.password && !target.hash)
            state.candidate = open(session.reconnect_url);
        } catch {
          /* Malformed provider frames cannot change our destination. */
        }
      } else if (type === "notification" || type === "revocation") {
        state.seen = state.seen.filter((entry) => now - entry.at < 600_000);
        if (!state.seen.some((entry) => entry.id === frame.metadata.message_id)) {
          state.seen.push({ id: frame.metadata.message_id, at: now });
          state.seen = state.seen.slice(-2000);
          effects.push({ type, frame });
        }
      }
    }
  }
  return { state, effects };
}
