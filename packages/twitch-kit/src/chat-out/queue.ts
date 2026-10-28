export interface Say {
  // Only app-generated output belongs here; incoming chat must never be forwarded.
  text: string;
  origin: "twitch" | "sim";
  priority: "reply" | "ambient";
  replyParentMessageId?: string;
}
export interface QueuedSay extends Say {
  id: string;
  enqueuedAt: number;
}
export type DropReason =
  | "duplicate"
  | "ambient_evicted"
  | "queue_full"
  | "expired"
  | "quiet_mode"
  | "connection_changed"
  | "http_error"
  | "network_error"
  | "twitch_dropped"
  | "invalid_response"
  | "invalid_message"
  | "canceled"
  | "automod_held"
  | "banned"
  | "slow_mode"
  | "followers_only"
  | "subscribers_only"
  | "rate_limit_exceeded";
export interface ChatOutLog {
  id: string;
  at: number;
  origin: Say["origin"];
  text: string;
  kind: "sent" | "dropped" | "would-have-said";
  is_sent: boolean;
  drop_reason: DropReason | null;
  httpStatus: number | null;
}
export interface ChatOutState {
  quiet: boolean;
  pending: QueuedSay[];
  inFlight: QueuedSay | null;
  attempts: number[];
  sentIds: { id: string; at: number }[];
  logs: ChatOutLog[];
  serial: number;
  logSerial: number;
}
type Input =
  | { type: "enqueue"; item: Say }
  | { type: "poll" | "permit" | "reset" }
  | { type: "quiet"; value: boolean }
  | {
      type: "result";
      id: string;
      sent: boolean;
      messageId?: string;
      reason?: DropReason;
      httpStatus?: number;
    };
export function initialChatOutState(quiet = false): ChatOutState {
  return {
    quiet,
    pending: [],
    inFlight: null,
    attempts: [],
    sentIds: [],
    logs: [],
    serial: 0,
    logSerial: 0,
  };
}
export function truncateMessage(value: string): string {
  const characters: string[] = [];
  for (const character of value.trim()) {
    characters.push(character);
    if (characters.length > 500) break;
  }
  if (characters.length <= 500) return characters.join("");
  let prefix = characters.slice(0, 499).join("");
  const boundary = prefix.search(/\s+\S*$/u);
  if (boundary > 0) prefix = prefix.slice(0, boundary);
  return `${prefix.trimEnd()}…`;
}
export function stepChatOut(previous: ChatOutState, input: Input, now: number, live: boolean) {
  const state = structuredClone(previous);
  const effects: { type: "send"; item: QueuedSay }[] = [];
  let accepted = false;
  let allowed = false;
  let waitMs = 0;
  const log = (
    item: QueuedSay,
    kind: ChatOutLog["kind"],
    reason: DropReason | null = null,
    httpStatus: number | null = null,
  ) => {
    state.logs.push({
      id: `chat-log:${++state.logSerial}`,
      at: now,
      origin: item.origin,
      text: item.text,
      kind,
      is_sent: kind === "sent",
      drop_reason: reason,
      httpStatus,
    });
    state.logs = state.logs.slice(-100);
  };
  state.attempts = state.attempts.filter((at) => now - at < 30_000);
  state.sentIds = state.sentIds.filter((entry) => now - entry.at < 120_000);
  state.pending = state.pending.filter((item) => {
    if (now - item.enqueuedAt < 30_000) return true;
    log(item, "dropped", "expired");
    return false;
  });
  const discard = (reason: DropReason) => {
    for (const item of state.pending) log(item, "dropped", reason);
    state.pending = [];
  };
  const rateWait = () =>
    Math.max(
      0,
      state.attempts.length ? state.attempts[state.attempts.length - 1] + 1000 - now : 0,
      state.attempts.length >= 18 ? state.attempts[0] + 30_000 - now : 0,
    );
  if (input.type === "enqueue") {
    const item: QueuedSay = {
      ...input.item,
      text: truncateMessage(input.item.text),
      id: `say:${++state.serial}`,
      enqueuedAt: now,
    };
    if (
      !item.text ||
      !["twitch", "sim"].includes(item.origin) ||
      !["reply", "ambient"].includes(item.priority) ||
      (item.replyParentMessageId !== undefined &&
        !/^[\w:-]{1,128}$/.test(item.replyParentMessageId))
    )
      log(item, "dropped", "invalid_message");
    else if (item.origin === "sim" || !live) {
      log(item, "would-have-said");
      accepted = true;
    } else if (state.quiet) log(item, "dropped", "quiet_mode");
    else if (
      [...state.pending, ...(state.inFlight ? [state.inFlight] : [])].some(
        (entry) => entry.text === item.text,
      )
    )
      log(item, "dropped", "duplicate");
    else {
      state.pending.push(item);
      while (state.pending.length > 10) {
        const ambient = state.pending.findIndex((entry) => entry.priority === "ambient");
        if (ambient < 0) break;
        log(state.pending.splice(ambient, 1)[0], "dropped", "ambient_evicted");
      }
      if (state.pending.length > 100) {
        const newest = state.pending.pop();
        if (newest) log(newest, "dropped", "queue_full");
      }
      accepted = state.pending.some((entry) => entry.id === item.id);
    }
  } else if (input.type === "quiet") {
    state.quiet = input.value;
    if (input.value) discard("quiet_mode");
  } else if (input.type === "reset") {
    discard("connection_changed");
    if (state.inFlight) log(state.inFlight, "dropped", "connection_changed");
    state.inFlight = null;
  } else if (input.type === "poll") {
    if (!live) {
      for (const item of state.pending) log(item, "would-have-said");
      state.pending = [];
    } else if (!state.quiet && !state.inFlight && state.pending.length && rateWait() === 0) {
      let index = state.pending.findIndex((item) => item.priority === "reply");
      if (index < 0) index = 0;
      state.inFlight = state.pending.splice(index, 1)[0];
      effects.push({ type: "send", item: state.inFlight });
    }
  } else if (input.type === "permit" && state.inFlight) {
    const item = state.inFlight;
    if (item.origin === "sim" || !live) {
      log(item, "would-have-said");
      state.inFlight = null;
    } else if (state.quiet || now - item.enqueuedAt >= 30_000) {
      log(item, "dropped", state.quiet ? "quiet_mode" : "expired");
      state.inFlight = null;
    } else {
      waitMs = rateWait();
      if (waitMs === 0) {
        allowed = true;
        state.attempts.push(now);
      }
    }
  } else if (input.type === "result" && state.inFlight?.id === input.id) {
    const item = state.inFlight;
    log(
      item,
      input.sent ? "sent" : "dropped",
      input.sent ? null : (input.reason ?? "twitch_dropped"),
      input.httpStatus ?? null,
    );
    if (input.sent && input.messageId)
      state.sentIds = [...state.sentIds, { id: input.messageId, at: now }].slice(-100);
    state.inFlight = null;
  }
  return { state, effects, accepted, allowed, waitMs };
}
