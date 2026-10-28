import { setTimeout as delay } from "node:timers/promises";
import type { AuthRole } from "../auth.ts";
import { record } from "../eventsub/protocol.ts";
import type { HelixClient } from "../helix.ts";
import type { ChatOutLog, DropReason, QueuedSay, Say } from "./queue.ts";
import { initialChatOutState, stepChatOut } from "./queue.ts";

export interface ChatOutPublicState {
  quiet: boolean;
  pending: number;
  sending: boolean;
  sender: AuthRole | null;
  logs: ChatOutLog[];
}
interface Options {
  helix: HelixClient;
  auth: {
    identity: (role: AuthRole) => string | undefined;
    accessToken: (role: AuthRole) => string | undefined;
  };
  now?: () => number;
  wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  autoTick?: boolean;
  quiet?: boolean;
  onChange?: () => void;
}
const providerReasons: DropReason[] = [
  "automod_held",
  "banned",
  "slow_mode",
  "followers_only",
  "subscribers_only",
  "rate_limit_exceeded",
  "duplicate",
];
export function createChatOut(options: Options) {
  const now = options.now ?? Date.now;
  const wait = options.wait ?? ((ms, signal) => delay(ms, undefined, { signal }));
  let state = initialChatOutState(options.quiet);
  let closed = false;
  let work: Promise<void> | null = null;
  let controller: AbortController | null = null;
  let activeSender: { role: AuthRole; id: string } | null = null;
  let broadcaster = options.auth.identity("broadcaster");
  const live = () =>
    Boolean(options.auth.identity("broadcaster") && options.auth.accessToken("broadcaster"));
  const sender = (): AuthRole | null =>
    !live()
      ? null
      : options.auth.identity("bot") && options.auth.accessToken("bot")
        ? "bot"
        : "broadcaster";
  const publicState = (): ChatOutPublicState =>
    structuredClone({
      quiet: state.quiet,
      pending: state.pending.length,
      sending: state.inFlight !== null,
      sender: closed ? null : sender(),
      logs: state.logs,
    });
  let lastProjection = JSON.stringify(publicState());
  function dispatch(input: Parameters<typeof stepChatOut>[1]) {
    const next = stepChatOut(state, input, now(), live());
    state = next.state;
    const projection = JSON.stringify(publicState());
    if (projection !== lastProjection) {
      lastProjection = projection;
      options.onChange?.();
    }
    return next;
  }
  async function deliver(item: QueuedSay) {
    const role = sender();
    const target = options.auth.identity("broadcaster");
    const id = role ? options.auth.identity(role) : undefined;
    if (!role || !target || !id) {
      dispatch({ type: "permit" });
      return;
    }
    const abort = new AbortController();
    controller = abort;
    activeSender = { role, id };
    const deadline = item.enqueuedAt + 30_000;
    try {
      const response = await options.helix.request({
        role,
        path: "/chat/messages",
        method: "POST",
        signal: abort.signal,
        deadline,
        body: {
          broadcaster_id: target,
          sender_id: id,
          message: item.text,
          ...(item.replyParentMessageId
            ? { reply_parent_message_id: item.replyParentMessageId }
            : {}),
        },
        beforeAttempt: async (signal) => {
          while (!closed && !signal.aborted && state.inFlight?.id === item.id) {
            if (
              options.auth.identity("broadcaster") !== target ||
              options.auth.identity(role) !== id
            )
              return false;
            const permission = dispatch({ type: "permit" });
            if (permission.allowed) return true;
            if (!state.inFlight) return false;
            await wait(Math.min(permission.waitMs, Math.max(1, deadline - now())), signal);
          }
          return false;
        },
      });
      if (closed || state.inFlight?.id !== item.id) {
        await response.body?.cancel();
        return;
      }
      if (!response.ok) {
        await response.body?.cancel();
        dispatch({
          type: "result",
          id: item.id,
          sent: false,
          reason: "http_error",
          httpStatus: response.status,
        });
        return;
      }
      const body = record(await response.json());
      const result = record(Array.isArray(body.data) ? body.data[0] : null);
      if (
        result.is_sent === true &&
        typeof result.message_id === "string" &&
        result.message_id.length > 0 &&
        result.message_id.length <= 128
      )
        dispatch({
          type: "result",
          id: item.id,
          sent: true,
          messageId: result.message_id,
          httpStatus: response.status,
        });
      else {
        const code = record(result.drop_reason).code;
        const reason: DropReason =
          result.is_sent !== false
            ? "invalid_response"
            : providerReasons.includes(code as DropReason)
              ? (code as DropReason)
              : "twitch_dropped";
        dispatch({ type: "result", id: item.id, sent: false, reason, httpStatus: response.status });
      }
    } catch {
      if (!closed)
        dispatch({
          type: "result",
          id: item.id,
          sent: false,
          reason: state.quiet
            ? "quiet_mode"
            : now() >= deadline
              ? "expired"
              : abort.signal.aborted
                ? "canceled"
                : "network_error",
        });
    } finally {
      if (controller === abort) {
        controller = null;
        activeSender = null;
      }
    }
  }
  function tick(): Promise<void> {
    if (closed || work) return work ?? Promise.resolve();
    const effect = dispatch({ type: "poll" }).effects[0];
    if (!effect) return Promise.resolve();
    work = deliver(effect.item).finally(() => {
      work = null;
    });
    return work;
  }
  const timer =
    options.autoTick === false
      ? null
      : setInterval(() => {
          void tick();
        }, 100);
  timer?.unref();
  return {
    publicState,
    tick,
    enqueue(item: Say) {
      if (closed) return false;
      const accepted = dispatch({ type: "enqueue", item }).accepted;
      if (options.autoTick !== false) void tick();
      return accepted;
    },
    setQuiet(value: boolean) {
      if (!closed) {
        dispatch({ type: "quiet", value });
        if (value) controller?.abort();
      }
    },
    syncAuth() {
      if (closed) return;
      const identity = options.auth.identity("broadcaster");
      if (identity !== broadcaster) {
        broadcaster = identity;
        controller?.abort();
        dispatch({ type: "reset" });
      } else if (activeSender && options.auth.identity(activeSender.role) !== activeSender.id)
        controller?.abort();
    },
    wasSent(messageId: string) {
      return (
        !closed &&
        state.sentIds.some((entry) => entry.id === messageId && now() - entry.at < 120_000)
      );
    },
    close() {
      if (!closed) {
        controller?.abort();
        if (timer) clearInterval(timer);
        dispatch({ type: "reset" });
        closed = true;
      }
    },
  };
}
